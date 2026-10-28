import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BridgeStateSchema, MODULE_IDS, type ScreenCommand } from '@hearth/shared';
import { ModulesService } from './modules-repository.js';
import { buildServer } from './app.js';
import { SqliteAdminRepository } from './admin-repository.js';
import type { CompanionAuthRepository } from './companion-auth.js';
import { applyMigrations } from './database.js';
import { DEMO_HOUSEHOLD_ID, DEMO_NOW } from './demo/seed.js';
import { HomeAssistantBridgeService } from './home-assistant-bridge.js';
import { SqliteHearthRepository } from './sqlite-hearth-repository.js';
import { InMemoryHearthRepository, RepositoryError } from './repository.js';

const instances: ReturnType<typeof buildServer>[] = [];
const databases: Database.Database[] = [];
afterEach(async () => {
  await Promise.all(instances.splice(0).map((app) => app.close()));
  for (const db of databases.splice(0)) db.close();
});
const secret = `ha_${'a'.repeat(43)}`;
const headers = { authorization: `HearthAutomation ${secret}` };
const adult = { cookie: 'hearth_session=fixture_adult' };
const base = `/api/v1/households/${DEMO_HOUSEHOLD_ID}/home-assistant-bridge`;

async function harness(privateMode = false, persistentChores = false) {
  const db = new Database(':memory:');
  databases.push(db);
  applyMigrations(db);
  let time = Date.parse(DEMO_NOW);
  const now = () => new Date(time);
  const admin = new SqliteAdminRepository(db, { now });
  const repository = persistentChores
    ? new SqliteHearthRepository(db, { clock: { now } })
    : new InMemoryHearthRepository();
  const service = new HomeAssistantBridgeService(admin, repository, { database: db, now });
  const tvSecret = 'fixture_tv_pairing_secret_012345678901234567890123';
  const pairing = await admin.createPairing(
    'Fixture TV',
    'request_pair',
    createHash('sha256').update(tvSecret).digest('hex'),
    'fixture-1',
  );
  const device = await admin.approvePairing(
    DEMO_HOUSEHOLD_ID,
    'member_maya',
    pairing.code,
    'request_approve',
  );
  await admin.exchangeTvPairing(pairing.id, tvSecret, 'request_exchange');
  const authenticate = (token: string) => {
    if (token !== 'fixture_adult') throw new RepositoryError('UNAUTHENTICATED', 'Sign in.');
    return {
      authenticated: true as const,
      householdId: DEMO_HOUSEHOLD_ID,
      memberId: 'member_maya',
      displayName: 'Maya',
      expiresAt: '2027-01-01T00:00:00.000Z',
    };
  };
  const companionAuth = {
    session: authenticate,
    authenticate: (token: string) => ({
      id: authenticate(token).memberId,
      type: 'member',
      source: 'companion',
    }),
    invalidateBrowserSession: vi.fn(),
    clearSessionCookie: () => '',
  } as unknown as CompanionAuthRepository;
  const app = buildServer({
    logger: false,
    adminRepository: admin,
    repository,
    homeAssistantBridge: service,
    ...(privateMode
      ? {
          companionAuth,
          runtime: { mode: 'private' as const, householdId: DEMO_HOUSEHOLD_ID, clock: { now } },
        }
      : {}),
  });
  instances.push(app);
  const input = {
    requestId: 'request_grant',
    secret,
    screenIds: [device.id],
    shareChores: true,
    shareCalendar: true,
    controlChores: false,
  };
  const grant = () => app.inject({ method: 'POST', url: base, headers: adult, payload: input });
  const present = (extra: Record<string, unknown> = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/device-sessions/current/presentation',
      headers: { authorization: `Bearer ${tvSecret}` },
      payload: {
        instanceId: 'instance_first',
        tab: 'today',
        acknowledgedCommandId: null,
        ...extra,
      },
    });
  const navigate = (requestId = 'request_navigate', tab = 'weather', id = device.id) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/home-assistant/screens/${id}/navigation`,
      headers,
      payload: { requestId, tab },
    });
  const state = () => app.inject({ url: '/api/v1/home-assistant/state', headers });
  return {
    db,
    app,
    admin,
    repository,
    service,
    device,
    companionAuth,
    tvSecret,
    now,
    input,
    grant,
    present,
    navigate,
    state,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('Home Assistant inbound authority and projection', () => {
  it('applies an explicitly approved Morning Routine tab only after exact screen acknowledgement', async () => {
    const h = await harness(true);
    const modules = new ModulesService();
    h.service.setModules(modules);
    modules.update(
      DEMO_HOUSEHOLD_ID,
      'morningRoutine',
      { requestId: 'request_morning_on', enabled: true },
      { id: 'member_maya', type: 'member', source: 'companion' },
    );
    expect(
      (
        await h.app.inject({
          method: 'POST',
          url: base,
          headers: adult,
          payload: { ...h.input, moduleIds: [...MODULE_IDS] },
        })
      ).statusCode,
    ).toBe(200);
    expect((await h.present()).statusCode).toBe(200);
    const navigation = await h.navigate('request_morning_nav', 'morning_routine');
    expect(navigation.statusCode).toBe(200);
    expect(navigation.json().command.status).toBe('pending');
    expect((await h.state()).json().screens[0].currentTab).toBe('today');
    await h.present({
      tab: 'morning_routine',
      acknowledgedCommandId: navigation.json().command.id,
    });
    expect((await h.state()).json().screens[0]).toMatchObject({
      currentTab: 'morning_routine',
      command: { status: 'applied' },
    });
    modules.update(
      DEMO_HOUSEHOLD_ID,
      'morningRoutine',
      { requestId: 'request_morning_off', enabled: false },
      { id: 'member_maya', type: 'member', source: 'companion' },
    );
    expect((await h.navigate('request_morning_disabled', 'morning_routine')).statusCode).toBe(403);
  });
  it('requires adult authority, stores only a digest and makes grant retries exact', async () => {
    const h = await harness(true);
    expect((await h.app.inject({ method: 'POST', url: base, payload: h.input })).statusCode).toBe(
      401,
    );
    expect(
      (
        await h.app.inject({
          method: 'POST',
          url: base,
          headers: { authorization: `Bearer ${h.tvSecret}`, ...adult },
          payload: h.input,
        })
      ).statusCode,
    ).toBe(403);
    expect((await h.grant()).statusCode).toBe(200);
    expect((await h.grant()).json()).toMatchObject({ replayed: true });
    expect(
      (
        await h.app.inject({
          method: 'POST',
          url: base,
          headers: adult,
          payload: { ...h.input, shareCalendar: false },
        })
      ).statusCode,
    ).toBe(409);
    const stored = JSON.stringify(
      h.db.prepare('SELECT * FROM home_assistant_bridge_connections').all(),
    );
    expect(stored).not.toContain(secret);
    expect(stored).toContain(createHash('sha256').update(secret).digest('hex'));
    expect((await h.app.inject({ url: base, headers: adult })).body).not.toContain(secret);
  });
  it('fails closed outside the dedicated routes including mixed adult cookies', async () => {
    const h = await harness(true);
    await h.grant();
    for (const url of [
      '/api/v1/runtime',
      `/api/v1/households/${DEMO_HOUSEHOLD_ID}/today?date=2026-08-03`,
      base,
      '/api/v1/auth/status',
    ])
      expect((await h.app.inject({ url, headers: { ...headers, ...adult } })).statusCode).toBe(403);
    expect(
      (
        await h.app.inject({
          url: '/api/v1/home-assistant/state',
          headers: { ...headers, ...adult },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await h.app.inject({ url: '/api/v1/home-assistant/state', headers: adult })).statusCode,
    ).toBe(401);
    expect(
      (
        await h.app.inject({
          url: '/api/v1/home-assistant/state',
          headers: { authorization: `Bearer ${h.tvSecret}` },
        })
      ).statusCode,
    ).toBe(401);
    expect(h.companionAuth.invalidateBrowserSession).not.toHaveBeenCalled();
  });
  it('projects only permitted safe household information with no provider/account data', async () => {
    const h = await harness();
    await h.grant();
    await h.present();
    const response = await h.state();
    expect(response.statusCode).toBe(200);
    const state = BridgeStateSchema.parse(response.json());
    expect(state.screens).toHaveLength(1);
    expect(state.screens[0]).toMatchObject({ id: h.device.id, online: true, currentTab: 'today' });
    expect(state.chores?.items.length).toBeGreaterThan(0);
    expect(state.calendar?.events.length).toBeGreaterThan(0);
    for (const event of state.calendar!.events)
      expect(Object.keys(event).sort()).toEqual(
        ['id', 'title', 'start', 'end', 'startLocalDate', 'endLocalDate', 'allDay'].sort(),
      );
    for (const forbidden of [
      'providerVersion',
      'location',
      'recurrenceMasterId',
      'capabilities',
      'avatarUrl',
      secret,
      h.tvSecret,
    ])
      expect(response.body).not.toContain(forbidden);
    expect(response.headers['cache-control']).toContain('no-store');
  });
  it('disabled shares are null and cannot be read through range endpoints', async () => {
    const h = await harness();
    await h.service.grant(DEMO_HOUSEHOLD_ID, 'member_maya', {
      ...h.input,
      shareChores: false,
      shareCalendar: false,
    });
    expect((await h.state()).json()).toMatchObject({ chores: null, calendar: null });
    expect(
      (
        await h.app.inject({
          url: '/api/v1/home-assistant/calendar?start=2026-08-02T00:00:00Z&end=2026-08-04T00:00:00Z',
          headers,
        })
      ).statusCode,
    ).toBe(403);
  });
  it('provider/read failure does not disable screen control or report false empty data', async () => {
    const h = await harness();
    await h.grant();
    await h.present();
    vi.spyOn(h.repository, 'getChores').mockRejectedValue(new Error('fixture unavailable'));
    vi.spyOn(h.repository, 'getWeek').mockRejectedValue(new Error('fixture unavailable'));
    expect((await h.state()).json()).toMatchObject({
      chores: null,
      calendar: null,
      screens: [{ online: true }],
    });
    expect((await h.navigate()).statusCode).toBe(200);
  });
});

describe('Home Assistant optional chore control', () => {
  const request = (
    h: Awaited<ReturnType<typeof harness>>,
    id: string,
    payload: Record<string, unknown>,
  ) =>
    h.app.inject({
      method: 'POST',
      url: `/api/v1/home-assistant/chores/${id}/completion`,
      headers,
      payload,
    });
  async function setup() {
    const h = await harness(true, true);
    h.input.controlChores = true;
    h.input.screenIds = [];
    expect((await h.grant()).statusCode).toBe(200);
    const state = (await h.state()).json();
    const item = state.chores.items.find((entry: { state: string }) => entry.state === 'pending');
    return {
      h,
      item,
      input: {
        requestId: 'request_chore_complete',
        localDate: state.chores.localDate,
        isCompleted: true,
        completionId: null,
      },
    };
  }
  it('does not upgrade read-only or legacy grants and requires sharing before control', async () => {
    const h = await harness(true, true);
    const invalid = await h.app.inject({
      method: 'POST',
      url: base,
      headers: adult,
      payload: { ...h.input, shareChores: false, controlChores: true },
    });
    expect(invalid.statusCode).toBe(400);
    const { controlChores: _unused, ...legacy } = h.input;
    expect(
      (await h.app.inject({ method: 'POST', url: base, headers: adult, payload: legacy }))
        .statusCode,
    ).toBe(200);
    const state = (await h.state()).json();
    expect(state.permissions.controlChores).toBe(false);
    expect(
      state.chores.items.every(
        (entry: { completionId: string | null }) => entry.completionId === null,
      ),
    ).toBe(true);
    expect(
      (
        await request(h, state.chores.items[0].id, {
          requestId: 'request_forbidden',
          localDate: state.chores.localDate,
          isCompleted: true,
          completionId: null,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      h.db.prepare('SELECT count(*) AS n FROM home_assistant_bridge_chore_receipts').get(),
    ).toEqual({ n: 0 });
  });
  it('completes and reopens without a TV, replays exactly and audits the automation once', async () => {
    const { h, item, input } = await setup();
    const first = await request(h, item.id, input);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      id: item.id,
      state: 'completed',
      replayed: false,
      completionId: expect.any(String),
    });
    expect(first.headers['cache-control']).toBe('private, no-store');
    expect((await request(h, item.id, input)).json()).toEqual({ ...first.json(), replayed: true });
    expect(
      (await h.state()).json().chores.items.find((value: { id: string }) => value.id === item.id)
        .state,
    ).toBe('completed');
    const undo = {
      ...input,
      requestId: 'request_chore_reopen',
      isCompleted: false,
      completionId: first.json().completionId,
    };
    expect((await request(h, item.id, undo)).json()).toMatchObject({
      state: 'pending',
      completionId: null,
      replayed: false,
    });
    expect((await request(h, item.id, undo)).json()).toMatchObject({
      state: 'pending',
      replayed: true,
    });
    const audits = h.db
      .prepare(
        "SELECT actor_type,actor_id,source_channel AS source,action_type AS action FROM audit_events WHERE target_id = ? AND result IN ('succeeded','reversed') ORDER BY rowid",
      )
      .all(item.id);
    expect(audits).toEqual([
      {
        actor_type: 'service',
        actor_id: 'service_home_assistant',
        source: 'automation',
        action: 'chore.complete',
      },
      {
        actor_type: 'service',
        actor_id: 'service_home_assistant',
        source: 'automation',
        action: 'chore.undo',
      },
    ]);
    expect((await request(h, item.id, { ...input, localDate: '2026-08-04' })).statusCode).toBe(409);
    expect((await request(h, 'occurrence_other', input)).statusCode).toBe(409);
  });
  it('rejects stale dates, unknown targets, detail edits, non-automation credentials and admin routes', async () => {
    const { h, item, input } = await setup();
    expect((await request(h, item.id, { ...input, localDate: '2026-08-02' })).statusCode).toBe(409);
    expect(
      (await request(h, 'occurrence_foreign', { ...input, requestId: 'request_missing' }))
        .statusCode,
    ).toBe(404);
    expect((await request(h, item.id, { ...input, title: 'Rename' })).statusCode).toBe(400);
    expect((await request(h, item.id, { ...input, isCompleted: false })).statusCode).toBe(400);
    const url = `/api/v1/home-assistant/chores/${item.id}/completion`;
    for (const auth of [adult, { authorization: `Bearer ${h.tvSecret}` }, { ...headers, ...adult }])
      expect(
        (await h.app.inject({ method: 'POST', url, headers: auth, payload: input })).statusCode,
      ).toBe(401);
    for (const suffix of ['skips', 'reassignments', 'completions'])
      expect(
        (
          await h.app.inject({
            method: 'POST',
            url: `/api/v1/households/${DEMO_HOUSEHOLD_ID}/chore-occurrences/${item.id}/${suffix}`,
            headers,
            payload: input,
          })
        ).statusCode,
      ).toBe(403);
  });
  it('a stale reopen cannot undo a newer completion', async () => {
    const { h, item, input } = await setup();
    const first = (await request(h, item.id, input)).json();
    await request(h, item.id, {
      ...input,
      requestId: 'request_undo_first',
      isCompleted: false,
      completionId: first.completionId,
    });
    const second = (
      await request(h, item.id, { ...input, requestId: 'request_complete_second' })
    ).json();
    expect(
      (
        await request(h, item.id, {
          ...input,
          requestId: 'request_stale_undo',
          isCompleted: false,
          completionId: first.completionId,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (await h.state()).json().chores.items.find((value: { id: string }) => value.id === item.id)
        .completionId,
    ).toBe(second.completionId);
  });
  it('keeps locked, skipped and otherwise non-pending chores protected by the domain', async () => {
    const { h, item, input } = await setup();
    await h.repository.skip(DEMO_HOUSEHOLD_ID, item.id, 'request_skip', 'Not today', {
      id: 'member_maya',
      type: 'member',
      source: 'companion',
    });
    expect((await request(h, item.id, input)).statusCode).toBe(409);
    h.repository.setScenario('permission');
    expect(
      (await request(h, 'occurrence_school_bag', { ...input, requestId: 'request_locked' }))
        .statusCode,
    ).toBe(403);
  });
  it('recovers a domain-committed receipt after restart and midnight without executing again', async () => {
    const { h, item, input } = await setup();
    const result = (await request(h, item.id, input)).json();
    h.db
      .prepare(
        "UPDATE home_assistant_bridge_chore_receipts SET record_json = json_set(record_json,'$.result',NULL)",
      )
      .run();
    h.advance(86400000);
    const restarted = new HomeAssistantBridgeService(h.admin, h.repository, {
      database: h.db,
      now: h.now,
    });
    const complete = vi.spyOn(h.repository, 'complete');
    expect(await restarted.setChoreCompletion(secret, item.id, input)).toEqual({
      ...result,
      replayed: true,
    });
    expect(complete).not.toHaveBeenCalled();
    await expect(
      restarted.setChoreCompletion(secret, item.id, { ...input, localDate: '2026-08-04' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await restarted.revoke(DEMO_HOUSEHOLD_ID, 'member_maya', 'request_revoke_control');
    await expect(restarted.setChoreCompletion(secret, item.id, input)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });
  it('serializes concurrent exact retries without duplicate audit or domain changes', async () => {
    const { h, item, input } = await setup();
    const results = await Promise.all([request(h, item.id, input), request(h, item.id, input)]);
    expect(results.map((result) => result.statusCode)).toEqual([200, 200]);
    expect(results.map((result) => result.json().replayed).sort()).toEqual([false, true]);
    expect(
      h.db
        .prepare(
          "SELECT count(*) AS n FROM audit_events WHERE target_id = ? AND action_type = 'chore.complete' AND result = 'succeeded'",
        )
        .get(item.id),
    ).toEqual({ n: 1 });
  });
  it('rechecks revocation after an in-flight chore read, before any mutation', async () => {
    const { h, item, input } = await setup();
    const snapshot = await h.repository.getChores(DEMO_HOUSEHOLD_ID, input.localDate);
    let release!: () => void;
    let entered!: () => void;
    const reading = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(h.repository, 'getChores').mockImplementationOnce(async () => {
      entered();
      await gate;
      return snapshot;
    });
    const pending = request(h, item.id, input).then((response) => response);
    await reading;
    await h.service.revoke(DEMO_HOUSEHOLD_ID, 'member_maya', 'request_revoke_during_read');
    release();
    expect((await pending).statusCode).toBe(401);
    expect(
      h.db.prepare('SELECT count(*) AS n FROM home_assistant_bridge_chore_receipts').get(),
    ).toEqual({ n: 0 });
  });
  it('bounds new chore requests without preventing exact retry', async () => {
    const { h, item, input } = await setup();
    expect((await request(h, item.id, input)).statusCode).toBe(200);
    for (let index = 1; index < 30; index++) {
      expect(
        (await request(h, item.id, { ...input, requestId: `request_chore_rate_${index}` }))
          .statusCode,
      ).toBe(409);
    }
    const overflow = await request(h, item.id, { ...input, requestId: 'request_rate_overflow' });
    expect(overflow.statusCode).toBe(409);
    expect(overflow.body).toContain('Too many chore changes');
    expect(
      h.db.prepare('SELECT count(*) AS n FROM home_assistant_bridge_chore_receipts').get(),
    ).toEqual({ n: 30 });
    expect((await request(h, item.id, input)).json().replayed).toBe(true);
  });
});

describe('paired screen presentation and navigation', () => {
  it('keeps cached grants and pending commands aligned with SQLite after transaction rollback', async () => {
    const h = await harness();
    await h.grant();
    await h.present();
    const first = (await h.navigate()).json().command;
    const audit = vi.spyOn(h.admin, 'recordActivity').mockImplementationOnce(() => {
      throw new Error('fixture storage failure');
    });
    await expect(
      h.service.navigate(secret, h.device.id, 'request_retry_after_failure', 'chores'),
    ).rejects.toThrow('fixture storage failure');
    expect((await h.state()).json().screens[0].command).toMatchObject({
      id: first.id,
      status: 'pending',
    });
    expect(h.db.prepare('SELECT count(*) AS n FROM home_assistant_bridge_commands').get()).toEqual({
      n: 1,
    });
    audit.mockImplementationOnce(() => {
      throw new Error('fixture storage failure');
    });
    await expect(
      h.service.revoke(DEMO_HOUSEHOLD_ID, 'member_maya', 'request_failed_revoke'),
    ).rejects.toThrow('fixture storage failure');
    expect(h.service.authenticate(secret)).toBeDefined();
    expect(h.db.prepare('SELECT revoked_at FROM home_assistant_bridge_connections').get()).toEqual({
      revoked_at: null,
    });
    expect((await h.state()).json().screens[0].command.status).toBe('pending');
    audit.mockRestore();
    expect(
      (await h.service.navigate(secret, h.device.id, 'request_retry_after_failure', 'chores'))
        .replayed,
    ).toBe(false);
  });
  it('serializes simultaneous exact retries into one command and one replay', async () => {
    const h = await harness();
    await h.grant();
    await h.present();
    const responses = await Promise.all([h.navigate(), h.navigate()]);
    expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
    expect(responses.map((response) => response.json().replayed).sort()).toEqual([false, true]);
    expect(responses[0]!.json().command.id).toBe(responses[1]!.json().command.id);
    expect(h.db.prepare('SELECT count(*) AS n FROM home_assistant_bridge_commands').get()).toEqual({
      n: 1,
    });
  });
  it('does not deliver a queued command after a hidden/offline gap even in the same instance', async () => {
    const h = await harness();
    await h.grant();
    await h.present();
    await h.navigate();
    h.advance(16000);
    expect((await h.present()).json().command).toBeNull();
    expect((await h.state()).json().screens[0].command.status).toBe('cancelled');
    await h.navigate('request_hide');
    expect((await h.present({ tab: null })).json().command).toBeNull();
    expect((await h.state()).json().screens[0]).toMatchObject({
      online: false,
      currentTab: null,
      command: { status: 'cancelled' },
    });
  });
  it('queues only allowlisted tabs and acknowledges actual matching route, never desired state', async () => {
    const h = await harness();
    await h.grant();
    await h.present();
    expect((await h.navigate('request_admin', '/admin')).statusCode).toBe(400);
    const accepted = (await h.navigate()).json<{ command: ScreenCommand; replayed: boolean }>();
    expect(accepted.command.status).toBe('pending');
    expect((await h.state()).json().screens[0].currentTab).toBe('today');
    const delivery = await h.present();
    expect(delivery.json().command.id).toBe(accepted.command.id);
    await h.present({ acknowledgedCommandId: accepted.command.id });
    expect((await h.state()).json().screens[0].command.status).toBe('pending');
    await h.present({ tab: 'weather', acknowledgedCommandId: accepted.command.id });
    expect((await h.state()).json().screens[0]).toMatchObject({
      currentTab: 'weather',
      command: { status: 'applied' },
    });
    expect((await h.navigate()).json()).toMatchObject({
      command: { id: accepted.command.id, status: 'applied' },
      replayed: true,
    });
    expect((await h.navigate('request_navigate', 'chores')).statusCode).toBe(409);
    expect(h.db.prepare('SELECT count(*) AS n FROM home_assistant_bridge_commands').get()).toEqual({
      n: 1,
    });
  });
  it('rejects offline, unapproved and revoked screens and never wakes/launches anything', async () => {
    const h = await harness();
    await h.grant();
    expect((await h.navigate()).statusCode).toBe(409);
    await h.present();
    expect((await h.navigate('request_other', 'weather', 'device_living_room_tv')).statusCode).toBe(
      403,
    );
    h.advance(15000);
    expect((await h.navigate()).statusCode).toBe(409);
    expect((await h.state()).json().screens[0]).toMatchObject({ online: false, currentTab: null });
    await h.admin.revokeDevice(DEMO_HOUSEHOLD_ID, h.device.id, 'member_maya', 'request_revoke_tv');
    expect((await h.present()).statusCode).toBe(401);
    expect((await h.state()).json().screens).toEqual([]);
  });
  it('expires deliveries and binds a command to its original visible browser instance', async () => {
    const h = await harness();
    await h.grant();
    await h.present();
    await h.navigate();
    expect((await h.present({ instanceId: 'instance_other' })).statusCode).toBe(409);
    h.advance(16000);
    expect((await h.present({ instanceId: 'instance_new' })).json().command).toBeNull();
    expect((await h.state()).json().screens[0].command.status).toBe('cancelled');
    await h.navigate('request_expiring');
    h.advance(30000);
    expect((await h.present({ instanceId: 'instance_new' })).json().command).toBeNull();
    expect((await h.state()).json().screens[0].command.status).toBe('expired');
  });
  it('supersedes old requests and persists replay without redelivery after server restart', async () => {
    const h = await harness();
    await h.grant();
    await h.present();
    const first = (await h.navigate()).json().command;
    const second = (await h.navigate('request_second', 'chores')).json().command;
    expect((await h.navigate()).json().command).toMatchObject({
      id: first.id,
      status: 'superseded',
    });
    const restarted = new HomeAssistantBridgeService(h.admin, h.repository, {
      database: h.db,
      now: h.now,
    });
    const replay = await restarted.navigate(secret, h.device.id, 'request_second', 'chores');
    expect(replay).toMatchObject({
      replayed: true,
      command: { id: second.id, status: 'cancelled' },
    });
    expect(
      restarted.presentation(h.admin.getTvDeviceSession(h.tvSecret), {
        instanceId: 'instance_restarted',
        tab: 'today',
        acknowledgedCommandId: null,
      }).command,
    ).toBeNull();
  });
  it('revokes immediately and an old retry cannot revoke a replacement grant', async () => {
    const h = await harness();
    await h.grant();
    await h.present();
    await h.navigate();
    const revoke = () =>
      h.app.inject({
        method: 'POST',
        url: `${base}/revocations`,
        headers: adult,
        payload: { requestId: 'request_revoke' },
      });
    expect((await revoke()).statusCode).toBe(200);
    expect((await h.state()).statusCode).toBe(401);
    expect((await h.present()).json().command).toBeNull();
    const replacement = `ha_${'b'.repeat(43)}`;
    await h.service.grant(DEMO_HOUSEHOLD_ID, 'member_maya', {
      ...h.input,
      requestId: 'request_replacement',
      secret: replacement,
    });
    await revoke();
    expect(h.service.authenticate(replacement)).toBeDefined();
    expect(() => h.service.authenticate(secret)).toThrow();
  });
  it('bounds new navigation commands but permits exact receipt retry', async () => {
    const h = await harness();
    await h.grant();
    await h.present();
    for (let n = 0; n < 30; n++)
      expect((await h.navigate(`request_limit_${n}`)).statusCode).toBe(200);
    expect((await h.navigate('request_limit_30')).statusCode).toBe(409);
    expect((await h.navigate('request_limit_0')).json().replayed).toBe(true);
  });
});

describe('safe calendar interoperability', () => {
  it('filters all-day dates in the home timezone rather than UTC placeholders', async () => {
    const h = await harness();
    await h.grant();
    const week = await h.repository.getWeek(DEMO_HOUSEHOLD_ID, '2026-08-03');
    const event = {
      ...week.events[0]!,
      allDay: true,
      start: '2026-08-03T00:00:00Z',
      end: '2026-08-04T00:00:00Z',
      startLocalDate: '2026-08-03',
      endLocalDate: '2026-08-03',
    };
    vi.spyOn(h.repository, 'getWeek').mockResolvedValue({ ...week, events: [event] });
    const early = await h.app.inject({
      url: '/api/v1/home-assistant/calendar?start=2026-08-02T16:00:00Z&end=2026-08-02T22:00:00Z',
      headers,
    });
    expect(early.statusCode).toBe(200);
    expect(early.json().events).toHaveLength(1);
    h.db
      .prepare('UPDATE households SET timezone=? WHERE id=?')
      .run('America/Los_Angeles', DEMO_HOUSEHOLD_ID);
    vi.mocked(h.repository.getWeek).mockResolvedValue({
      ...week,
      events: [
        {
          ...event,
          start: '2026-08-04T00:00:00Z',
          end: '2026-08-05T00:00:00Z',
          startLocalDate: '2026-08-04',
          endLocalDate: '2026-08-04',
        },
      ],
    });
    const prior = await h.app.inject({
      url: '/api/v1/home-assistant/calendar?start=2026-08-03T07:00:00Z&end=2026-08-04T07:00:00Z',
      headers,
    });
    expect(prior.statusCode).toBe(200);
    expect(prior.json().events).toEqual([]);
  });
  it('counts only precisely overlapping events before enforcing the response cap', async () => {
    const h = await harness();
    await h.grant();
    const week = await h.repository.getWeek(DEMO_HOUSEHOLD_ID, '2026-08-03');
    vi.spyOn(h.repository, 'getWeek').mockResolvedValue({
      ...week,
      events: Array.from({ length: 2001 }, (_, index) => ({
        ...week.events[0]!,
        id: `event_boundary_${index}`,
        start: '2026-08-03T12:00:00Z',
        end: '2026-08-03T13:00:00Z',
      })),
    });
    const response = await h.app.inject({
      url: '/api/v1/home-assistant/calendar?start=2026-08-03T00:00:00Z&end=2026-08-03T01:00:00Z',
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().events).toEqual([]);
    expect(
      (
        await h.app.inject({
          url: '/api/v1/home-assistant/calendar?start=2026-08-03T11:00:00Z&end=2026-08-03T14:00:00Z',
          headers,
        })
      ).statusCode,
    ).toBe(503);
  });
  it('converts inclusive internal all-day end dates to exclusive wire dates and keeps stale freshness', async () => {
    const h = await harness();
    await h.grant();
    const week = await h.repository.getWeek(DEMO_HOUSEHOLD_ID, '2026-08-03');
    const original = week.events[0]!;
    vi.spyOn(h.repository, 'getWeek').mockResolvedValue({
      ...week,
      freshness: 'stale',
      events: [
        {
          ...original,
          allDay: true,
          start: '2026-08-02T16:00:00Z',
          end: '2026-08-04T16:00:00Z',
          startLocalDate: '2026-08-03',
          endLocalDate: '2026-08-04',
        },
      ],
    });
    const response = await h.app.inject({
      url: '/api/v1/home-assistant/calendar?start=2026-08-02T16:00:00Z&end=2026-08-05T16:00:00Z',
      headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      freshness: 'stale',
      events: [{ allDay: true, startLocalDate: '2026-08-03', endLocalDate: '2026-08-05' }],
    });
    expect(
      (
        await h.app.inject({
          url: '/api/v1/home-assistant/calendar?start=2026-08-01T00:00:00Z&end=2026-10-01T00:00:00Z',
          headers,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await h.app.inject({
          url: '/api/v1/home-assistant/calendar?start=2026-08-05T00:00:00Z&end=2026-08-01T00:00:00Z',
          headers,
        })
      ).statusCode,
    ).toBe(400);
  });
  it('excludes events ending at lower bound and starting at upper bound', async () => {
    const h = await harness();
    await h.grant();
    const week = await h.repository.getWeek(DEMO_HOUSEHOLD_ID, '2026-08-03');
    vi.spyOn(h.repository, 'getWeek').mockResolvedValue({
      ...week,
      events: [{ ...week.events[0]!, start: '2026-08-03T00:00:00Z', end: '2026-08-03T01:00:00Z' }],
    });
    expect(
      (
        await h.app.inject({
          url: '/api/v1/home-assistant/calendar?start=2026-08-03T01:00:00Z&end=2026-08-03T02:00:00Z',
          headers,
        })
      ).json().events,
    ).toEqual([]);
    expect(
      (
        await h.app.inject({
          url: '/api/v1/home-assistant/calendar?start=2026-08-02T23:00:00Z&end=2026-08-03T00:00:00Z',
          headers,
        })
      ).json().events,
    ).toEqual([]);
  });
});
