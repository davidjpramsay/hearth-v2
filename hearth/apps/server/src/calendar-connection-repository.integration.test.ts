import { afterEach, describe, expect, it } from 'vitest';

import type { CalDavRuntimeConfig } from './integrations/calendar-runtime.js';
import { SqliteAdminRepository } from './admin-repository.js';
import {
  CalendarConnectionService,
  FakeCalendarConnectionVerifier,
} from './calendar-connection-repository.js';
import { openHearthDatabase } from './database.js';

const repositories: SqliteAdminRepository[] = [];

afterEach(() => {
  for (const repository of repositories.splice(0)) repository.close();
});

describe('calendar connection repository', () => {
  it('persists only safe metadata while the credential store receives the secret', async () => {
    const database = await openHearthDatabase(':memory:');
    const admin = new SqliteAdminRepository(database);
    repositories.push(admin);
    const savedSecrets: CalDavRuntimeConfig[] = [];
    const service = new CalendarConnectionService(admin, new FakeCalendarConnectionVerifier(), {
      database,
      credentialStore: {
        load: async () => {
          const config = savedSecrets.at(-1);
          if (config === undefined) throw new Error('Expected a saved credential first.');
          return config;
        },
        save: async (config) => {
          savedSecrets.push(config);
        },
        updateMappings: async () => undefined,
        remove: async () => undefined,
      },
      now: () => new Date('2026-08-08T10:00:00.000Z'),
    });
    const password = 'private-calendar-password';
    const test = await service.test('household_hearth_demo', 'member_maya', {
      serverUrl: 'https://caldav.icloud.com',
      username: 'fictional@example.com',
      appPassword: password,
    });
    const first = test.availableCalendars[0];
    if (first === undefined) throw new Error('Expected a fake calendar');
    const input = {
      requestId: 'request_calendar_repository_save',
      testId: test.testId,
      label: 'Family calendars',
      calendars: [{ calendarId: first.id, ownerMemberId: null }],
    };
    const saved = await service.save('household_hearth_demo', 'member_maya', input);
    const replay = await service.save('household_hearth_demo', 'member_maya', input);
    const restarted = new CalendarConnectionService(admin, new FakeCalendarConnectionVerifier(), {
      database,
    });
    const read = await restarted.get('household_hearth_demo', 'member_maya');

    expect(saved.connection).toMatchObject({
      serverHost: 'caldav.icloud.com',
      accountHint: 'f•••@example.com',
      readOnly: true,
    });
    expect(replay.replayed).toBe(true);
    expect(read).toMatchObject(saved.connection ?? {});
    expect(savedSecrets).toHaveLength(1);
    expect(savedSecrets[0]?.appPassword).toBe(password);
    const persisted = database
      .prepare(
        `SELECT label, server_host, account_hint, selected_calendars_json
         FROM calendar_connection_settings`,
      )
      .all();
    const receipts = database.prepare('SELECT response_json FROM command_receipts').all();
    const audits = database.prepare('SELECT safe_summary_json FROM audit_events').all();
    expect(JSON.stringify({ persisted, receipts, audits })).not.toContain(password);
    expect(JSON.stringify({ persisted, receipts, audits })).not.toContain('fictional@example.com');
  });

  it('updates person mappings without asking for or replacing the saved credential', async () => {
    const database = await openHearthDatabase(':memory:');
    const admin = new SqliteAdminRepository(database);
    repositories.push(admin);
    let savedConfig: CalDavRuntimeConfig | null = null;
    const mappingUpdates: CalDavRuntimeConfig['calendars'][] = [];
    const service = new CalendarConnectionService(admin, new FakeCalendarConnectionVerifier(), {
      database,
      credentialStore: {
        load: async () => {
          if (savedConfig === null) throw new Error('Expected a saved credential first.');
          return savedConfig;
        },
        save: async (config) => {
          savedConfig = config;
        },
        updateMappings: async (calendars) => {
          if (savedConfig === null) throw new Error('Expected a saved credential first.');
          expect(savedConfig.appPassword).toBe('still-private');
          mappingUpdates.push(calendars);
        },
        remove: async () => undefined,
      },
      now: () => new Date('2026-08-08T10:00:00.000Z'),
    });
    const tested = await service.test('household_hearth_demo', 'member_maya', {
      serverUrl: 'https://caldav.icloud.com',
      username: 'fictional@example.com',
      appPassword: 'still-private',
    });
    const first = tested.availableCalendars[0];
    if (first === undefined) throw new Error('Expected a fake calendar');
    const saved = await service.save('household_hearth_demo', 'member_maya', {
      requestId: 'request_calendar_mapping_setup',
      testId: tested.testId,
      label: 'Family calendars',
      calendars: [{ calendarId: first.id, ownerMemberId: null }],
    });
    const connected = saved.connection?.calendars[0];
    if (connected === undefined) throw new Error('Expected a connected calendar');
    const input = {
      requestId: 'request_calendar_mapping_update',
      calendars: [{ calendarId: connected.id, ownerMemberId: 'member_maya' }],
    };
    const updated = await service.updateMappings('household_hearth_demo', 'member_maya', input);
    const replay = await service.updateMappings('household_hearth_demo', 'member_maya', input);

    expect(updated.connection?.calendars[0]).toMatchObject({
      owner: { id: 'member_maya' },
      color: '#c97900',
    });
    expect(replay.replayed).toBe(true);
    expect(mappingUpdates).toEqual([
      [{ displayName: first.displayName, ownerMemberId: 'member_maya' }],
    ]);
  });

  it('edits selected calendars using the saved credential without returning the secret', async () => {
    const database = await openHearthDatabase(':memory:');
    const admin = new SqliteAdminRepository(database);
    repositories.push(admin);
    let savedConfig: CalDavRuntimeConfig | null = null;
    let loadCount = 0;
    const service = new CalendarConnectionService(admin, new FakeCalendarConnectionVerifier(), {
      database,
      credentialStore: {
        load: async () => {
          loadCount += 1;
          if (savedConfig === null) throw new Error('Expected a saved credential first.');
          return savedConfig;
        },
        save: async (config) => {
          savedConfig = config;
        },
        updateMappings: async () => undefined,
        remove: async () => undefined,
      },
      now: () => new Date('2026-08-08T10:00:00.000Z'),
    });
    const password = 'selection-edit-secret';
    const tested = await service.test('household_hearth_demo', 'member_maya', {
      serverUrl: 'https://caldav.icloud.com',
      username: 'fictional@example.com',
      appPassword: password,
    });
    const family = tested.availableCalendars[0];
    if (family === undefined) throw new Error('Expected a family calendar');
    await service.save('household_hearth_demo', 'member_maya', {
      requestId: 'request_calendar_selection_setup',
      testId: tested.testId,
      label: 'Family calendars',
      calendars: [{ calendarId: family.id, ownerMemberId: null }],
    });

    const refreshed = await service.refreshSelection('household_hearth_demo', 'member_maya');
    const maya = refreshed.availableCalendars.find((calendar) => calendar.displayName === 'Maya');
    if (maya === undefined) throw new Error('Expected the Maya calendar');
    const updated = await service.save('household_hearth_demo', 'member_maya', {
      requestId: 'request_calendar_selection_update',
      testId: refreshed.testId,
      label: 'Family calendars',
      calendars: [
        { calendarId: family.id, ownerMemberId: null },
        { calendarId: maya.id, ownerMemberId: 'member_maya' },
      ],
    });

    expect(loadCount).toBe(1);
    expect(savedConfig).toMatchObject({ appPassword: password });
    expect(updated.connection?.calendars.map((calendar) => calendar.displayName)).toEqual([
      'Family',
      'Maya',
    ]);
    expect(JSON.stringify(refreshed)).not.toContain(password);
    const persisted = database.prepare('SELECT * FROM calendar_connection_settings').all();
    const receipts = database.prepare('SELECT response_json FROM command_receipts').all();
    const audits = database.prepare('SELECT safe_summary_json FROM audit_events').all();
    expect(JSON.stringify({ persisted, receipts, audits })).not.toContain(password);
  });
});
