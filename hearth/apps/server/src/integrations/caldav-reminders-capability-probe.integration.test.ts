import { describe, expect, it } from 'vitest';
import type { DAVCalendar, DAVCalendarObject, DAVResponse } from 'tsdav';

import { probeCalDavReminderCapabilities } from './caldav-reminders-capability-probe.js';

const SERVER_URL = 'https://calendar.example.test';
const TASKS_URL = `${SERVER_URL}/calendars/tasks/`;

describe('read-only CalDAV reminder capability probe', () => {
  it('queries only explicitly advertised VTODO collections and bounds the safe sample', async () => {
    const fetchedObjectUrls: string[][] = [];
    const responses = Array.from({ length: 7 }, (_, index) =>
      davResponse(`${TASKS_URL}task-${index + 1}.ics`),
    );
    const client = clientFixture({
      calendars: [
        calendar('Family events', `${SERVER_URL}/calendars/events/`, ['VEVENT']),
        calendar('Family reminders', TASKS_URL, ['VTODO']),
        calendar('Unknown collection', `${SERVER_URL}/calendars/unknown/`, undefined),
      ],
      queryResponses: responses,
      objects: [
        reminderObject('task-1', 'Buy milk', 'NEEDS-ACTION', '20260825T090000Z'),
        reminderObject('task-2', 'Return library books', 'COMPLETED', '20260826'),
      ],
      onFetchObjectUrls: (urls) => fetchedObjectUrls.push(urls),
    });

    const result = await probeCalDavReminderCapabilities({
      serverUrl: SERVER_URL,
      username: 'family@example.test',
      appPassword: 'super-secret-password',
      sampleLimit: 2,
      now: () => new Date('2026-08-24T08:00:00.000Z'),
      clientFactory: () => client,
    });

    expect(result).toEqual({
      probedAt: '2026-08-24T08:00:00.000Z',
      collectionCount: 3,
      taskCollectionCount: 1,
      sampleLimit: 2,
      collections: [
        {
          displayName: 'Family events',
          advertisedComponents: ['VEVENT'],
          reminderCapability: 'not-advertised',
          matchingResourceCount: null,
          sampledItems: [],
          unreadableSampleCount: 0,
        },
        {
          displayName: 'Family reminders',
          advertisedComponents: ['VTODO'],
          reminderCapability: 'advertised',
          matchingResourceCount: 7,
          sampledItems: [
            {
              title: 'Buy milk',
              status: 'NEEDS-ACTION',
              due: '2026-08-25T09:00:00Z',
              completedAt: null,
            },
            {
              title: 'Return library books',
              status: 'COMPLETED',
              due: '2026-08-26',
              completedAt: null,
            },
          ],
          unreadableSampleCount: 0,
        },
        {
          displayName: 'Unknown collection',
          advertisedComponents: [],
          reminderCapability: 'not-advertised',
          matchingResourceCount: null,
          sampledItems: [],
          unreadableSampleCount: 0,
        },
      ],
    });
    expect(fetchedObjectUrls).toEqual([[`${TASKS_URL}task-1.ics`, `${TASKS_URL}task-2.ics`]]);
    expect(JSON.stringify(result)).not.toContain(SERVER_URL);
    expect(JSON.stringify(result)).not.toContain('family@example.test');
    expect(JSON.stringify(result)).not.toContain('super-secret-password');
  });

  it('stops after capability discovery when no collection advertises VTODO', async () => {
    let queries = 0;
    let fetches = 0;
    const client = clientFixture({
      calendars: [calendar('Family events', `${SERVER_URL}/calendars/events/`, ['VEVENT'])],
      queryResponses: [],
      objects: [],
      onQuery: () => {
        queries += 1;
      },
      onFetchObjectUrls: () => {
        fetches += 1;
      },
    });

    const result = await probeCalDavReminderCapabilities({
      serverUrl: SERVER_URL,
      username: 'family@example.test',
      appPassword: 'super-secret-password',
      clientFactory: () => client,
    });

    expect(result.taskCollectionCount).toBe(0);
    expect(queries).toBe(0);
    expect(fetches).toBe(0);
  });

  it('queries advertised metadata without reading task bodies when the sample limit is zero', async () => {
    let queries = 0;
    let fetches = 0;
    const client = clientFixture({
      calendars: [calendar('Family reminders', TASKS_URL, ['VTODO'])],
      queryResponses: [davResponse(`${TASKS_URL}task-1.ics`)],
      objects: [reminderObject('task-1', 'Private title', 'NEEDS-ACTION', '20260825')],
      onQuery: () => {
        queries += 1;
      },
      onFetchObjectUrls: () => {
        fetches += 1;
      },
    });

    const result = await probeCalDavReminderCapabilities({
      serverUrl: SERVER_URL,
      username: 'family@example.test',
      appPassword: 'super-secret-password',
      sampleLimit: 0,
      clientFactory: () => client,
    });

    expect(result.collections[0]).toMatchObject({
      reminderCapability: 'advertised',
      matchingResourceCount: 1,
      sampledItems: [],
    });
    expect(queries).toBe(1);
    expect(fetches).toBe(0);
    expect(JSON.stringify(result)).not.toContain('Private title');
  });

  it('rejects task resource locations outside the advertised collection', async () => {
    let fetches = 0;
    const client = clientFixture({
      calendars: [calendar('Family reminders', TASKS_URL, ['VTODO'])],
      queryResponses: [davResponse('https://untrusted.example.test/private-task.ics')],
      objects: [],
      onFetchObjectUrls: () => {
        fetches += 1;
      },
    });

    const error = await probeCalDavReminderCapabilities({
      serverUrl: SERVER_URL,
      username: 'family@example.test',
      appPassword: 'super-secret-password',
      sampleLimit: 1,
      clientFactory: () => client,
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: 'UNAVAILABLE',
      message: 'Calendar returned an unsafe task resource location.',
    });
    expect(fetches).toBe(0);
    expect(JSON.stringify(error)).not.toContain('untrusted.example.test');
  });

  it('keeps malformed reminder data and authentication details out of errors', async () => {
    const malformedClient = clientFixture({
      calendars: [calendar('Tasks', TASKS_URL, ['VTODO'])],
      queryResponses: [davResponse(`${TASKS_URL}bad.ics`)],
      objects: [{ url: `${TASKS_URL}bad.ics`, data: 'secret malformed reminder' }],
    });
    const malformed = await probeCalDavReminderCapabilities({
      serverUrl: SERVER_URL,
      username: 'family@example.test',
      appPassword: 'super-secret-password',
      clientFactory: () => malformedClient,
    });
    expect(malformed.collections[0]).toMatchObject({
      sampledItems: [],
      unreadableSampleCount: 1,
    });
    expect(JSON.stringify(malformed)).not.toContain('secret malformed reminder');

    const authenticationClient = clientFixture({
      calendars: [],
      queryResponses: [],
      objects: [],
      loginError: Object.assign(new Error('super-secret-password'), { status: 401 }),
    });
    const error = await probeCalDavReminderCapabilities({
      serverUrl: SERVER_URL,
      username: 'family@example.test',
      appPassword: 'super-secret-password',
      clientFactory: () => authenticationClient,
    }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Calendar sign-in needs attention.',
    });
    expect(JSON.stringify(error)).not.toContain('super-secret-password');
  });

  it('reports only the safe failing stage for non-authentication provider errors', async () => {
    const client = clientFixture({
      calendars: [],
      queryResponses: [],
      objects: [],
      fetchCalendarsError: new Error(
        'https://private.example.test/calendars family@example.test secret-password',
      ),
    });

    const error = await probeCalDavReminderCapabilities({
      serverUrl: SERVER_URL,
      username: 'family@example.test',
      appPassword: 'secret-password',
      clientFactory: () => client,
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: 'UNAVAILABLE',
      message: 'Calendar reminder capability check failed during collection discovery.',
    });
    expect(JSON.stringify(error)).not.toContain('private.example.test');
    expect(JSON.stringify(error)).not.toContain('family@example.test');
    expect(JSON.stringify(error)).not.toContain('secret-password');
  });
});

