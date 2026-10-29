import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from './app.js';
import { IndoorClimateService, loadIndoorRuntime } from './indoor-climate-service.js';
import { DemoIndoorProvider } from './integrations/indoor-climate-provider.js';
import { ModulesService } from './modules-repository.js';
import { openHearthDatabase } from './database.js';
import { SqliteAdminRepository, InMemoryAdminRepository } from './admin-repository.js';
import { DEMO_HOUSEHOLD_ID, DEMO_NOW } from './demo/seed.js';
import { RepositoryError } from './repository.js';
import type { CompanionAuthRepository } from './companion-auth.js';
const base = `/api/v1/households/${DEMO_HOUSEHOLD_ID}`;
const adult = { 'X-Hearth-Demo-Actor': 'member_maya' };
const servers: ReturnType<typeof buildServer>[] = [];
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
const selection = (test: Awaited<ReturnType<IndoorClimateService['discover']>>) => ({
  id: 'room_family',
  label: 'Family room',
  temperatureId: test.options.find((item) => item.metric === 'temperature')!.id,
  humidityId: test.options.find((item) => item.metric === 'humidity')!.id,
});
describe('indoor climate contract and persistence', () => {
  it('drops obsolete sensor results for every coalesced reader after selection changes', async () => {
    const now = new Date(DEMO_NOW);
    const provider = new DemoIndoorProvider();
    const config = {
      version: 1 as const,
      householdId: 'household_test',
      revision: 1,
      serverUrl: 'http://homeassistant.local',
      accessToken: 'fixture-private-token-only',
      rooms: [
        {
          id: 'room_one',
          label: 'Room',
          temperature: 'sensor.demo_room_temperature',
          humidity: null,
        },
      ],
    };
    const oldData = await provider.read(config, 'day', now);
    let release!: (data: typeof oldData) => void;
    vi.spyOn(provider, 'read').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const service = new IndoorClimateService(provider, { demo: true, config, now: () => now });
    const first = service.read('household_test', 'Australia/Perth', 'day');
    const second = service.read('household_test', 'Australia/Perth', 'day');
    const discovery = await service.discover('household_test', 'member_maya');
    await service.save('household_test', 'member_maya', {
      requestId: 'request_clear',
      testId: discovery.testId,
      revision: 1,
      rooms: [],
    });
    release(oldData);
    for (const result of await Promise.all([first, second])) expect(result.rooms).toEqual([]);
  });
  it('denies private unauthenticated, mixed-screen and automation access before sensor I/O', async () => {
    const provider = new DemoIndoorProvider();
    const read = vi.spyOn(provider, 'read');
    const auth = {
      session: (token: string) => {
        if (token !== 'fixture')
          throw new RepositoryError('UNAUTHENTICATED', 'Connect your phone.');
        return {
          authenticated: true,
          householdId: DEMO_HOUSEHOLD_ID,
          memberId: 'member_maya',
          displayName: 'Maya',
          expiresAt: '2027-01-01T00:00:00Z',
        };
      },
      authenticate: () => ({ id: 'member_maya', type: 'member', source: 'companion' }),
    } as unknown as CompanionAuthRepository;
    const app = buildServer({
      logger: false,
      indoorClimate: new IndoorClimateService(provider),
      companionAuth: auth,
      runtime: {
        mode: 'private',
        householdId: DEMO_HOUSEHOLD_ID,
        clock: { now: () => new Date(DEMO_NOW) },
      },
    });
    servers.push(app);
    for (const suffix of ['/indoor-climate', '/indoor-climate-settings']) {
      expect((await app.inject(base + suffix)).statusCode).toBe(401);
      expect(
        (
          await app.inject({
            url: base + suffix,
            headers: { cookie: 'hearth_device=invalid; hearth_session=fixture' },
          })
        ).statusCode,
      ).not.toBe(200);
      expect(
        (
          await app.inject({
            url: base + suffix,
            headers: { authorization: 'HearthAutomation forbidden' },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            url: base.replace(DEMO_HOUSEHOLD_ID, 'household_other') + suffix,
            headers: { cookie: 'hearth_session=fixture' },
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(read).not.toHaveBeenCalled();
  });
  it('requires adult setup, validates periods and stops all I/O when Weather is off while Home is independent', async () => {
    const provider = new DemoIndoorProvider();
    const read = vi.spyOn(provider, 'read');
    const discover = vi.spyOn(provider, 'discover');
    const indoor = new IndoorClimateService(provider, {
      admin: new InMemoryAdminRepository(),
      demo: true,
    });
    const modules = new ModulesService();
    const app = buildServer({ logger: false, indoorClimate: indoor, modules });
    servers.push(app);
    expect((await app.inject(`${base}/indoor-climate`)).json().status).toBe('not-configured');
    expect((await app.inject(`${base}/indoor-climate?period=all`)).statusCode).toBe(400);
    expect(
      (
        await app.inject({
          url: `${base}/indoor-climate-settings`,
          headers: { cookie: 'hearth_device=invalid' },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: `${base}/indoor-climate-settings`,
          headers: { 'X-Hearth-Demo-Actor': 'member_ezra' },
        })
      ).statusCode,
    ).toBe(403);
    await app.inject({
      method: 'PUT',
      url: `${base}/modules/weather`,
      headers: adult,
      payload: { requestId: 'request_weather_off', enabled: false },
    });
    expect((await app.inject(`${base}/indoor-climate`)).json().error.code).toBe('MODULE_DISABLED');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `${base}/indoor-climate-settings/tests`,
          headers: adult,
          payload: { serverUrl: 'http://homeassistant.local', accessToken: 'fictional-long-token' },
        })
      ).statusCode,
    ).toBe(403);
    expect(read).not.toHaveBeenCalled();
    expect(discover).not.toHaveBeenCalled();
    await app.inject({
      method: 'PUT',
      url: `${base}/modules/weather`,
      headers: adult,
      payload: { requestId: 'request_weather_on', enabled: true },
    });
    await app.inject({
      method: 'PUT',
      url: `${base}/modules/home`,
      headers: adult,
      payload: { requestId: 'request_home_off', enabled: false },
    });
    expect(
      (await app.inject({ url: `${base}/indoor-climate-settings`, headers: adult })).statusCode,
    ).toBe(200);
  });
  it('saves a restricted secret, preserves selection on restart, and gives durable actor-bound exact replay without raw IDs in receipts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hearth-indoor-'));
    dirs.push(dir);
    const path = join(dir, 'indoor.json');
    const db = await openHearthDatabase(':memory:');
    try {
      const admin = new SqliteAdminRepository(db, {
        seedDemo: true,
        now: () => new Date(DEMO_NOW),
      });
      const provider = new DemoIndoorProvider();
      const opts = { admin, database: db, configPath: path, now: () => new Date(DEMO_NOW) };
      const service = new IndoorClimateService(provider, opts);
      const tested = await service.discover(DEMO_HOUSEHOLD_ID, 'member_maya', {
        serverUrl: 'http://homeassistant.local',
        accessToken: 'fixture-secret-kept-private',
      });
      const input = {
        requestId: 'request_indoor_one',
        testId: tested.testId,
        revision: 0,
        rooms: [selection(tested)],
      };
      const first = await service.save(DEMO_HOUSEHOLD_ID, 'member_maya', input);
      expect(first.replayed).toBe(false);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      const restored = new IndoorClimateService(provider, {
        ...opts,
        config: await loadIndoorRuntime(path),
      });
      expect(restored.settings(DEMO_HOUSEHOLD_ID)).toEqual(first.settings);
      expect((await restored.save(DEMO_HOUSEHOLD_ID, 'member_maya', input)).replayed).toBe(true);
      await expect(
        restored.save(DEMO_HOUSEHOLD_ID, 'member_maya', { ...input, rooms: [] }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      await expect(
        restored.save(DEMO_HOUSEHOLD_ID, 'member_maya', { ...input, requestId: 'request_stale' }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      const receipts = JSON.stringify(
        db.prepare('SELECT response_json FROM command_receipts').all(),
      );
      expect(receipts).not.toMatch(/fixture-secret|sensor\.|homeassistant\.local/);
      expect(
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM audit_events WHERE action_type='indoor-climate.settings.update'",
          )
          .get(),
      ).toEqual({ count: 1 });
      expect(await readFile(path, 'utf8')).toContain('fixture-secret-kept-private');
    } finally {
      db.close();
    }
  });
  it('binds discovery to actor, rejects expiry, bounds admission and rechecks authority before commit', async () => {
    let now = new Date(DEMO_NOW);
    const service = new IndoorClimateService(new DemoIndoorProvider(), {
      demo: true,
      now: () => now,
    });
    const test = await service.discover('household_test', 'member_maya', {
      serverUrl: 'http://homeassistant.local',
      accessToken: 'fixture-private-token-only',
    });
    const input = {
      requestId: 'request_bound',
      testId: test.testId,
      revision: 0,
      rooms: [selection(test)],
    };
    await expect(service.save('household_test', 'member_other', input)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(
      service.save('household_test', 'member_maya', input, () => {
        throw new Error('revoked');
      }),
    ).rejects.toThrow('revoked');
    expect(service.settings('household_test').configured).toBe(false);
    now = new Date(now.getTime() + 601_000);
    await expect(service.save('household_test', 'member_maya', input)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    for (let i = 0; i < 8; i++)
      await service.discover('household_test', 'member_maya', {
        serverUrl: 'http://homeassistant.local',
        accessToken: 'fixture-private-token-only',
      });
    await expect(
      service.discover('household_test', 'member_maya', {
        serverUrl: 'http://homeassistant.local',
        accessToken: 'fixture-private-token-only',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('coalesces reads, keeps an outage visibly stale across repeated reads and never stores a year archive', async () => {
    let now = new Date(DEMO_NOW);
    const provider = new DemoIndoorProvider();
    const read = vi.spyOn(provider, 'read');
    const config = {
      version: 1 as const,
      householdId: 'household_test',
      revision: 1,
      serverUrl: 'http://homeassistant.local',
      accessToken: 'fixture-private-token-only',
      rooms: [
        { id: 'room_one', label: 'Room', temperature: 'sensor.room_temperature', humidity: null },
      ],
    };
    const service = new IndoorClimateService(provider, { demo: true, config, now: () => now });
    await Promise.all(
      Array.from({ length: 8 }, () => service.read('household_test', 'Australia/Perth', 'year')),
    );
    expect(read).toHaveBeenCalledTimes(1);
    now = new Date(now.getTime() + 61_000);
    read.mockRejectedValue(new Error('offline'));
    expect((await service.read('household_test', 'Australia/Perth', 'year')).status).toBe('stale');
    expect((await service.read('household_test', 'Australia/Perth', 'year')).status).toBe('stale');
    expect(read).toHaveBeenCalledTimes(2);
    expect(
      (await service.read('household_test', 'Australia/Perth', 'year')).rooms[0]?.temperature
        ?.samples,
    ).toHaveLength(365);
    expect(
      new IndoorClimateService(provider, { demo: true, config }).settings('household_test').rooms,
    ).toHaveLength(1);
  });
});
