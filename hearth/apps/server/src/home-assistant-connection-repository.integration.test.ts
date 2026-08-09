import { afterEach, describe, expect, it } from 'vitest';

import { SqliteAdminRepository } from './admin-repository.js';
import { openHearthDatabase } from './database.js';
import {
  FakeHomeAssistantConnectionVerifier,
  HomeAssistantConnectionService,
} from './home-assistant-connection-repository.js';
import type { HomeAssistantRuntimeConfig } from './integrations/home-assistant-runtime.js';

const repositories: SqliteAdminRepository[] = [];

afterEach(() => {
  for (const repository of repositories.splice(0)) repository.close();
});

describe('Home Assistant connection repository', () => {
  it('persists friendly metadata while external storage receives the only raw mapping and token', async () => {
    const database = await openHearthDatabase(':memory:');
    const admin = new SqliteAdminRepository(database);
    repositories.push(admin);
    const storedSecrets: HomeAssistantRuntimeConfig[] = [];
    const service = new HomeAssistantConnectionService(
      admin,
      new FakeHomeAssistantConnectionVerifier(),
      {
        database,
        credentialStore: {
          save: async (config) => {
            storedSecrets.push(config);
          },
          remove: async () => undefined,
        },
        now: () => new Date('2026-08-10T03:00:00.000Z'),
      },
    );
    const accessToken = 'private-home-assistant-token';
    const tested = await service.test('household_hearth_demo', 'member_maya', {
      serverUrl: 'http://homeassistant.local:8123',
      accessToken,
    });
    const input = {
      requestId: 'request_home_assistant_repository_save',
      testId: tested.testId,
      label: 'Living room',
      mappings: {
        occupancyId: requiredId(tested.options.occupancy),
        televisionPowerId: requiredId(tested.options.televisionPower),
        hearthForegroundId: requiredId(tested.options.hearthForeground),
        protectedMediaId: requiredId(tested.options.protectedMedia),
        eveningScriptId: requiredId(tested.options.scripts, 0),
        goodnightScriptId: requiredId(tested.options.scripts, 1),
        screenOffScriptId: requiredId(tested.options.scripts, 2),
      },
    };

    const saved = await service.save('household_hearth_demo', 'member_maya', input);
    const replay = await service.save('household_hearth_demo', 'member_maya', input);
    const restarted = new HomeAssistantConnectionService(
      admin,
      new FakeHomeAssistantConnectionVerifier(),
      { database },
    );
    const read = await restarted.get('household_hearth_demo', 'member_maya');

    expect(saved.connection).toMatchObject({
      serverHost: 'homeassistant.local',
      instanceName: 'Hearth Demo Home',
      stateMappings: { occupancy: 'Family home' },
      actionMappings: { goodnight: 'Goodnight' },
    });
    expect(replay.replayed).toBe(true);
    expect(read).toEqual(saved.connection);
    expect(storedSecrets).toHaveLength(1);
    expect(storedSecrets[0]).toMatchObject({
      accessToken,
      stateMappings: { occupancy: 'binary_sensor.family_home' },
      actionMappings: { evening: 'script.hearth_evening' },
    });

    const persisted = database.prepare('SELECT * FROM home_assistant_connection_settings').all();
    const receipts = database.prepare('SELECT response_json FROM command_receipts').all();
    const audits = database.prepare('SELECT safe_summary_json FROM audit_events').all();
    const safeStorage = JSON.stringify({ persisted, receipts, audits });
    expect(safeStorage).not.toContain(accessToken);
    expect(safeStorage).not.toContain('http://homeassistant.local:8123');
    expect(safeStorage).not.toContain('binary_sensor.family_home');
    expect(safeStorage).not.toContain('script.hearth_evening');
    expect(JSON.stringify(tested)).not.toContain(accessToken);
    expect(JSON.stringify(tested)).not.toContain('binary_sensor.family_home');
  });
});

function requiredId(options: Array<{ id: string }>, index = 0): string {
  const option = options[index];
  if (option === undefined) throw new Error('Expected a Home Assistant mapping option.');
  return option.id;
}