function clientFixture(options: {
  calendars: DAVCalendar[];
  queryResponses: DAVResponse[];
  objects: DAVCalendarObject[];
  loginError?: unknown;
  fetchCalendarsError?: unknown;
  onQuery?: () => void;
  onFetchObjectUrls?: (urls: string[]) => void;
}) {
  return {
    async login() {
      if (options.loginError !== undefined) throw options.loginError;
    },
    async fetchCalendars() {
      if (options.fetchCalendarsError !== undefined) throw options.fetchCalendarsError;
      return options.calendars;
    },
    async calendarQuery() {
      options.onQuery?.();
      return options.queryResponses;
    },
    async fetchCalendarObjects(input: { objectUrls?: string[] }) {
      const urls = input.objectUrls ?? [];
      options.onFetchObjectUrls?.(urls);
      return options.objects.filter((object) => urls.includes(object.url));
    },
  };
}

function calendar(displayName: string, url: string, components: string[] | undefined): DAVCalendar {
  return { displayName, url, ...(components === undefined ? {} : { components }) };
}

function davResponse(href: string): DAVResponse {
  return { href, status: 200, statusText: 'OK', ok: true };
}

function reminderObject(
  uid: string,
  summary: string,
  status: string,
  due: string,
): DAVCalendarObject {
  const dueLine = /^\d{8}$/.test(due) ? `DUE;VALUE=DATE:${due}` : `DUE:${due}`;
  return {
    url: `${TASKS_URL}${uid}.ics`,
    data: `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Hearth Test//EN\r\nBEGIN:VTODO\r\nUID:${uid}\r\nSUMMARY:${summary}\r\nSTATUS:${status}\r\n${dueLine}\r\nEND:VTODO\r\nEND:VCALENDAR\r\n`,
  };
}
