import Database from 'better-sqlite3';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MODULE_IDS } from '@hearth/shared';
import { buildServer } from './app.js';
import { MorningRoutineService } from './morning-routine-service.js';
import { ModulesService } from './modules-repository.js';
import { InMemoryAdminRepository, SqliteAdminRepository } from './admin-repository.js';
import { applyMigrations } from './database.js';
import { DEMO_HOUSEHOLD_ID, DEMO_NOW } from './demo/seed.js';
const base = `/api/v1/households/${DEMO_HOUSEHOLD_ID}`;
const adult = { 'X-Hearth-Demo-Actor': 'member_maya' };
const actor = { id: 'member_maya', type: 'member' as const, source: 'companion' as const };
const device = { id: 'device_test', type: 'device' as const, source: 'tv' as const };
const configuration = {
  startTime: '07:00',
  endTime: '08:00',
  selectedMemberIds: ['member_ezra'],
  routines: [
    {
      memberId: 'member_ezra',
      steps: [
        { id: 'step_dress', title: 'Get dressed' },
        { id: 'step_bag', title: 'Pack bag' },
      ],
    },
  ],
};
const settingsInput = { requestId: 'request_setup', expectedRevision: 0, configuration };
const completion = {
  requestId: 'request_tick',
  localDate: '2026-08-03',
  memberId: 'member_ezra',
  stepId: 'step_bag',
  settingsRevision: 1,
  expectedVersion: 0,
  isCompleted: true,
};
const apps: ReturnType<typeof buildServer>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
describe('Morning Routine persistence and command boundary', () => {
  it('defaults to all children, empty lists and 7–8 without changing chores', async () => {
    const home = await new InMemoryAdminRepository().getHousehold(DEMO_HOUSEHOLD_ID);
    const service = new MorningRoutineService(undefined, () => new Date(DEMO_NOW));
    const settings = service.getSettings(home);
    expect(settings.configuration.selectedMemberIds).toEqual(
      home.members.filter((person) => person.role === 'child').map((person) => person.id),
    );
    expect(settings.configuration).toMatchObject({ startTime: '07:00', endTime: '08:00' });
    expect(settings.configuration.routines.every((routine) => routine.steps.length === 0)).toBe(
      true,
    );
    expect(service.overview(home).isWeekday).toBe(true);
  });
  it('keeps profile checks separate on the same date and preserves exact school retries', async () => {
    const home = await new InMemoryAdminRepository().getHousehold(DEMO_HOUSEHOLD_ID);
    const service = new MorningRoutineService(undefined, () => new Date(DEMO_NOW));
    service.update(home, settingsInput, actor);
    const schoolReceipt = service.complete(home, completion, device);
    const profiles = service.getSettings(home).profiles;
    profiles.schoolDays.days = profiles.schoolDays.days.filter((day) => day !== 'mon');
    profiles.weekends.days.push('mon');
    profiles.weekends.configuration = structuredClone(configuration); // Even identical step IDs remain isolated.
    service.update(
      home,
      { requestId: 'request_profile_switch', expectedRevision: 1, profiles },
      actor,
    );
    expect(service.overview(home)).toMatchObject({
      profileId: 'weekends',
      countdownEnabled: false,
    });
    expect(service.overview(home).people[0]?.steps[1]?.isCompleted).toBe(false);
    expect(service.complete(home, completion, device)).toEqual({
      ...schoolReceipt,
      replayed: true,
    });
    expect(service.overview(home).people[0]?.steps[1]?.isCompleted).toBe(false);
    expect(() =>
      service.complete(
        home,
        {
          ...completion,
          requestId: 'request_wrong_profile',
          settingsRevision: 2,
          profileId: 'schoolDays',
        },
        device,
      ),
    ).toThrow('morning has changed');
    service.complete(
      home,
      {
        ...completion,
        requestId: 'request_weekend_check',
        settingsRevision: 2,
        profileId: 'weekends',
      },
      device,
    );
    profiles.weekends.days = profiles.weekends.days.filter((day) => day !== 'mon');
    profiles.schoolDays.days.push('mon');
    service.update(
      home,
      { requestId: 'request_profile_back', expectedRevision: 2, profiles },
      actor,
    );
    expect(service.overview(home).people[0]?.steps[1]).toMatchObject({
      isCompleted: true,
      version: 1,
    });
  });

  it('supports untimed Saturday checks, fresh Sunday checks and deliberately unassigned days', async () => {
    let instant = '2026-08-08T07:30:00+08:00';
    const home = await new InMemoryAdminRepository().getHousehold(DEMO_HOUSEHOLD_ID);
    const service = new MorningRoutineService(undefined, () => new Date(instant));
    const profiles = service.getSettings(home).profiles;
    profiles.weekends.configuration = structuredClone(configuration);
    service.update(home, { requestId: 'request_weekends', expectedRevision: 0, profiles }, actor);
    service.complete(
      home,
      { ...completion, localDate: '2026-08-08', profileId: 'weekends' },
      device,
    );
    expect(service.overview(home).people[0]?.steps[1]?.isCompleted).toBe(true);
    instant = '2026-08-09T00:01:00+08:00';
    expect(service.overview(home)).toMatchObject({
      profileId: 'weekends',
      countdownEnabled: false,
    });
    expect(service.overview(home).people[0]?.steps.every((step) => !step.isCompleted)).toBe(true);
    profiles.weekends.days = [];
    service.update(home, { requestId: 'request_no_sunday', expectedRevision: 1, profiles }, actor);
    expect(service.overview(home)).toMatchObject({ profileId: null, people: [] });
  });

  it('lets a v1 editor update only school configuration without erasing weekend settings', async () => {
    const home = await new InMemoryAdminRepository().getHousehold(DEMO_HOUSEHOLD_ID);
    const service = new MorningRoutineService(undefined, () => new Date(DEMO_NOW));
    const profiles = service.getSettings(home).profiles;
    profiles.weekends.configuration = {
      ...structuredClone(configuration),
      startTime: '09:00',
      endTime: '10:00',
    };
    profiles.weekends.countdownEnabled = true;
    service.update(
      home,
      { requestId: 'request_new_profiles', expectedRevision: 0, profiles },
      actor,
    );
    service.update(
      home,
      { ...settingsInput, requestId: 'request_legacy_editor', expectedRevision: 1 },
      actor,
    );
    expect(service.getSettings(home).profiles.weekends).toEqual(profiles.weekends);
    expect(service.getSettings(home).configuration).toEqual(configuration);
    expect(service.getSettings(home).profiles.schoolDays.configuration).toEqual(configuration);
  });

  it('upgrades a v34 database without losing today’s check or invalidating its old retry hash', async () => {
    const db = new Database(':memory:');
    try {
      const folder = new URL('./migrations/', import.meta.url);
      for (const file of readdirSync(folder)
        .filter((name) => /^\d{4}_.*\.sql$/.test(name) && Number(name.slice(0, 4)) <= 34)
        .sort())
        db.exec(readFileSync(new URL(file, folder), 'utf8'));
      const home = await new SqliteAdminRepository(db).getHousehold(DEMO_HOUSEHOLD_ID);
      db.prepare('INSERT INTO morning_routine_settings VALUES (?,?,?)').run(
        home.id,
        1,
        JSON.stringify(configuration),
      );
      db.prepare('INSERT INTO morning_routine_progress VALUES (?,?,?,?,?,?,?)').run(
        home.id,
        completion.localDate,
        completion.memberId,
        completion.stepId,
        1,
        1,
        DEMO_NOW,
      );
      const original = {
        localDate: completion.localDate,
        memberId: completion.memberId,
        stepId: completion.stepId,
        isCompleted: true,
        version: 1,
        audit: {
          id: 'audit_legacy_check',
          actorType: 'device',
          actorId: device.id,
          source: 'tv',
          action: 'morning-routine.complete',
          targetId: completion.stepId,
          occurredAt: DEMO_NOW,
          result: 'succeeded',
        },
        replayed: false,
      };
      const hash = createHash('sha256')
        .update(JSON.stringify({ action: 'morning-routine.completion', input: completion }))
        .digest('hex');
      db.prepare('INSERT INTO morning_routine_receipts VALUES (?,?,?,?,?)').run(
        home.id,
        `device:${device.id}`,
        completion.requestId,
        hash,
        JSON.stringify(original),
      );
      applyMigrations(db);
      const service = new MorningRoutineService(db, () => new Date(DEMO_NOW));
      expect(service.overview(home).people[0]?.steps[1]).toMatchObject({
        isCompleted: true,
        version: 1,
      });
      expect(service.complete(home, completion, device)).toEqual({ ...original, replayed: true });
      expect(service.getSettings(home).profiles.schoolDays.configuration).toEqual(configuration);
      expect(
        service
          .getSettings(home)
          .profiles.weekends.configuration.routines.every((routine) => routine.steps.length === 0),
      ).toBe(true);
      expect(db.prepare('SELECT count(*) AS n FROM morning_routine_progress').get()).toEqual({
        n: 1,
      });
    } finally {
      db.close();
    }
  });

  it('persists checks/settings and exact receipts across restarts, without duplicating audit', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'hearth-morning-db-'));
    const path = join(directory, 'household.sqlite');
    let db = new Database(path);
    applyMigrations(db);
    const admin = new SqliteAdminRepository(db);
    const home = await admin.getHousehold(DEMO_HOUSEHOLD_ID);
    try {
      const service = new MorningRoutineService(db, () => new Date(DEMO_NOW));
      const first = service.update(home, settingsInput, actor);
      const checked = service.complete(home, completion, device); // Second step first is allowed.
      db.close();
      db = new Database(path);
      const restart = new MorningRoutineService(db, () => new Date(DEMO_NOW));
      expect(restart.update(home, settingsInput, actor)).toEqual({ ...first, replayed: true });
      expect(restart.complete(home, completion, device)).toEqual({ ...checked, replayed: true });
      expect(restart.overview(home).people[0]?.steps.map((step) => step.isCompleted)).toEqual([
        false,
        true,
      ]);
      expect(
        db
          .prepare(
            "SELECT count(*) AS n FROM audit_events WHERE action_type LIKE 'morning-routine.%'",
          )
          .get(),
      ).toEqual({ n: 2 });
      expect(
        db
          .prepare(
            "SELECT safe_summary_json FROM audit_events WHERE action_type LIKE 'morning-routine.%'",
          )
          .all(),
      ).toEqual([{ safe_summary_json: '{}' }, { safe_summary_json: '{}' }]);
      expect(() => restart.complete(home, { ...completion, isCompleted: false }, device)).toThrow(
        'already used',
      );
      expect(() =>
        restart.complete(
          home,
          { ...completion, requestId: 'request_stale_undo', isCompleted: false },
          device,
        ),
      ).toThrow('another device');
      restart.complete(
        home,
        { ...completion, requestId: 'request_undo', expectedVersion: 1, isCompleted: false },
        device,
      );
      expect(restart.overview(home).people[0]?.steps[1]).toMatchObject({
        isCompleted: false,
        version: 2,
      });
    } finally {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('starts each local date fresh, rejects stale-day/weekend commands but preserves replay receipts', async () => {
    let instant = DEMO_NOW;
    const home = await new InMemoryAdminRepository().getHousehold(DEMO_HOUSEHOLD_ID);
    const service = new MorningRoutineService(undefined, () => new Date(instant));
    service.update(home, settingsInput, actor);
    const receipt = service.complete(home, completion, device);
    instant = '2026-08-04T00:01:00+08:00';
    expect(service.overview(home).people[0]?.steps.every((step) => !step.isCompleted)).toBe(true);
    expect(service.complete(home, completion, device)).toEqual({ ...receipt, replayed: true });
    expect(() =>
      service.complete(home, { ...completion, requestId: 'request_old_day' }, device),
    ).toThrow('morning has changed');
    instant = '2026-08-08T07:30:00+08:00';
    expect(service.overview(home).isWeekday).toBe(false);
    expect(() =>
      service.complete(
        home,
        { ...completion, requestId: 'request_weekend', localDate: '2026-08-08' },
        device,
      ),
    ).toThrow('morning has changed');
  });
  it('preserves lists/checks when deselected or reordered, and rejects stale settings/foreign people', async () => {
    const home = await new InMemoryAdminRepository().getHousehold(DEMO_HOUSEHOLD_ID);
    const service = new MorningRoutineService(undefined, () => new Date(DEMO_NOW));
    service.update(home, settingsInput, actor);
    service.complete(home, completion, device);
    service.update(
      home,
      {
        ...settingsInput,
        requestId: 'request_hide',
        expectedRevision: 1,
        configuration: { ...configuration, selectedMemberIds: [] },
      },
      actor,
    );
    expect(service.overview(home).people).toEqual([]);
    expect(service.getSettings(home).configuration.routines).toEqual(configuration.routines);
    expect(() =>
      service.complete(home, { ...completion, requestId: 'request_old_settings' }, device),
    ).toThrow('edited');
    expect(() =>
      service.update(home, { ...settingsInput, requestId: 'request_stale_editor' }, actor),
    ).toThrow('another device');
    service.update(
      home,
      {
        ...settingsInput,
        requestId: 'request_restore',
        expectedRevision: 2,
        configuration: {
          ...configuration,
          routines: [
            { memberId: 'member_ezra', steps: [...configuration.routines[0]!.steps].reverse() },
          ],
        },
      },
      actor,
    );
    expect(service.overview(home).people[0]?.steps[0]).toMatchObject({
      id: 'step_bag',
      isCompleted: true,
    });
    expect(() =>
      service.update(
        home,
        {
          ...settingsInput,
          requestId: 'request_foreign',
          expectedRevision: 3,
          configuration: {
            ...configuration,
            selectedMemberIds: [],
            routines: [{ memberId: 'member_other', steps: [] }],
          },
        },
        actor,
      ),
    ).toThrow('this home');
    expect(() =>
      service.update(
        home,
        { ...settingsInput, requestId: 'request_child' },
        { ...actor, id: 'member_ezra' },
      ),
    ).toThrow('adult controller');
  });
  it('gates every endpoint while off, protects settings and persists data across toggling', async () => {
    const modules = new ModulesService();
    const app = buildServer({ logger: false, modules });
    apps.push(app);
    for (const path of ['/morning-routine', '/morning-routine/settings'])
      expect((await app.inject(`${base}${path}`)).statusCode).toBe(403);
    modules.update(
      DEMO_HOUSEHOLD_ID,
      'morningRoutine',
      { requestId: 'request_enable', enabled: true },
      actor,
    );
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `${base}/morning-routine/settings`,
          headers: adult,
          payload: settingsInput,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          url: `${base}/morning-routine/settings`,
          headers: { 'X-Hearth-Demo-Actor': 'member_ezra' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `${base}/morning-routine/settings`,
          headers: { 'user-agent': 'HearthTV/1.0' },
          payload: settingsInput,
        })
      ).statusCode,
    ).toBe(403);
    const checked = await app.inject({
      method: 'PUT',
      url: `${base}/morning-routine/completion`,
      payload: completion,
    });
    expect(checked.statusCode).toBe(200);
    const read = await app.inject(`${base}/morning-routine`);
    expect(read.headers['cache-control']).toBe('private, no-store');
    expect(read.json().people[0].person.capabilities).toBeUndefined();
    modules.update(
      DEMO_HOUSEHOLD_ID,
      'morningRoutine',
      { requestId: 'request_disable', enabled: false },
      actor,
    );
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `${base}/morning-routine/completion`,
          payload: completion,
        })
      ).statusCode,
    ).toBe(403);
    modules.update(
      DEMO_HOUSEHOLD_ID,
      'morningRoutine',
      { requestId: 'request_reenable', enabled: true },
      actor,
    );
    expect(
      (await app.inject(`${base}/morning-routine`)).json().people[0].steps[1].isCompleted,
    ).toBe(true);
    expect(
      (await app.inject(`${base.replace(DEMO_HOUSEHOLD_ID, 'household_other')}/morning-routine`))
        .statusCode,
    ).toBe(403);
  });
  it('denies private anonymous/automation clients and never silently widens old HA grants', async () => {
    const modules = new ModulesService();
    modules.update(
      DEMO_HOUSEHOLD_ID,
      'morningRoutine',
      { requestId: 'request_enable', enabled: true },
      actor,
    );
    const privateApp = buildServer({ logger: false, demoMode: false, modules });
    apps.push(privateApp);
    for (const path of ['/morning-routine', '/morning-routine/settings'])
      expect([401, 403]).toContain((await privateApp.inject(`${base}${path}`)).statusCode);
    const app = buildServer({ logger: false, modules });
    apps.push(app);
    const secret = `ha_${'m'.repeat(43)}`;
    const grant = {
      requestId: 'request_legacy',
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
          url: `${base}/home-assistant-bridge`,
          headers: adult,
          payload: grant,
        })
      ).statusCode,
    ).toBe(200);
    const headers = { authorization: `HearthAutomation ${secret}` };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/home-assistant/screens/device_missing/navigation',
          headers,
          payload: { requestId: 'request_nav', tab: 'morning_routine' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `${base}/morning-routine/completion`,
          headers,
          payload: completion,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/v1/home-assistant/modules/morningRoutine',
          headers,
          payload: { requestId: 'request_no_scope', enabled: false },
        })
      ).statusCode,
    ).toBe(403);
    const fresh = buildServer({ logger: false, modules });
    apps.push(fresh);
    expect(
      (
        await fresh.inject({
          method: 'POST',
          url: `${base}/home-assistant-bridge`,
          headers: adult,
          payload: { ...grant, moduleIds: [...MODULE_IDS] },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await fresh.inject({
          method: 'PUT',
          url: '/api/v1/home-assistant/modules/morningRoutine',
          headers,
          payload: { requestId: 'request_new_scope', enabled: false },
        })
      ).statusCode,
    ).toBe(200);
  });
});
