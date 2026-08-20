import { afterEach, describe, expect, it } from 'vitest';

import { SqliteAdminRepository } from './admin-repository.js';
import { openHearthDatabase } from './database.js';
import {
  FakeWeatherLocationVerifier,
  WeatherLocationService,
} from './weather-location-repository.js';

const repositories: SqliteAdminRepository[] = [];

afterEach(() => {
  for (const repository of repositories.splice(0)) repository.close();
});

describe('weather location repository', () => {
  it('tests before saving, persists across restart and replays the command', async () => {
    const database = await openHearthDatabase(':memory:');
    const admin = new SqliteAdminRepository(database);
    repositories.push(admin);
    const configured: Array<{ latitude: number; longitude: number }> = [];
    const service = new WeatherLocationService(admin, new FakeWeatherLocationVerifier(), {
      database,
      onSaved: (location) => configured.push(location),
      now: () => new Date('2026-08-20T04:00:00.000Z'),
    });
    const tested = await service.test('household_hearth_demo', 'member_maya', {
      label: null,
      latitude: -32.328,
      longitude: 115.82,
      source: 'device',
    });
    expect(tested).toMatchObject({
      location: { label: 'Baldivis, WA', source: 'device' },
      current: { temperatureCelsius: 18 },
    });
    const input = {
      requestId: 'request_weather_repository_save',
      testId: tested.testId,
    };
    const saved = await service.save('household_hearth_demo', 'member_maya', input);
    const replay = await service.save('household_hearth_demo', 'member_maya', input);
    const restarted = new WeatherLocationService(admin, new FakeWeatherLocationVerifier(), {
      database,
    });
    const read = await restarted.get('household_hearth_demo', 'member_maya');

    expect(saved).toMatchObject({
      replayed: false,
      location: { label: 'Baldivis, WA', source: 'device' },
      audit: { action: 'weather.location.update' },
    });
    expect(replay.replayed).toBe(true);
    expect(read).toEqual(saved.location);
    expect(configured).toEqual([{ latitude: -32.328, longitude: 115.82 }]);
    expect(
      database
        .prepare('SELECT command_type FROM command_receipts WHERE request_id = ?')
        .get(input.requestId),
    ).toEqual({ command_type: 'weather.location.update' });
  });

  it('uses environment coordinates only when no household location is saved', async () => {
    const database = await openHearthDatabase(':memory:');
    const admin = new SqliteAdminRepository(database);
    repositories.push(admin);
    const service = new WeatherLocationService(admin, new FakeWeatherLocationVerifier(), {
      database,
      fallback: { latitude: -31.95, longitude: 115.86 },
    });

    expect(await service.get('household_hearth_demo', 'member_maya')).toMatchObject({
      label: 'Server fallback location',
      latitude: -31.95,
      longitude: 115.86,
      source: 'environment',
      updatedAt: null,
    });
  });
});
