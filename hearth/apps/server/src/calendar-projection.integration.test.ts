import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_MODULE_FLAGS,
  MonthScheduleSchema,
  TodaySummarySchema,
  WeekScheduleSchema,
} from '@hearth/shared';

import { CalendarProjectionService } from './calendar-projection.js';
import { DEMO_HOUSEHOLD_ID, DEMO_NOW } from './demo/seed.js';
import { openHearthDatabase } from './database.js';
import {
  CalendarProviderError,
  FakeCalendarProvider,
  UnconfiguredCalendarProvider,
  type CalendarDescriptor,
  type ProviderCalendarEvent,
} from './integrations/calendar-provider.js';
import { SqliteHearthRepository } from './sqlite-hearth-repository.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true })),
  );
});

describe('provider-neutral calendar projection', () => {
  it('returns saved plans immediately, coalesces reads and announces the background result', async () => {
    const { database, service, provider } = await projectionFixture();
    const initial = await service.projectRange(DEMO_HOUSEHOLD_ID, '2026-08-03', '2026-08-09');
    const refreshed = vi.fn();
    const background = new CalendarProjectionService(database, provider, () => null, refreshed);
    const original = provider.listCalendars.bind(provider);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const list = vi.spyOn(provider, 'listCalendars').mockImplementation(async () => {
      await gate;
      return original();
    });
    const cached = await background.projectRange(
      DEMO_HOUSEHOLD_ID,
      '2026-08-03',
      '2026-08-09',
      'background',
    );
    expect(cached.events).toEqual(initial.events);
    expect(cached).toMatchObject({
      freshness: 'stale',
      refreshing: true,
      statusMessage: null,
      integration: { status: 'stale', message: 'Updating calendar.' },
    });
    await background.projectRange(DEMO_HOUSEHOLD_ID, '2026-08-03', '2026-08-09', 'background');
    expect(list).toHaveBeenCalledTimes(1);
    release();
    await vi.waitFor(() => expect(refreshed).toHaveBeenCalledTimes(1));
    const current = await background.projectRange(
      DEMO_HOUSEHOLD_ID,
      '2026-08-03',
      '2026-08-09',
      'background',
    );
    expect(current).toMatchObject({
      freshness: 'current',
      refreshing: false,
      statusMessage: null,
      integration: { status: 'healthy', message: '2 calendars are current.' },
    });
    expect(list).toHaveBeenCalledTimes(1);
    database.close();
  });

  it('retains cached plans and backs off after a failed background refresh', async () => {
    const { database, service, provider } = await projectionFixture();
    const initial = await service.projectRange(DEMO_HOUSEHOLD_ID, '2026-08-03', '2026-08-09');
    provider.setAvailable(false);
    const refreshed = vi.fn();
    const background = new CalendarProjectionService(database, provider, () => null, refreshed);
    const list = vi.spyOn(provider, 'listCalendars');
    await background.projectRange(DEMO_HOUSEHOLD_ID, '2026-08-03', '2026-08-09', 'background');
    await vi.waitFor(() => expect(refreshed).toHaveBeenCalledTimes(1));
    const cached = await background.projectRange(
      DEMO_HOUSEHOLD_ID,
      '2026-08-03',
      '2026-08-09',
      'background',
    );
    expect(cached.events).toEqual(initial.events);
    expect(cached).toMatchObject({
      freshness: 'stale',
      refreshing: false,
      statusMessage: 'Calendar is unavailable · Showing saved plans.',
      integration: {
        status: 'unavailable',
        message: 'Calendar is unavailable · Showing saved plans.',
      },
    });
    expect(list).toHaveBeenCalledTimes(1);
    database.close();
  });

  it.each(['today', 'week', 'month'] as const)(
    'exposes typed refresh progress and retains issue banners in the %s DTO',
    async (view) => {
      const { database, provider } = await projectionFixture();
      const read = (repository: SqliteHearthRepository) =>
        view === 'today'
          ? repository.getToday(DEMO_HOUSEHOLD_ID, '2026-08-03')
          : view === 'week'
            ? repository.getWeek(DEMO_HOUSEHOLD_ID, '2026-08-03')
            : repository.getMonth(DEMO_HOUSEHOLD_ID, '2026-08');
      const schema = {
        today: TodaySummarySchema,
        week: WeekScheduleSchema,
        month: MonthScheduleSchema,
      }[view];
      const initial = await read(
        new SqliteHearthRepository(database, { calendarProvider: provider, seedDemo: false }),
      );
      expect(initial.events.length).toBeGreaterThan(0);
      expect(initial.calendarRefreshing).toBe(false);

      const refreshed = vi.fn();
      const background = new SqliteHearthRepository(database, {
        calendarProvider: provider,
        seedDemo: false,
        backgroundCalendar: true,
        onCalendarRefresh: refreshed,
      });
      const original = provider.listCalendars.bind(provider);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const list = vi.spyOn(provider, 'listCalendars').mockImplementation(async () => {
        await gate;
        return original();
      });
      const pending = await read(background);
      expect(pending.events).toEqual(initial.events);
      expect(pending).toMatchObject({
        freshness: 'stale',
        calendarRefreshing: true,
        statusMessage: null,
      });
      expect(schema.parse(pending).calendarRefreshing).toBe(true);
      // Previously saved responses remain decodable after the additive contract change.
      const { calendarRefreshing: _refreshing, ...legacy } = pending;
      expect(schema.parse(legacy).calendarRefreshing).toBe(false);
      expect(schema.safeParse({ ...legacy, calendarRefreshing: 'true' }).success).toBe(false);

      release();
      await vi.waitFor(() => expect(refreshed).toHaveBeenCalledTimes(1));
      const current = await read(background);
      expect(current.events).toEqual(initial.events);
      expect(current).toMatchObject({
        freshness: 'current',
        calendarRefreshing: false,
        statusMessage: null,
      });
      expect(list).toHaveBeenCalledTimes(1);

      provider.setAvailable(false);
      background.invalidateCalendarRefresh();
      await read(background);
      await vi.waitFor(() => expect(refreshed).toHaveBeenCalledTimes(2));
      const failed = await read(background);
      expect(failed.events).toEqual(initial.events);
      expect(failed).toMatchObject({
        freshness: 'stale',
        calendarRefreshing: false,
        statusMessage: 'Calendar is unavailable · Showing saved plans.',
      });
      expect(list).toHaveBeenCalledTimes(2);
      database.close();
    },
  );

  it('does not report a refresh or read the provider when Today calendar is disabled', async () => {
    const { database, provider } = await projectionFixture();
    const repository = new SqliteHearthRepository(database, {
      calendarProvider: provider,
      seedDemo: false,
      backgroundCalendar: true,
    });
    repository.setModuleAvailability(() => ({ ...DEFAULT_MODULE_FLAGS, calendar: false }));
    const list = vi.spyOn(provider, 'listCalendars');

    expect(await repository.getToday(DEMO_HOUSEHOLD_ID, '2026-08-03')).toMatchObject({
      freshness: 'current',
      calendarRefreshing: false,
      statusMessage: null,
      calendars: [],
      events: [],
    });
    expect(list).not.toHaveBeenCalled();
    database.close();
  });

  it('does not restore removed calendars from an obsolete in-flight refresh', async () => {
    const { database, service, provider } = await projectionFixture();
    await service.projectRange(DEMO_HOUSEHOLD_ID, '2026-08-03', '2026-08-09');
    const original = provider.syncEvents.bind(provider);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sync = vi.spyOn(provider, 'syncEvents').mockImplementation(async (input) => {
      const result = await original(input);
      await gate;
      return result;
    });
    await service.projectRange(DEMO_HOUSEHOLD_ID, '2026-08-03', '2026-08-09', 'background');
    await vi.waitFor(() => expect(sync).toHaveBeenCalledTimes(1));
    service.clear();
    release();
    await new Promise((resolve) => setImmediate(resolve));
    expect(database.prepare('SELECT COUNT(*) AS count FROM calendar_events').get()).toEqual({
      count: 0,
    });
    database.close();
  });

  it('retains source owners, all-day dates, recurrence exceptions and tombstones', async () => {
    const { database, service, provider } = await projectionFixture();

    const initial = await service.projectRange(DEMO_HOUSEHOLD_ID, '2026-08-03', '2026-08-09');
    expect(initial.calendars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          displayName: 'Ezra school',
          owner: expect.objectContaining({ id: 'member_ezra' }),
        }),
        expect.objectContaining({ displayName: 'Family', owner: null }),
      ]),
    );
    expect(initial.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Pupil-free day',
          allDay: true,
          startLocalDate: '2026-08-03',
          endLocalDate: '2026-08-03',
        }),
        expect.objectContaining({
          title: 'School drop-off',
          recurrenceMasterId: expect.stringMatching(/^event_/),
          isRecurrenceException: false,
        }),
      ]),
    );

    provider.queueDelete(
      'source-school@provider',
      'provider/instance-2026-08-04',
      '2026-08-03T08:00:00+08:00',
    );
    provider.queueUpsert(
      providerEvent({
        externalId: 'provider/instance-2026-08-04-moved',
        calendarExternalId: 'source-school@provider',
        title: 'School drop-off · moved',
        start: '2026-08-04T09:00:00+08:00',
        end: '2026-08-04T09:45:00+08:00',
        startLocalDate: '2026-08-04',
        endLocalDate: '2026-08-04',
        recurrenceMasterExternalId: 'provider/master-school',
        isRecurrenceException: true,
      }),
    );

    const updated = await service.projectRange(DEMO_HOUSEHOLD_ID, '2026-08-03', '2026-08-09');
    expect(updated.events.map((event) => event.title)).not.toContain('School drop-off');
    expect(updated.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'School drop-off · moved',
          isRecurrenceException: true,
        }),
      ]),
    );
    expect(
      database
        .prepare('SELECT deleted_at FROM calendar_events WHERE external_id = ?')
        .get('provider/instance-2026-08-04'),
    ).toEqual({ deleted_at: '2026-08-03T08:00:00+08:00' });
    database.close();
  });

  it('serves the durable cache during provider outage without persisting provider messages', async () => {
    const { database, service, provider } = await projectionFixture();
    const current = await service.projectRange(DEMO_HOUSEHOLD_ID, '2026-08-03', '2026-08-09');
    provider.setAvailable(false);

    const cached = await service.projectRange(DEMO_HOUSEHOLD_ID, '2026-08-03', '2026-08-09');
    expect(cached).toMatchObject({
      freshness: 'stale',
      refreshing: false,
      statusMessage: 'Calendar is unavailable · Showing saved plans.',
      integration: { status: 'unavailable' },
    });
    expect(cached.events).toEqual(current.events);
    const row = database
      .prepare(
        'SELECT sync_cursor, last_success_at, last_error_code FROM calendar_connections WHERE provider_type = ?',
      )
      .get('fake');
    expect(row).toMatchObject({
      sync_cursor: provider.currentCursor(),
      last_success_at: DEMO_NOW,
      last_error_code: 'UNAVAILABLE',
    });
    expect(JSON.stringify(row)).not.toContain('fake calendar provider is unavailable');

    const restarted = new CalendarProjectionService(
      database,
      provider,
      (externalId) =>
        new Map<string, string | null>([
          ['source-school@provider', 'member_ezra'],
          ['source-family@provider', null],
        ]).get(externalId) ?? null,
    );
    expect(restarted.hasSnapshot()).toBe(true);
    const afterRestart = await restarted.projectRange(
      DEMO_HOUSEHOLD_ID,
      '2026-08-03',
      '2026-08-09',
      'unavailable',
    );
    expect(afterRestart.events).toEqual(current.events);
    database.close();
  });

  it('hides a removed calendar during the next bounded full reconciliation', async () => {
    const { calendars, database, service, provider } = await projectionFixture();
    await service.projectRange(DEMO_HOUSEHOLD_ID, '2026-08-03', '2026-08-09');
    const schoolCalendar = calendars[0];
    expect(schoolCalendar).toBeDefined();
    if (schoolCalendar === undefined) return;
    provider.setCalendars([schoolCalendar]);

    const projection = await service.projectRange(DEMO_HOUSEHOLD_ID, '2026-08-02', '2026-08-10');

    expect(projection.calendars.map((calendar) => calendar.displayName)).toEqual(['Ezra school']);
    expect(projection.events.map((event) => event.title)).not.toContain('Pupil-free day');
    expect(
      database
        .prepare('SELECT visible FROM calendars WHERE external_id = ?')
        .get('source-family@provider'),
    ).toEqual({ visible: 0 });
    database.close();
  });

  it('distinguishes an unconfigured provider from an outage', async () => {
    const { database } = await projectionFixture();
    const service = new CalendarProjectionService(
      database,
      new UnconfiguredCalendarProvider(),
      () => null,
    );

    await expect(
      service.projectRange(DEMO_HOUSEHOLD_ID, '2026-08-03', '2026-08-09'),
    ).resolves.toMatchObject({
      calendars: [],
      events: [],
      freshness: 'stale',
      refreshing: false,
      integration: { status: 'not-configured' },
      statusMessage: 'Ask an adult to connect calendars from their phone · Showing saved plans.',
    });
    database.close();
  });

  it('keeps authentication issues visible without reporting refresh progress', async () => {
    const { database, service, provider } = await projectionFixture();
    const initial = await service.projectRange(DEMO_HOUSEHOLD_ID, '2026-08-03', '2026-08-09');
    vi.spyOn(provider, 'listCalendars').mockRejectedValue(
      new CalendarProviderError('AUTHENTICATION_REQUIRED', 'Private provider diagnostic'),
    );

    const cached = await service.projectRange(DEMO_HOUSEHOLD_ID, '2026-08-03', '2026-08-09');
    expect(cached.events).toEqual(initial.events);
    expect(cached).toMatchObject({
      freshness: 'stale',
      refreshing: false,
      statusMessage: 'Calendar needs attention · Showing saved plans.',
      integration: {
        status: 'authentication-required',
        message: 'Calendar needs attention · Showing saved plans.',
      },
    });
    database.close();
  });
});

