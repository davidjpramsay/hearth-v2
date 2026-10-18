import Database from 'better-sqlite3';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MODULE_FLAGS,
  MODULE_IDS,
  type ModuleId,
  type TvDeviceSession,
} from '@hearth/shared';
import { buildServer } from './app.js';
import { ModulesService, ModuleRequestLeases } from './modules-repository.js';
import { applyMigrations, openHearthDatabase } from './database.js';
import { SqliteAdminRepository } from './admin-repository.js';
import { SqliteHearthRepository } from './sqlite-hearth-repository.js';
import { InMemoryHearthRepository, RepositoryError } from './repository.js';
import { FakeCalendarProvider } from './integrations/calendar-provider.js';
import { emptyWeatherSnapshot } from './integrations/weather-provider.js';
import { FakeDailyVerseProvider } from './integrations/daily-verse-provider.js';
import { HomeAssistantBridgeService } from './home-assistant-bridge.js';
import type { CompanionAuthRepository } from './companion-auth.js';
import { DEMO_HOUSEHOLD_ID, DEMO_NOW } from './demo/seed.js';

const base = `/api/v1/households/${DEMO_HOUSEHOLD_ID}`;
const actor = { id: 'member_maya', type: 'member' as const, source: 'companion' as const };
const adult = { 'X-Hearth-Demo-Actor': actor.id };
const servers: ReturnType<typeof buildServer>[] = [];
const databases: Database.Database[] = [];
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((app) => app.close()));
  databases.splice(0).forEach((db) => {
    if (db.open) db.close();
  });
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});
function harness() {
  const modules = new ModulesService(undefined, () => new Date(DEMO_NOW));
  const app = buildServer({ logger: false, modules });
  servers.push(app);
  const set = (
    id: ModuleId,
    enabled: boolean,
    requestId = `request_${id.toLowerCase()}_${enabled}`,
  ) =>
    app.inject({
      method: 'PUT',
      url: `${base}/modules/${id}`,
      headers: adult,
      payload: { requestId, enabled },
    });
  return { modules, app, set };
}

