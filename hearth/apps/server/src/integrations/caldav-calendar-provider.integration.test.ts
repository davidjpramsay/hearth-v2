import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import type { DAVCalendar, DAVCalendarObject } from 'tsdav';

import { DEMO_HOUSEHOLD_ID } from '../demo/seed.js';
import { openHearthDatabase } from '../database.js';
import { SqliteHearthRepository } from '../sqlite-hearth-repository.js';
import { CalDavCalendarProvider, discoverCalDavCalendars } from './caldav-calendar-provider.js';
import { CalendarProviderError } from './calendar-provider.js';
import {
  createCalendarRuntime,
  removeCalendarRuntimeConfig,
  resolveCalendarRuntime,
  writeCalendarRuntimeConfig,
} from './calendar-runtime.js';

const FAMILY_URL = 'https://calendar.example.test/calendars/family/';
const EZRA_URL = 'https://calendar.example.test/calendars/ezra/';
const FAMILY_OBJECT_URL = `${FAMILY_URL}family-events.ics`;

describe('read-only CalDAV calendar provider', () => {
  it('discovers only approved calendars and normalizes expanded all-day and recurrence data', async () => {
    const fetchInputs: unknown[] = [];
    const client = clientFixture({
      calendars: [
        calendar('Ignored', 'https://calendar.example.test/calendars/ignored/'),
        calendar('Family', FAMILY_URL, '#C67A42FF'),
        calendar('Ezra', EZRA_URL, '#2F766D'),
      ],
      objects: [calendarObject()],
      onFetch: (input) => fetchInputs.push(input),
    });
    const provider = providerFixture(client);

    await expect(provider.listCalendars()).resolves.toEqual([
      {
        externalId: FAMILY_URL,
        displayName: 'Family',
        color: '#c67a42',
        capabilities: { read: true, write: false },
      },
      {
        externalId: EZRA_URL,
        displayName: 'Ezra',
        color: '#2f766d',
        capabilities: { read: true, write: false },
      },
    ]);
    expect(provider.ownerMemberId(FAMILY_URL)).toBeNull();
    expect(provider.ownerMemberId(EZRA_URL)).toBe('member_ezra');

    const result = await provider.syncEvents({
      startDate: '2026-08-03',
      endDate: '2026-08-09',
      cursor: 'ignored_previous_cursor',
    });

    expect(result).toMatchObject({
      full: true,
      syncedAt: '2026-08-03T00:00:00.000Z',
      cursor: expect.stringMatching(/^caldav_full_[0-9a-f]{64}$/),
    });
    expect(result.changes).toHaveLength(3);
    const events = result.changes.flatMap((change) =>
      change.type === 'upsert' ? [change.event] : [],
    );
    expect(events.map((event) => event.title)).toEqual([
      'Family holiday',
      'School drop-off',
      'Swimming lesson moved',
    ]);
    expect(events[0]).toMatchObject({
      allDay: true,
      startLocalDate: '2026-08-03',
      endLocalDate: '2026-08-04',
      start: '2026-08-03T00:00:00.000Z',
      end: '2026-08-05T00:00:00.000Z',
    });
    expect(events[1]).toMatchObject({
      allDay: false,
      start: '2026-08-04T00:15:00.000Z',
      end: '2026-08-04T01:00:00.000Z',
      startLocalDate: '2026-08-04',
      endLocalDate: '2026-08-04',
      isRecurrenceException: false,
    });
    expect(events[2]).toMatchObject({
      isRecurrenceException: true,
      recurrenceMasterExternalId: expect.stringMatching(/^caldav:/),
    });
    expect(events.every((event) => !event.title.includes('Cancelled'))).toBe(true);
    expect(fetchInputs).toEqual([
      expect.objectContaining({
        calendar: expect.objectContaining({ url: FAMILY_URL }),
        expand: true,
        timeRange: {
          start: '2026-08-02T16:00:00.000Z',
          end: '2026-08-09T16:00:00.000Z',
        },
      }),
      expect.objectContaining({
        calendar: expect.objectContaining({ url: EZRA_URL }),
        expand: true,
      }),
    ]);

    const event = events[2];
    expect(event).toBeDefined();
    if (event === undefined) return;
    await expect(
      provider.getEvent({
        calendarExternalId: event.calendarExternalId,
        eventExternalId: event.externalId,
      }),
    ).resolves.toMatchObject({ title: 'Swimming lesson moved', isRecurrenceException: true });
  });

  it('discovers safe read-only calendar choices before exact allowlisting', async () => {
    const client = clientFixture({
      calendars: [
        calendar('Family', FAMILY_URL, '#C67A42FF'),
        calendar('Ezra', EZRA_URL, '#2F766D'),
      ],
      objects: [],
    });
    await expect(
      discoverCalDavCalendars(
        {
          serverUrl: 'https://calendar.example.test',
          username: 'family@example.test',
          appPassword: 'super-secret-password',
        },
        () => client,
      ),
    ).resolves.toEqual([
      {
        externalId: FAMILY_URL,
        displayName: 'Family',
        color: '#c67a42',
        capabilities: { read: true, write: false },
      },
      {
        externalId: EZRA_URL,
        displayName: 'Ezra',
        color: '#2f766d',
        capabilities: { read: true, write: false },
      },
    ]);
  });

  it('refuses calendars outside the exact server-side allowlist', async () => {
    const provider = providerFixture(
      clientFixture({ calendars: [calendar('Family', FAMILY_URL)], objects: [] }),
      [{ displayName: 'Family Calendar', ownerMemberId: null }],
    );

    await expect(provider.listCalendars()).rejects.toMatchObject({
      code: 'CONFIGURATION_REQUIRED',
    });
  });

  it('maps authentication failures to a stable secret-safe error and retries login', async () => {
    let attempts = 0;
    const provider = providerFixture({
      async login() {
        attempts += 1;
        throw Object.assign(new Error('server leaked super-secret-password'), { status: 401 });
      },
      async fetchCalendars() {
        return [];
      },
      async fetchCalendarObjects() {
        return [];
      },
    });

    for (let index = 0; index < 2; index += 1) {
      const error = await provider.listCalendars().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(CalendarProviderError);
      expect(error).toMatchObject({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Calendar sign-in needs attention.',
      });
      expect(JSON.stringify(error)).not.toContain('super-secret-password');
    }
    expect(attempts).toBe(2);
  });

  it('fails the whole refresh on malformed provider data so the durable cache is retained', async () => {
    const provider = providerFixture(
      clientFixture({
        calendars: [calendar('Family', FAMILY_URL), calendar('Ezra', EZRA_URL)],
        objects: [{ url: FAMILY_OBJECT_URL, etag: 'secret-etag', data: 'not-calendar-data' }],
      }),
    );

    const error = await provider
      .syncEvents({ startDate: '2026-08-03', endDate: '2026-08-09', cursor: null })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: 'UNAVAILABLE',
      message: 'Calendar returned an unreadable event.',
    });
    expect(JSON.stringify(error)).not.toContain('secret-etag');
  });

  it('loads a strict external secret config without making credentials enumerable', () => {
    const client = clientFixture({
      calendars: [calendar('Family', FAMILY_URL)],
      objects: [],
    });
    const runtime = createCalendarRuntime(
      {
        version: 1,
        provider: 'caldav',
        serverUrl: 'https://calendar.example.test',
        username: 'family@example.test',
        appPassword: 'super-secret-password',
        householdTimezone: 'Australia/Perth',
        calendars: [{ displayName: 'Family', ownerMemberId: null }],
      },
      { clientFactory: () => client, now: () => new Date('2026-08-03T00:00:00.000Z') },
    );

    expect(runtime.provider.providerType).toBe('caldav');
    expect(JSON.stringify(runtime)).not.toContain('super-secret-password');
    expect(JSON.stringify(runtime)).not.toContain('family@example.test');
  });

  it('projects the selected CalDAV calendars through the persisted Today repository', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-caldav-runtime-'));
    const database = await openHearthDatabase(join(directory, 'hearth.sqlite'));
    try {
      const client = clientFixture({
        calendars: [calendar('Family', FAMILY_URL), calendar('Ezra', EZRA_URL)],
        objects: [calendarObject()],
      });
      const runtime = createCalendarRuntime(
        {
          version: 1,
          provider: 'caldav',
          serverUrl: 'https://calendar.example.test',
          username: 'family@example.test',
          appPassword: 'super-secret-password',
          householdTimezone: 'Australia/Perth',
          calendars: [
            { displayName: 'Family', ownerMemberId: null },
            { displayName: 'Ezra', ownerMemberId: 'member_ezra' },
          ],
        },
        { clientFactory: () => client, now: () => new Date('2026-08-03T00:00:00.000Z') },
      );
      const repository = new SqliteHearthRepository(database, {
        calendarProvider: runtime.provider,
        ownerForCalendarExternalId: runtime.ownerForCalendarExternalId,
      });

      const today = await repository.getToday(DEMO_HOUSEHOLD_ID, '2026-08-03');

      expect(today.calendars.map((calendarSource) => calendarSource.displayName)).toEqual([
        'Ezra',
        'Family',
      ]);
      expect(today.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Family holiday',
            allDay: true,
            startLocalDate: '2026-08-03',
          }),
        ]),
      );
      expect(
        database
          .prepare('SELECT provider_type, write_allowed, last_error_code FROM calendar_connections')
          .all(),
      ).toEqual([{ provider_type: 'caldav', write_allowed: 0, last_error_code: null }]);
    } finally {
      database.close();
      await rm(directory, { recursive: true });
    }
  });

  it('reports invalid secret config by field path without echoing submitted values', () => {
    expect(() =>
      createCalendarRuntime({
        version: 1,
        provider: 'caldav',
        serverUrl: 'http://private-calendar.example.test',
        username: 'family@example.test',
        appPassword: 'must-never-appear',
        householdTimezone: 'Australia/Perth',
        calendars: [
          { displayName: 'Family', ownerMemberId: null },
          { displayName: 'Family', ownerMemberId: null },
        ],
      }),
    ).toThrowError(/serverUrl, calendars/);
    try {
      createCalendarRuntime({ appPassword: 'must-never-appear' });
    } catch (error) {
      expect(String(error)).not.toContain('must-never-appear');
    }
  });

  it('keeps demo mode inert and gives unconfigured private mode a distinct provider', async () => {
    await expect(
      resolveCalendarRuntime({
        demoMode: true,
        configPath: '/outside/workspace/calendar-secret.json',
      }),
    ).rejects.toThrow(/disabled while HEARTH_MODE=demo/);
    await expect(
      resolveCalendarRuntime({ demoMode: true, configPath: undefined }),
    ).resolves.toBeNull();
    const privateRuntime = await resolveCalendarRuntime({
      demoMode: false,
      configPath: undefined,
    });
    expect(privateRuntime?.provider.providerType).toBe('unconfigured');
    await expect(privateRuntime?.provider.listCalendars()).rejects.toMatchObject({
      code: 'CONFIGURATION_REQUIRED',
    });

    const directory = await mkdtemp(join(tmpdir(), 'hearth-missing-calendar-secret-'));
    try {
      const missingRuntime = await resolveCalendarRuntime({
        demoMode: false,
        configPath: join(directory, 'calendar.json'),
      });
      expect(missingRuntime?.provider.providerType).toBe('unconfigured');
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  it('atomically writes the external runtime secret with owner-only permissions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-calendar-secret-'));
    const path = join(directory, 'calendar.json');
    try {
      await writeCalendarRuntimeConfig(path, {
        version: 1,
        provider: 'caldav',
        serverUrl: 'https://calendar.example.test',
        username: 'family@example.test',
        appPassword: 'super-secret-password',
        householdTimezone: 'Australia/Perth',
        calendars: [{ displayName: 'Family', ownerMemberId: null }],
      });
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
        provider: 'caldav',
        appPassword: 'super-secret-password',
      });
      await removeCalendarRuntimeConfig(path);
      await expect(stat(path)).rejects.toThrow();
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});

