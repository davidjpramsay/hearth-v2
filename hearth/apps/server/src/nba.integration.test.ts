import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MODULE_IDS, NbaOverviewSchema, UpdateNbaSettingsSchema } from '@hearth/shared';
import { buildServer } from './app.js';
import { NbaService } from './nba-service.js';
import { DemoNbaProvider } from './integrations/nba-provider.js';
import { ModulesService } from './modules-repository.js';
import { applyMigrations } from './database.js';
import { InMemoryAdminRepository, SqliteAdminRepository } from './admin-repository.js';
import { InMemoryHearthRepository } from './repository.js';
import { HomeAssistantBridgeService } from './home-assistant-bridge.js';
import { DEMO_HOUSEHOLD_ID, DEMO_NOW } from './demo/seed.js';

const home = `/api/v1/households/${DEMO_HOUSEHOLD_ID}`;
const actor = { id: 'member_maya', type: 'member' as const, source: 'companion' as const };
const adult = { 'X-Hearth-Demo-Actor': actor.id };
const apps: ReturnType<typeof buildServer>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
describe('NBA module and saved standout teams', () => {
  it('treats changed new scope as conflict even when replaying a pre-module legacy grant', async () => {
    const bridge = new HomeAssistantBridgeService(
      new InMemoryAdminRepository(),
      new InMemoryHearthRepository(),
    );
    const input = {
      requestId: 'request_pre_module',
      secret: `ha_${'q'.repeat(43)}`,
      screenIds: [],
      shareChores: false,
      shareCalendar: false,
      controlChores: false,
    };
    await bridge.grant(DEMO_HOUSEHOLD_ID, actor.id, input);
    await expect(
      bridge.grant(DEMO_HOUSEHOLD_ID, actor.id, {
        ...input,
        controlModules: false,
        moduleIds: ['nba'],
      }),
    ).rejects.toThrow();
  });
  it('validates IDs, unique teams and the five-team limit', () => {
    for (const ids of [['999'], ['1', '1'], ['1', '2', '3', '4', '5', '6']])
      expect(
        UpdateNbaSettingsSchema.safeParse({ requestId: 'request_bad', standoutTeamIds: ids })
          .success,
      ).toBe(false);
    expect(
      UpdateNbaSettingsSchema.safeParse({ requestId: 'request_clear', standoutTeamIds: [] })
        .success,
    ).toBe(true);
  });
  it('coalesces requests, caches, labels stale on failure and recovers after the retry interval', async () => {
    let time = Date.parse('2026-10-20T00:00:00Z');
    const provider = new DemoNbaProvider();
    const read = vi.spyOn(provider, 'read');
    const service = new NbaService(provider, undefined, () => new Date(time));
    const results = await Promise.all([
      service.overview('household_test', 'Australia/Perth'),
      service.overview('household_test', 'Australia/Perth'),
    ]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(results[0]?.weekStart).toBe('2026-10-19');
    await service.overview('household_test', 'Australia/Perth');
    expect(read).toHaveBeenCalledTimes(1);
    time += 15 * 60_000;
    read.mockRejectedValueOnce(new Error('do not expose this response'));
    const stale = await service.overview('household_test', 'Australia/Perth');
    expect(stale.status).toBe('stale');
    expect(stale.data).toEqual(results[0]?.data);
    time += 60_000;
    expect((await service.overview('household_test', 'Australia/Perth')).status).toBe('current');
  });
  it('first fetch failure is unavailable, not an empty schedule; new weeks cannot use an old projection', async () => {
    let time = Date.parse('2026-10-25T15:59:00Z');
    const provider = new DemoNbaProvider();
    const service = new NbaService(provider, undefined, () => new Date(time));
    await service.overview('household_test', 'Australia/Perth');
    time += 60_000;
    vi.spyOn(provider, 'read').mockRejectedValue(new Error('offline'));
    const failed = await service.overview('household_test', 'Australia/Perth');
    expect(failed.weekStart).toBe('2026-10-26');
    expect(failed.status).toBe('unavailable');
    expect(failed.data).toBeNull();
  });
  it('persists settings and receipts, isolates homes/actors, conflicts on changed reuse and audits once', () => {
    const db = new Database(':memory:');
    applyMigrations(db);
    new SqliteAdminRepository(db);
    try {
      const input = { requestId: 'request_teams', standoutTeamIds: ['1', '2'] };
      const first = new NbaService(new DemoNbaProvider(), db);
      const receipt = first.update(DEMO_HOUSEHOLD_ID, input, actor);
      const reopened = new NbaService(new DemoNbaProvider(), db);
      expect(reopened.getSettings(DEMO_HOUSEHOLD_ID).standoutTeamIds).toEqual(['1', '2']);
      expect(reopened.update(DEMO_HOUSEHOLD_ID, input, actor)).toEqual({
        ...receipt,
        replayed: true,
      });
      expect(() =>
        reopened.update(DEMO_HOUSEHOLD_ID, { ...input, standoutTeamIds: ['3'] }, actor),
      ).toThrow('already used');
      expect(reopened.getSettings('household_other').standoutTeamIds).toEqual([]);
      expect(
        db
          .prepare("SELECT count(*) AS n FROM audit_events WHERE action_type='nba.settings.update'")
          .get(),
      ).toEqual({ n: 1 });
    } finally {
      db.close();
    }
  });
  it('starts off, never fetches while disabled, protects settings, and retains teams after re-enabling', async () => {
    const provider = new DemoNbaProvider();
    const read = vi.spyOn(provider, 'read');
    const modules = new ModulesService();
    const app = buildServer({
      logger: false,
      modules,
      nba: new NbaService(provider, undefined, () => new Date(DEMO_NOW)),
    });
    apps.push(app);
    expect((await app.inject(`${home}/nba`)).statusCode).toBe(403);
    expect(read).not.toHaveBeenCalled();
    modules.update(DEMO_HOUSEHOLD_ID, 'nba', { requestId: 'request_on', enabled: true }, actor);
    for (const headers of [{}, { 'X-Hearth-Demo-Actor': 'member_ezra' }]) {
      const result = await app.inject({
        method: 'PUT',
        url: `${home}/nba/settings`,
        headers,
        payload: { requestId: 'request_no', standoutTeamIds: ['1'] },
      });
      expect([401, 403]).toContain(result.statusCode);
    }
    expect(
      (
        await app.inject({
          url: `${home}/nba/settings`,
          headers: { 'X-Hearth-Demo-Actor': 'member_ezra' },
        })
      ).statusCode,
    ).toBe(403);
    const payload = { requestId: 'request_save', standoutTeamIds: ['1'] };
    expect(
      (await app.inject({ method: 'PUT', url: `${home}/nba/settings`, headers: adult, payload }))
        .statusCode,
    ).toBe(200);
    const response = await app.inject(`${home}/nba`);
    expect(NbaOverviewSchema.parse(response.json()).settings.standoutTeamIds).toEqual(['1']);
    modules.update(DEMO_HOUSEHOLD_ID, 'nba', { requestId: 'request_off', enabled: false }, actor);
    expect((await app.inject({ url: `${home}/nba/settings`, headers: adult })).statusCode).toBe(
      403,
    );
    modules.update(
      DEMO_HOUSEHOLD_ID,
      'nba',
      { requestId: 'request_on_again', enabled: true },
      actor,
    );
    expect(
      (await app.inject({ url: `${home}/nba/settings`, headers: adult })).json().standoutTeamIds,
    ).toEqual(['1']);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('does not silently add NBA to existing HA module grants; fresh explicit approval can control it', async () => {
    const app = buildServer({ logger: false });
    apps.push(app);
    const secret = `ha_${'n'.repeat(43)}`;
    const grant = {
      requestId: 'request_legacy_nba',
      secret,
      screenIds: [],
      shareChores: false,
      shareCalendar: false,
      controlChores: false,
      controlModules: true,
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `${home}/home-assistant-bridge`,
          headers: adult,
          payload: grant,
        })
      ).statusCode,
    ).toBe(200);
    const headers = { authorization: `HearthAutomation ${secret}` };
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/home-assistant/modules/nba',
          headers,
          payload: { requestId: 'request_no_nba', enabled: true },
        })
      ).statusCode,
    ).toBe(403);
    const fresh = buildServer({ logger: false });
    apps.push(fresh);
    expect(
      (
        await fresh.inject({
          method: 'POST',
          url: `${home}/home-assistant-bridge`,
          headers: adult,
          payload: { ...grant, moduleIds: [...MODULE_IDS] },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await fresh.inject({
          method: 'PUT',
          url: '/api/v1/home-assistant/modules/nba',
          headers,
          payload: { requestId: 'request_yes_nba', enabled: true },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await fresh.inject({ url: '/api/v1/home-assistant/state', headers })).json().modules.nba,
    ).toBe(true);
  });
});