async function projectionFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'hearth-calendar-projection-'));
  temporaryDirectories.push(directory);
  const database = await openHearthDatabase(join(directory, 'hearth.sqlite'));
  new SqliteHearthRepository(database);
  database.exec(`
    DELETE FROM calendar_events;
    DELETE FROM calendars;
    DELETE FROM calendar_connections;
  `);
  const calendars: CalendarDescriptor[] = [
    {
      externalId: 'source-school@provider',
      displayName: 'Ezra school',
      color: '#1668b7',
      capabilities: { read: true, write: false },
    },
    {
      externalId: 'source-family@provider',
      displayName: 'Family',
      color: '#3f7251',
      capabilities: { read: true, write: false },
    },
  ];
  const provider = new FakeCalendarProvider(calendars, [
    providerEvent({
      externalId: 'provider/all-day-2026-08-03',
      calendarExternalId: 'source-family@provider',
      title: 'Pupil-free day',
      start: '2026-08-03T00:00:00+08:00',
      end: '2026-08-04T00:00:00+08:00',
      startLocalDate: '2026-08-03',
      endLocalDate: '2026-08-03',
      allDay: true,
    }),
    providerEvent({
      externalId: 'provider/instance-2026-08-04',
      calendarExternalId: 'source-school@provider',
      title: 'School drop-off',
      start: '2026-08-04T08:15:00+08:00',
      end: '2026-08-04T09:00:00+08:00',
      startLocalDate: '2026-08-04',
      endLocalDate: '2026-08-04',
      recurrenceMasterExternalId: 'provider/master-school',
    }),
  ]);
  const service = new CalendarProjectionService(
    database,
    provider,
    (externalId) =>
      new Map<string, string | null>([
        ['source-school@provider', 'member_ezra'],
        ['source-family@provider', null],
      ]).get(externalId) ?? null,
  );
  return { calendars, database, service, provider };
}

function providerEvent(
  overrides: Partial<ProviderCalendarEvent> &
    Pick<
      ProviderCalendarEvent,
      | 'externalId'
      | 'calendarExternalId'
      | 'title'
      | 'start'
      | 'end'
      | 'startLocalDate'
      | 'endLocalDate'
    >,
): ProviderCalendarEvent {
  return {
    providerVersion: 'fixture_v1',
    description: null,
    location: null,
    allDay: false,
    recurrenceMasterExternalId: null,
    isRecurrenceException: false,
    sourceModifiedAt: DEMO_NOW,
    ...overrides,
  };
}
