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
        save: async (config) => {
          savedSecrets.push(config);
        },
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
});