describe('household modules: retention, scoped control and consistent availability', () => {
  it('defaults every fixed module on and protects the update from shared/child actors', async () => {
    const h = harness();
    expect((await h.app.inject(`${base}/modules`)).json().enabled).toEqual(DEFAULT_MODULE_FLAGS);
    expect((await h.app.inject(`${base}/modules`)).headers['cache-control']).toBe(
      'private, no-store',
    );
    const denied = await h.app.inject({
      method: 'PUT',
      url: `${base}/modules/games`,
      payload: { requestId: 'request_child', enabled: false },
    });
    expect(denied.statusCode).toBe(401);
    expect(
      (
        await h.app.inject({
          method: 'PUT',
          url: `${base}/modules/games`,
          headers: { 'X-Hearth-Demo-Actor': 'member_ezra' },
          payload: { requestId: 'request_child', enabled: false },
        })
      ).statusCode,
    ).toBe(403);
    expect(h.modules.get(DEMO_HOUSEHOLD_ID).enabled.games).toBe(true);
    expect(
      (await h.app.inject(`${base.replace(DEMO_HOUSEHOLD_ID, 'household_missing')}/modules`))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await h.app.inject({
          method: 'PUT',
          url: `${base}/modules/not_a_module`,
          headers: adult,
          payload: { requestId: 'request_bad', enabled: false },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await h.app.inject({
          method: 'PUT',
          url: `${base}/modules/games`,
          headers: adult,
          payload: { requestId: 'request_bad', enabled: false, householdId: 'household_other' },
        })
      ).statusCode,
    ).toBe(400);
  });

  it.each([
    ['calendar', '/week?start=2026-08-03'],
    ['calendar', '/month?month=2026-08'],
    ['calendar', '/calendar-connection'],
    ['weather', '/weather'],
    ['weather', '/weather-location'],
    ['reminders', '/reminders'],
    ['chores', '/chore-occurrences?date=2026-08-03'],
    ['chores', '/chore-templates'],
    ['chores', '/pocket-money?weekStart=2026-08-03&asOf=2026-08-03'],
    ['lists', '/lists'],
    ['lists', '/list-settings'],
    ['meals', '/meal-plan?start=2026-08-03'],
    ['meals', '/saved-meal-library'],
    ['home', '/home'],
    ['home', '/home-assistant-connection'],
    ['photos', '/photos'],
    ['photos', '/photo-source'],
    ['photos', '/photo-assets/asset_demo/thumbnail'],
    ['games', '/games/word-groups'],
  ] as Array<[ModuleId, string]>)(
    'blocks direct %s reads before feature I/O: %s',
    async (id, route) => {
      const h = harness();
      expect((await h.set(id, false)).statusCode).toBe(200);
      const read = await h.app.inject(base + route);
      expect(read.statusCode).toBe(403);
      expect(read.json().error.code).toBe('MODULE_DISABLED');
      expect((await h.app.inject(`${base}/modules`)).statusCode).toBe(200);
    },
  );

  it('blocks direct disabled writes and all-off keeps core management and Today usable', async () => {
    const h = harness();
    for (const id of MODULE_IDS) expect((await h.set(id, false)).statusCode).toBe(200);
    for (const route of [
      '/reminders',
      '/notices',
      '/lists',
      '/saved-meals',
      '/chore-templates',
      '/photo-source/refreshes',
      '/assist/list-items',
      '/assist/chore-completions',
      '/home/actions/evening-mode',
    ]) {
      const response = await h.app.inject({
        method: 'POST',
        url: base + route,
        headers: adult,
        payload: { requestId: 'request_blocked' },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('MODULE_DISABLED');
    }
    const today = (await h.app.inject(`${base}/today?date=2026-08-03`)).json();
    expect(today.events).toEqual([]);
    expect(today.chores).toEqual([]);
    expect(today.integrations).toEqual([]);
    for (const key of [
      'weather',
      'dinner',
      'listSummary',
      'notice',
      'photo',
      'dailyVerse',
      'reminderSummary',
    ])
      expect(today[key]).toBeNull();
    expect(Object.values(today.sections).every((value) => value === false)).toBe(true);
    const settings = await h.app.inject({ url: `${base}/today-configuration`, headers: adult });
    expect(settings.json().notices).toEqual([]);
    expect(settings.json().sections.photo).toBe(true); // Preference retained, not rewritten.
    for (const route of ['/admin', '/system-status', '/modules'])
      expect((await h.app.inject({ url: base + route, headers: adult })).statusCode).toBe(200);
    expect((await h.set('reminders', true)).statusCode).toBe(200);
    expect((await h.app.inject(`${base}/reminders`)).statusCode).toBe(200);
  });

  it('restores original reminder records and Today preferences after off/on', async () => {
    const h = harness();
    const original = (await h.app.inject(`${base}/reminders?includeCompleted=true`)).json();
    await h.set('reminders', false);
    await h.set('reminders', true);
    expect((await h.app.inject(`${base}/reminders?includeCompleted=true`)).json()).toEqual(
      original,
    );
    expect(
      (await h.app.inject({ url: `${base}/today-configuration`, headers: adult })).json().sections
        .reminders,
    ).toBe(true);
  });

  it('does not allow a cached Today form to edit disabled feature preferences', async () => {
    const h = harness();
    const sections = (
      await h.app.inject({ url: `${base}/today-configuration`, headers: adult })
    ).json().sections;
    await h.set('photos', false);
    const save = (photo: boolean) =>
      h.app.inject({
        method: 'PUT',
        url: `${base}/today-sections`,
        headers: adult,
        payload: { ...sections, photo, requestId: `request_sections_${photo}` },
      });
    expect((await save(false)).json().error.code).toBe('MODULE_DISABLED');
    expect((await save(true)).statusCode).toBe(200); // Unchanged retained preferences are safe.
    expect(
      (await h.app.inject({ url: `${base}/today-configuration`, headers: adult })).json().sections
        .photo,
    ).toBe(true);
  });

  it('retains every non-module table across all eleven off/on transitions', () => {
    const db = new Database(':memory:');
    databases.push(db);
    applyMigrations(db);
    new SqliteAdminRepository(db);
    new SqliteHearthRepository(db);
    const tables = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[]
    )
      .map((row) => row.name)
      .filter(
        (name) =>
          !['audit_events', 'household_modules', 'household_module_receipts'].includes(name),
      );
    const snapshot = () =>
      Object.fromEntries(
        tables.map((table) => [table, db.prepare(`SELECT * FROM "${table}"`).all()]),
      );
    const before = snapshot();
    const service = new ModulesService(db);
    for (const id of MODULE_IDS)
      service.update(
        DEMO_HOUSEHOLD_ID,
        id,
        { requestId: `request_off_${id.toLowerCase()}`, enabled: false },
        actor,
      );
    expect(snapshot()).toEqual(before);
    for (const id of MODULE_IDS)
      service.update(
        DEMO_HOUSEHOLD_ID,
        id,
        { requestId: `request_on_${id.toLowerCase()}`, enabled: true },
        actor,
      );
    expect(snapshot()).toEqual(before);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action_type='module.update'").get(),
    ).toEqual({ n: MODULE_IDS.length * 2 });
  });

  it('redacts notices from unrelated Today saves and older exact receipts while off', async () => {
    const h = harness();
    const sections = (
      await h.app.inject({ url: `${base}/today-configuration`, headers: adult })
    ).json().sections;
    const save = (requestId: string) =>
      h.app.inject({
        method: 'PUT',
        url: `${base}/today-sections`,
        headers: adult,
        payload: { ...sections, dinner: false, requestId },
      });
    expect(
      (await save('request_notice_receipt')).json().configuration.notices.length,
    ).toBeGreaterThan(0);
    await h.set('notices', false);
    for (const requestId of ['request_notice_receipt', 'request_notice_fresh']) {
      const result = await save(requestId);
      expect(result.statusCode).toBe(200);
      expect(result.json().configuration.notices).toEqual([]);
      expect(result.json().configuration.activeNoticeId).toBeNull();
      expect(result.body).not.toContain('Bins go out tonight');
    }
    await h.set('notices', true);
    expect(
      (await h.app.inject({ url: `${base}/today-configuration`, headers: adult })).json().notices
        .length,
    ).toBeGreaterThan(0);
  });

  it('restores module flags and receipts after closing and reopening the SQLite file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-modules-'));
    directories.push(directory);
    const file = join(directory, 'fixture.sqlite');
    const first = await openHearthDatabase(file);
    databases.push(first);
    new SqliteAdminRepository(first);
    const input = { requestId: 'request_file_restart', enabled: false };
    const result = new ModulesService(first).update(DEMO_HOUSEHOLD_ID, 'photos', input, actor);
    first.close();
    const next = await openHearthDatabase(file);
    databases.push(next);
    const service = new ModulesService(next);
    expect(service.get(DEMO_HOUSEHOLD_ID).enabled.photos).toBe(false);
    expect(service.update(DEMO_HOUSEHOLD_ID, 'photos', input, actor)).toEqual({
      ...result,
      replayed: true,
    });
  });

  it('caps new HA changes but permits exact retries and adult recovery', () => {
    let time = Date.parse(DEMO_NOW);
    const service = new ModulesService(undefined, () => new Date(time));
    const ha = {
      id: 'service_home_assistant',
      type: 'service' as const,
      source: 'automation' as const,
    };
    for (let i = 0; i < 30; i++)
      service.update(
        DEMO_HOUSEHOLD_ID,
        'games',
        { requestId: `request_rate_${i}`, enabled: false },
        ha,
      );
    expect(
      service.update(
        DEMO_HOUSEHOLD_ID,
        'games',
        { requestId: 'request_rate_0', enabled: false },
        ha,
      ).replayed,
    ).toBe(true);
    expect(() =>
      service.update(
        DEMO_HOUSEHOLD_ID,
        'games',
        { requestId: 'request_rate_31', enabled: true },
        ha,
      ),
    ).toThrow('Too many module changes');
    expect(
      service.update(
        DEMO_HOUSEHOLD_ID,
        'games',
        { requestId: 'request_adult', enabled: true },
        actor,
      ).replayed,
    ).toBe(false);
    time += 60_001;
    expect(
      service.update(
        DEMO_HOUSEHOLD_ID,
        'games',
        { requestId: 'request_rate_31', enabled: true },
        ha,
      ).replayed,
    ).toBe(false);
  });

  it('skips provider reads while off and restores them when re-enabled', async () => {
    const db = new Database(':memory:');
    databases.push(db);
    applyMigrations(db);
    const admin = new SqliteAdminRepository(db);
    const calendar = new FakeCalendarProvider([], []);
    const sync = vi.spyOn(calendar, 'syncEvents');
    const weather = { configured: true, read: vi.fn(async () => emptyWeatherSnapshot()) };
    const verse = new FakeDailyVerseProvider();
    const verseRead = vi.spyOn(verse, 'getDailyVerse');
    const repository = new SqliteHearthRepository(db, {
      seedDemo: false,
      calendarProvider: calendar,
      weatherProvider: weather,
    });
    const modules = new ModulesService(db);
    for (const id of ['calendar', 'weather', 'dailyVerse'] as const)
      modules.update(
        DEMO_HOUSEHOLD_ID,
        id,
        { requestId: `request_provider_${id.toLowerCase()}`, enabled: false },
        actor,
      );
    const app = buildServer({
      logger: false,
      repository,
      adminRepository: admin,
      modules,
      dailyVerseProvider: verse,
    });
    servers.push(app);
    expect((await app.inject(`${base}/today?date=2026-08-03`)).statusCode).toBe(200);
    expect(sync).not.toHaveBeenCalled();
    expect(weather.read).not.toHaveBeenCalled();
    expect(verseRead).not.toHaveBeenCalled();
    modules.update(
      DEMO_HOUSEHOLD_ID,
      'calendar',
      { requestId: 'request_calendar_restore', enabled: true },
      actor,
    );
    modules.update(
      DEMO_HOUSEHOLD_ID,
      'weather',
      { requestId: 'request_weather_restore', enabled: true },
      actor,
    );
    expect((await app.inject(`${base}/week?start=2026-08-03`)).statusCode).toBe(200);
    expect(sync).toHaveBeenCalled();
    expect(weather.read).toHaveBeenCalled();
  });

  it('orders an in-flight feature response before an off command and blocks later reads', async () => {
    const acquire = vi.spyOn(ModuleRequestLeases.prototype, 'acquire');
    const modules = new ModulesService();
    const repository = new InMemoryHearthRepository();
    const original = repository.getWeek.bind(repository);
    let release!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const begun = new Promise<void>((resolve) => {
      started = resolve;
    });
    const getWeek = vi.spyOn(repository, 'getWeek').mockImplementation(async (...args) => {
      started();
      await waiting;
      return original(...args);
    });
    const app = buildServer({ logger: false, modules, repository });
    servers.push(app);
    const first = app.inject(`${base}/week?start=2026-08-03`).then((result) => result);
    await begun;
    let committed = false;
    const off = app
      .inject({
        method: 'PUT',
        url: `${base}/modules/calendar`,
        headers: adult,
        payload: { requestId: 'request_race_off', enabled: false },
      })
      .then((result) => {
        committed = true;
        return result;
      });
    await vi.waitFor(() => expect(acquire).toHaveBeenCalledWith(DEMO_HOUSEHOLD_ID, true));
    expect(committed).toBe(false);
    const later = app.inject(`${base}/week?start=2026-08-03`).then((result) => result);
    await vi.waitFor(() => expect(acquire).toHaveBeenCalledTimes(3));
    release();
    expect((await first).statusCode).toBe(200);
    expect((await off).statusCode).toBe(200);
    expect((await later).json().error.code).toBe('MODULE_DISABLED');
    expect(getWeek).toHaveBeenCalledTimes(1);
    acquire.mockRestore();
  });

  it('a disconnected feature request does not release its boundary before its work settles', async () => {
    const modules = new ModulesService();
    const repository = new InMemoryHearthRepository();
    const original = repository.getWeek.bind(repository);
    let finish!: () => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const begun = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.spyOn(repository, 'getWeek').mockImplementation(async (...args) => {
      started();
      await waiting;
      return original(...args);
    });
    const app = buildServer({ logger: false, modules, repository });
    servers.push(app);
    const origin = await app.listen({ host: '127.0.0.1', port: 0 });
    const controller = new AbortController();
    const read = fetch(`${origin}${base}/week?start=2026-08-03`, {
      signal: controller.signal,
    }).catch(() => null);
    await begun;
    controller.abort();
    await read;
    let committed = false;
    const off = app
      .inject({
        method: 'PUT',
        url: `${base}/modules/calendar`,
        headers: adult,
        payload: { requestId: 'request_aborted_off', enabled: false },
      })
      .then((value) => {
        committed = true;
        return value;
      });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(committed).toBe(false);
    finish();
    expect((await off).statusCode).toBe(200);
    expect((await app.inject(`${base}/week?start=2026-08-03`)).json().error.code).toBe(
      'MODULE_DISABLED',
    );
  });

  it('cancels an already queued HA tab command when that module is turned off', async () => {
    const db = new Database(':memory:');
    databases.push(db);
    applyMigrations(db);
    const admin = new SqliteAdminRepository(db);
    const modules = new ModulesService(db);
    const service = new HomeAssistantBridgeService(admin, new InMemoryHearthRepository(), {
      database: db,
      now: () => new Date(DEMO_NOW),
      modules,
    });
    const pairing = await admin.createPairing(
      'Test TV',
      'request_pair_module',
      undefined,
      'test-1',
    );
    const device = await admin.approvePairing(
      DEMO_HOUSEHOLD_ID,
      actor.id,
      pairing.code,
      'request_approve_module',
    );
    const secret = `ha_${'q'.repeat(43)}`;
    await service.grant(DEMO_HOUSEHOLD_ID, actor.id, {
      requestId: 'request_grant_module',
      secret,
      screenIds: [device.id],
      shareChores: true,
      shareCalendar: true,
      controlChores: false,
      controlModules: true,
    });
    const session: TvDeviceSession = {
      householdId: DEMO_HOUSEHOLD_ID,
      deviceId: device.id,
      deviceName: 'Test TV',
      scopes: ['household.read'],
      pairedAt: DEMO_NOW,
    };
    await service.presentation(session, {
      instanceId: 'instance_module',
      tab: 'today',
      acknowledgedCommandId: null,
    });
    const command = await service.navigate(secret, device.id, 'request_tab_module', 'weather');
    service.setModule(secret, 'weather', { requestId: 'request_off_weather', enabled: false });
    const shown = await service.presentation(session, {
      instanceId: 'instance_module',
      tab: 'today',
      acknowledgedCommandId: command.command.id,
    });
    expect(shown.command).toBeNull();
    expect((await service.state(secret)).screens[0]!.command!.status).toBe('cancelled');
    await expect(
      service.navigate(secret, device.id, 'request_tab_module', 'weather'),
    ).rejects.toThrow('turned off');
  });

  it('replays exactly without reverting a later state; changed reuse conflicts and actor scopes are distinct', async () => {
    const h = harness();
    const first = await h.set('games', false, 'request_exact');
    await h.set('games', true, 'request_new');
    const replay = await h.set('games', false, 'request_exact');
    expect(replay.json()).toEqual({ ...first.json(), replayed: true });
    expect(h.modules.get(DEMO_HOUSEHOLD_ID).enabled.games).toBe(true);
    expect((await h.set('games', true, 'request_exact')).statusCode).toBe(409);
    const other = h.modules.update(
      DEMO_HOUSEHOLD_ID,
      'games',
      { requestId: 'request_exact', enabled: false },
      { ...actor, id: 'member_other' },
    );
    expect(other.replayed).toBe(false);
  });

  it('persists flags, exact receipts and one audit after service recreation; no feature rows are deleted', () => {
    const db = new Database(':memory:');
    databases.push(db);
    applyMigrations(db);
    new SqliteAdminRepository(db);
    const before = db.prepare('SELECT * FROM members').all();
    const first = new ModulesService(db, () => new Date(DEMO_NOW));
    const input = { requestId: 'request_persist', enabled: false };
    const receipt = first.update(DEMO_HOUSEHOLD_ID, 'photos', input, actor);
    const reopened = new ModulesService(db, () => new Date(DEMO_NOW));
    expect(reopened.get(DEMO_HOUSEHOLD_ID).enabled.photos).toBe(false);
    expect(reopened.update(DEMO_HOUSEHOLD_ID, 'photos', input, actor)).toEqual({
      ...receipt,
      replayed: true,
    });
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action_type='module.update'").get(),
    ).toEqual({ n: 1 });
    expect(db.prepare('SELECT * FROM members').all()).toEqual(before);
  });

  it('does not fetch disabled optional aggregates or materialize disabled chore occurrences', async () => {
    const db = new Database(':memory:');
    databases.push(db);
    applyMigrations(db);
    const admin = new SqliteAdminRepository(db);
    const repository = new SqliteHearthRepository(db);
    const modules = new ModulesService(db);
    for (const id of MODULE_IDS)
      modules.update(DEMO_HOUSEHOLD_ID, id, { requestId: `request_${id}`, enabled: false }, actor);
    const app = buildServer({ logger: false, repository, adminRepository: admin, modules });
    servers.push(app);
    const readWeek = vi.spyOn(repository, 'getWeek');
    const before = db.prepare('SELECT COUNT(*) AS n FROM chore_occurrences').get();
    expect((await app.inject(`${base}/today?date=2026-08-20`)).statusCode).toBe(200);
    expect(readWeek).not.toHaveBeenCalled();
    expect(db.prepare('SELECT COUNT(*) AS n FROM chore_occurrences').get()).toEqual(before);
  });

  it('keeps legacy HA grants restricted, allows explicit module controls without admin access, and enforces revocation', async () => {
    const h = harness();
    const secret = `ha_${'z'.repeat(43)}`;
    const headers = { authorization: `HearthAutomation ${secret}` };
    const grant = {
      requestId: 'request_legacy',
      secret,
      screenIds: [],
      shareChores: true,
      shareCalendar: true,
      controlChores: true,
    };
    expect(
      (
        await h.app.inject({
          method: 'POST',
          url: `${base}/home-assistant-bridge`,
          headers: adult,
          payload: grant,
        })
      ).statusCode,
    ).toBe(200);
    const put = (requestId = 'request_module_ha') =>
      h.app.inject({
        method: 'PUT',
        url: '/api/v1/home-assistant/modules/chores',
        headers,
        payload: { requestId, enabled: false },
      });
    expect((await put()).statusCode).toBe(403);
    await h.app.inject({
      method: 'POST',
      url: `${base}/home-assistant-bridge/revocations`,
      headers: adult,
      payload: { requestId: 'request_revoke' },
    });
    const nextSecret = `ha_${'y'.repeat(43)}`;
    expect(
      (
        await h.app.inject({
          method: 'POST',
          url: `${base}/home-assistant-bridge`,
          headers: adult,
          payload: {
            ...grant,
            secret: nextSecret,
            requestId: 'request_new_grant',
            controlModules: true,
          },
        })
      ).statusCode,
    ).toBe(200);
    headers.authorization = `HearthAutomation ${nextSecret}`;
    expect((await put()).statusCode).toBe(200);
    const snapshot = (await h.app.inject({ url: '/api/v1/home-assistant/state', headers })).json();
    expect(snapshot.modules.chores).toBe(false);
    expect(snapshot.chores).toBeNull();
    expect(snapshot.permissions.controlModules).toBe(true);
    expect((await h.app.inject({ url: `${base}/admin`, headers })).statusCode).toBe(403);
    expect(
      (
        await h.app.inject({
          method: 'POST',
          url: '/api/v1/home-assistant/chores/chore_unknown/completion',
          headers,
          payload: {
            requestId: 'request_old',
            localDate: '2026-08-03',
            isCompleted: true,
            completionId: null,
          },
        })
      ).json().error.code,
    ).toBe('MODULE_DISABLED');
    await h.app.inject({
      method: 'POST',
      url: `${base}/home-assistant-bridge/revocations`,
      headers: adult,
      payload: { requestId: 'request_revoke_new' },
    });
    expect((await put()).statusCode).toBe(401);
  });

  it('blocks unauthenticated and wrong-household settings before any change', async () => {
    const modules = new ModulesService();
    const auth = {
      session: (token: string) => {
        if (token !== 'fixture') throw new RepositoryError('UNAUTHENTICATED', 'Sign in.');
        return {
          authenticated: true,
          householdId: DEMO_HOUSEHOLD_ID,
          memberId: actor.id,
          displayName: 'Maya',
          expiresAt: '2027-01-01T00:00:00Z',
        };
      },
      authenticate: () => actor,
    } as unknown as CompanionAuthRepository;
    const app = buildServer({
      logger: false,
      modules,
      companionAuth: auth,
      runtime: {
        mode: 'private',
        householdId: DEMO_HOUSEHOLD_ID,
        clock: { now: () => new Date(DEMO_NOW) },
      },
    });
    servers.push(app);
    expect((await app.inject(`${base}/modules`)).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          url: `${base.replace(DEMO_HOUSEHOLD_ID, 'household_other')}/modules`,
          headers: { cookie: 'hearth_session=fixture' },
        })
      ).statusCode,
    ).toBe(403);
    expect(modules.get(DEMO_HOUSEHOLD_ID).enabled).toEqual(DEFAULT_MODULE_FLAGS);
  });

  it('leases let current reads finish before off commits and keep later reads behind it', async () => {
    const leases = new ModuleRequestLeases();
    const releaseRead = await leases.acquire('home', false);
    const calls: string[] = [];
    const writer = leases.acquire('home', true).then((release) => {
      calls.push('write');
      return release;
    });
    const later = leases.acquire('home', false).then((release) => {
      calls.push('read');
      return release;
    });
    await Promise.resolve();
    expect(calls).toEqual([]);
    releaseRead();
    const releaseWrite = await writer;
    expect(calls).toEqual(['write']);
    releaseWrite();
    const releaseLater = await later;
    expect(calls).toEqual(['write', 'read']);
    releaseLater();
  });
});