function providerFixture(
  client: ReturnType<typeof clientFixture>,
  calendarAllowlist = [
    { displayName: 'Family', ownerMemberId: null },
    { displayName: 'Ezra', ownerMemberId: 'member_ezra' },
  ],
) {
  return new CalDavCalendarProvider({
    serverUrl: 'https://calendar.example.test',
    username: 'family@example.test',
    appPassword: 'super-secret-password',
    householdTimezone: 'Australia/Perth',
    calendarAllowlist,
    now: () => new Date('2026-08-03T00:00:00.000Z'),
    clientFactory: () => client,
  });
}

function clientFixture(options: {
  calendars: DAVCalendar[];
  objects: DAVCalendarObject[];
  onFetch?: (input: unknown) => void;
}) {
  return {
    async login() {},
    async fetchCalendars() {
      return options.calendars;
    },
    async fetchCalendarObjects(input: unknown) {
      options.onFetch?.(input);
      const calendarUrl =
        typeof input === 'object' && input !== null
          ? (input as { calendar?: { url?: unknown } }).calendar?.url
          : undefined;
      return typeof calendarUrl === 'string'
        ? options.objects.filter((object) => object.url.startsWith(calendarUrl))
        : options.objects;
    },
  };
}

function calendar(displayName: string, url: string, calendarColor?: string): DAVCalendar {
  return {
    displayName,
    url,
    components: ['VEVENT'],
    ...(calendarColor === undefined ? {} : { calendarColor }),
  };
}

function calendarObject(): DAVCalendarObject {
  return {
    url: FAMILY_OBJECT_URL,
    etag: 'fixture-etag-v4',
    data: `BEGIN:VCALENDAR\r
VERSION:2.0\r
PRODID:-//Hearth Test//CalDAV fixture//EN\r
BEGIN:VEVENT\r
UID:family-holiday\r
DTSTAMP:20260801T010000Z\r
DTSTART;VALUE=DATE:20260803\r
DTEND;VALUE=DATE:20260805\r
SUMMARY:Family holiday\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:school-drop-off\r
DTSTAMP:20260801T010000Z\r
DTSTART:20260804T001500Z\r
DTEND:20260804T010000Z\r
SUMMARY:School drop-off\r
LOCATION:School gate\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:swimming-series\r
RECURRENCE-ID:20260806T083000Z\r
DTSTAMP:20260802T010000Z\r
DTSTART:20260806T090000Z\r
DTEND:20260806T100000Z\r
SUMMARY:Swimming lesson moved\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:cancelled-event\r
DTSTAMP:20260801T010000Z\r
DTSTART:20260805T010000Z\r
DTEND:20260805T020000Z\r
SUMMARY:Cancelled appointment\r
STATUS:CANCELLED\r
END:VEVENT\r
END:VCALENDAR\r
`,
  };
}
