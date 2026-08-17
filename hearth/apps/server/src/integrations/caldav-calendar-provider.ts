import { createHash } from 'node:crypto';

import ICAL from 'ical.js';
import { DAVClient, type DAVCalendar, type DAVCalendarObject } from 'tsdav';

import { addLocalDays, localDateInTimezone } from '@hearth/core';

import {
  CalendarProviderError,
  type CalendarDescriptor,
  type CalendarProvider,
  type CalendarSyncChange,
  type CalendarSyncResult,
  type ProviderCalendarEvent,
} from './calendar-provider.js';

const MAX_CALENDAR_OBJECT_BYTES = 5 * 1024 * 1024;
const MAX_EVENTS_PER_SYNC = 10_000;

export interface CalDavCalendarSelection {
  displayName: string;
  ownerMemberId: string | null;
}

export interface CalDavCalendarProviderOptions {
  serverUrl: string;
  username: string;
  appPassword: string;
  calendarAllowlist: readonly CalDavCalendarSelection[];
  householdTimezone: string;
  now?: () => Date;
  clientFactory?: () => CalDavClient;
}

interface SelectedCalendar {
  calendar: DAVCalendar;
  descriptor: CalendarDescriptor;
  ownerMemberId: string | null;
}

interface DecodedExternalId {
  calendarUrl: string;
  objectUrl: string;
  uid: string;
  occurrenceStart: string | null;
}

type CalDavClient = Pick<DAVClient, 'login' | 'fetchCalendars' | 'fetchCalendarObjects'>;

export async function discoverCalDavCalendars(
  input: Pick<CalDavCalendarProviderOptions, 'serverUrl' | 'username' | 'appPassword'>,
  clientFactory?: () => Pick<DAVClient, 'login' | 'fetchCalendars'>,
): Promise<CalendarDescriptor[]> {
  assertSecureUrl(input.serverUrl, 'CalDAV server');
  if (input.username.trim().length === 0 || input.appPassword.length === 0) {
    throw new CalendarProviderError(
      'CONFIGURATION_REQUIRED',
      'Calendar sign-in details are not configured.',
    );
  }
  try {
    const client =
      clientFactory?.() ??
      new DAVClient({
        serverUrl: input.serverUrl,
        credentials: { username: input.username, password: input.appPassword },
        authMethod: 'Basic',
        defaultAccountType: 'caldav',
        fetch: timeoutFetch,
      });
    await client.login({ loadCollections: false, loadObjects: false });
    const available = (await client.fetchCalendars()).filter(
      (calendar) => calendar.components?.includes('VEVENT') ?? true,
    );
    const named = available
      .map((calendar) => ({ calendar, displayName: calendarDisplayName(calendar) }))
      .filter(({ displayName }) => displayName.length > 0);
    const names = named.map(({ displayName }) => displayName);
    if (new Set(names).size !== names.length) {
      throw new CalendarProviderError(
        'CONFIGURATION_REQUIRED',
        'Two calendars have the same name. Rename one before connecting Hearth.',
      );
    }
    const calendars = named.map(({ calendar, displayName }) => {
      assertSecureUrl(calendar.url, 'calendar collection');
      return {
        externalId: calendar.url,
        displayName: truncate(displayName, 80),
        color: normalizeColor(calendar.calendarColor, calendar.url),
        capabilities: { read: true, write: false } as const,
      };
    });
    if (calendars.length === 0) {
      throw new CalendarProviderError(
        'CONFIGURATION_REQUIRED',
        'No event calendars were found for this account.',
      );
    }
    return calendars;
  } catch (error) {
    if (error instanceof CalendarProviderError) throw error;
    throw translateProviderError(error);
  }
}

/**
 * Read-only RFC 4791 adapter. It intentionally performs a bounded full query on
 * every sync. CalendarProjectionService reconciles that bounded snapshot into
 * durable tombstones, while provider-specific sync-token optimisation can be
 * added later without changing the browser contract.
 */
export class CalDavCalendarProvider implements CalendarProvider {
  readonly providerType = 'caldav';
  private readonly now: () => Date;
  private readonly clientFactory: () => CalDavClient;
  private readonly calendarAllowlist: readonly CalDavCalendarSelection[];
  private readonly householdTimezone: string;
  private clientPromise: Promise<CalDavClient> | undefined;
  private selectedCalendarsPromise: Promise<SelectedCalendar[]> | undefined;
  private readonly ownerByExternalId = new Map<string, string | null>();

  constructor(options: CalDavCalendarProviderOptions) {
    assertOptions(options);
    this.now = options.now ?? (() => new Date());
    this.calendarAllowlist = options.calendarAllowlist.map((calendar) => ({ ...calendar }));
    this.householdTimezone = options.householdTimezone;
    this.clientFactory =
      options.clientFactory ??
      (() =>
        new DAVClient({
          serverUrl: options.serverUrl,
          credentials: { username: options.username, password: options.appPassword },
          authMethod: 'Basic',
          defaultAccountType: 'caldav',
          fetch: timeoutFetch,
        }));
  }

  async listCalendars(): Promise<CalendarDescriptor[]> {
    return this.protect(async () => {
      const calendars = await this.selectedCalendars();
      return calendars.map(({ descriptor }) => ({
        ...descriptor,
        capabilities: { ...descriptor.capabilities },
      }));
    });
  }

  async syncEvents(input: {
    startDate: string;
    endDate: string;
    cursor: string | null;
  }): Promise<CalendarSyncResult> {
    return this.protect(async () => {
      const calendars = await this.selectedCalendars();
      const timeRange = boundedTimeRange(input.startDate, input.endDate, this.householdTimezone);
      const changes: CalendarSyncChange[] = [];
      const cursorParts: string[] = [];

      for (const selected of calendars) {
        const client = await this.client();
        const objects = await client.fetchCalendarObjects({
          calendar: selected.calendar,
          timeRange,
          expand: true,
          useMultiGet: true,
        });
        for (const object of objects) {
          cursorParts.push(`${selected.calendar.url}\u0000${object.url}\u0000${object.etag ?? ''}`);
          const events = parseCalendarObject(selected.calendar.url, object, this.householdTimezone);
          for (const event of events) {
            if (event.startLocalDate > input.endDate || event.endLocalDate < input.startDate) {
              continue;
            }
            changes.push({ type: 'upsert', event });
            if (changes.length > MAX_EVENTS_PER_SYNC) {
              throw new CalendarProviderError(
                'UNAVAILABLE',
                'Calendar returned too many events for one safe refresh.',
              );
            }
          }
        }
      }

      cursorParts.sort();
      return {
        changes,
        cursor: `caldav_full_${createHash('sha256').update(cursorParts.join('\u0001')).digest('hex')}`,
        syncedAt: this.now().toISOString(),
        full: true,
      };
    });
  }

  async getEvent(input: {
    calendarExternalId: string;
    eventExternalId: string;
  }): Promise<ProviderCalendarEvent | null> {
    return this.protect(async () => {
      const external = decodeExternalId(input.eventExternalId);
      if (external === null || external.calendarUrl !== input.calendarExternalId) return null;
      const calendars = await this.selectedCalendars();
      const selected = calendars.find(({ calendar }) => calendar.url === external.calendarUrl);
      if (selected === undefined) return null;
      const client = await this.client();
      const timeRange =
        external.occurrenceStart === null
          ? undefined
          : eventDetailTimeRange(external.occurrenceStart);
      const objects = await client.fetchCalendarObjects({
        calendar: selected.calendar,
        objectUrls: [external.objectUrl],
        ...(timeRange === undefined ? {} : { timeRange, expand: true }),
        useMultiGet: true,
      });
      for (const object of objects) {
        const event = parseCalendarObject(
          selected.calendar.url,
          object,
          this.householdTimezone,
        ).find((candidate) => candidate.externalId === input.eventExternalId);
        if (event !== undefined) return event;
      }
      return null;
    });
  }

  ownerMemberId(calendarExternalId: string): string | null {
    return this.ownerByExternalId.get(calendarExternalId) ?? null;
  }

  private async client(): Promise<CalDavClient> {
    this.clientPromise ??= (async () => {
      const client = this.clientFactory();
      await client.login({ loadCollections: false, loadObjects: false });
      return client;
    })();
    return this.clientPromise;
  }

  private async selectedCalendars(): Promise<SelectedCalendar[]> {
    this.selectedCalendarsPromise ??= (async () => {
      const client = await this.client();
      const available = (await client.fetchCalendars()).filter(
        (calendar) => calendar.components?.includes('VEVENT') ?? true,
      );
      const selected: SelectedCalendar[] = [];
      this.ownerByExternalId.clear();

      for (const configured of this.calendarAllowlist) {
        const matches = available.filter(
          (calendar) => calendarDisplayName(calendar) === configured.displayName,
        );
        if (matches.length !== 1) {
          throw new CalendarProviderError(
            'CONFIGURATION_REQUIRED',
            matches.length === 0
              ? `An approved calendar named “${configured.displayName}” was not found.`
              : `More than one calendar is named “${configured.displayName}”. Choose it by URL before connecting.`,
          );
        }
        const calendar = matches[0];
        if (calendar === undefined) continue;
        assertSecureUrl(calendar.url, 'calendar collection');
        const descriptor: CalendarDescriptor = {
          externalId: calendar.url,
          displayName: truncate(configured.displayName, 80),
          color: normalizeColor(calendar.calendarColor, calendar.url),
          capabilities: { read: true, write: false },
        };
        selected.push({ calendar, descriptor, ownerMemberId: configured.ownerMemberId });
        this.ownerByExternalId.set(calendar.url, configured.ownerMemberId);
      }
      return selected;
    })();
    return this.selectedCalendarsPromise;
  }

  private async protect<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.clientPromise = undefined;
      this.selectedCalendarsPromise = undefined;
      if (error instanceof CalendarProviderError) throw error;
      throw translateProviderError(error);
    }
  }
}

function parseCalendarObject(
  calendarUrl: string,
  object: DAVCalendarObject,
  householdTimezone: string,
): ProviderCalendarEvent[] {
  assertSecureUrl(object.url, 'calendar object');
  if (typeof object.data !== 'string' || object.data.length === 0) {
    throw new CalendarProviderError('UNAVAILABLE', 'Calendar returned an unreadable event.');
  }
  if (Buffer.byteLength(object.data, 'utf8') > MAX_CALENDAR_OBJECT_BYTES) {
    throw new CalendarProviderError('UNAVAILABLE', 'Calendar returned an event that is too large.');
  }

  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(object.data));
  } catch {
    throw new CalendarProviderError('UNAVAILABLE', 'Calendar returned an unreadable event.');
  }

  const components = root.getAllSubcomponents('vevent');
  const events: ProviderCalendarEvent[] = [];
  for (const component of components) {
    if (String(component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED') {
      continue;
    }
    const event = new ICAL.Event(component);
    const uid = event.uid?.trim();
    if (uid === undefined || uid.length === 0) {
      throw new CalendarProviderError('UNAVAILABLE', 'Calendar returned an event without an ID.');
    }
    const recurrenceValue = component.getFirstPropertyValue('recurrence-id');
    const recurrenceTime = recurrenceValue instanceof ICAL.Time ? recurrenceValue : null;
    const occurrenceStart = recurrenceTime?.toJSDate().toISOString() ?? null;
    const externalId = encodeExternalId({
      calendarUrl,
      objectUrl: object.url,
      uid,
      occurrenceStart,
    });
    const recurrenceMasterExternalId =
      recurrenceTime === null
        ? null
        : encodeExternalId({ calendarUrl, objectUrl: object.url, uid, occurrenceStart: null });
    const allDay = event.startDate.isDate;
    const range = allDay
      ? allDayRange(event.startDate, event.endDate)
      : timedRange(event.startDate, event.endDate, householdTimezone);
    events.push({
      externalId,
      calendarExternalId: calendarUrl,
      providerVersion: truncateNullable(object.etag ?? null, 160),
      title: truncate(event.summary?.trim() || 'Untitled event', 160),
      description: truncateNullable(event.description?.trim() || null, 4_000),
      location: truncateNullable(event.location?.trim() || null, 240),
      allDay,
      start: range.start,
      end: range.end,
      startLocalDate: range.startLocalDate,
      endLocalDate: range.endLocalDate,
      recurrenceMasterExternalId,
      isRecurrenceException: recurrenceTime !== null,
      sourceModifiedAt: componentTimestamp(component),
    });
  }
  return events;
}

function allDayRange(start: ICAL.Time, end: ICAL.Time) {
  const startLocalDate = icalDate(start);
  const exclusiveEnd = icalDate(end);
  const endLocalDate =
    exclusiveEnd > startLocalDate ? addLocalDays(exclusiveEnd, -1) : startLocalDate;
  return {
    start: `${startLocalDate}T00:00:00.000Z`,
    end: `${exclusiveEnd}T00:00:00.000Z`,
    startLocalDate,
    endLocalDate,
  };
}

function timedRange(start: ICAL.Time, end: ICAL.Time, householdTimezone: string) {
  const startDate = start.toJSDate();
  const endDate = end.toJSDate();
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
    throw new CalendarProviderError('UNAVAILABLE', 'Calendar returned an invalid event time.');
  }
  const inclusiveEnd = new Date(Math.max(startDate.getTime(), endDate.getTime() - 1));
  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    startLocalDate: localDateInTimezone(startDate.toISOString(), householdTimezone),
    endLocalDate: localDateInTimezone(inclusiveEnd.toISOString(), householdTimezone),
  };
}

function componentTimestamp(component: ICAL.Component): string | null {
  for (const propertyName of ['last-modified', 'dtstamp']) {
    const value = component.getFirstPropertyValue(propertyName);
    if (value instanceof ICAL.Time) {
      const timestamp = value.toJSDate();
      if (Number.isFinite(timestamp.getTime())) return timestamp.toISOString();
    }
  }
  return null;
}

function icalDate(time: ICAL.Time): string {
  return `${String(time.year).padStart(4, '0')}-${String(time.month).padStart(2, '0')}-${String(
    time.day,
  ).padStart(2, '0')}`;
}

function boundedTimeRange(startDate: string, endDate: string, timezone: string) {
  return {
    start: localMidnightInstant(startDate, timezone),
    end: localMidnightInstant(addLocalDays(endDate, 1), timezone),
  };
}

function eventDetailTimeRange(occurrenceStart: string) {
  const instant = new Date(occurrenceStart);
  if (!Number.isFinite(instant.getTime())) return undefined;
  return {
    start: new Date(instant.getTime() - 86_400_000).toISOString(),
    end: new Date(instant.getTime() + 2 * 86_400_000).toISOString(),
  };
}

function localMidnightInstant(localDate: string, timezone: string): string {
  const naive = Date.parse(`${localDate}T00:00:00.000Z`);
  if (!Number.isFinite(naive)) {
    throw new CalendarProviderError('CONFIGURATION_REQUIRED', 'Calendar date range is invalid.');
  }
  let candidate = naive;
  for (let index = 0; index < 3; index += 1) {
    candidate = naive - timezoneOffsetMilliseconds(candidate, timezone);
  }
  return new Date(candidate).toISOString();
}

function timezoneOffsetMilliseconds(timestamp: number, timezone: string): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(timestamp));
  } catch {
    throw new CalendarProviderError(
      'CONFIGURATION_REQUIRED',
      'The household calendar timezone is invalid.',
    );
  }
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const numeric = (key: Intl.DateTimeFormatPartTypes) => Number(values.get(key));
  const projected = Date.UTC(
    numeric('year'),
    numeric('month') - 1,
    numeric('day'),
    numeric('hour'),
    numeric('minute'),
    numeric('second'),
  );
  return projected - Math.floor(timestamp / 1_000) * 1_000;
}

function encodeExternalId(value: DecodedExternalId): string {
  return `caldav:${Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')}`;
}

function decodeExternalId(value: string): DecodedExternalId | null {
  if (!value.startsWith('caldav:')) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value.slice(7), 'base64url').toString('utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.calendarUrl !== 'string' ||
      typeof record.objectUrl !== 'string' ||
      typeof record.uid !== 'string' ||
      !(typeof record.occurrenceStart === 'string' || record.occurrenceStart === null)
    ) {
      return null;
    }
    return {
      calendarUrl: record.calendarUrl,
      objectUrl: record.objectUrl,
      uid: record.uid,
      occurrenceStart: record.occurrenceStart,
    };
  } catch {
    return null;
  }
}

function calendarDisplayName(calendar: DAVCalendar): string {
  if (typeof calendar.displayName === 'string') return calendar.displayName.trim();
  return '';
}

function normalizeColor(value: string | undefined, stableKey: string): string {
  const match = /^#?([0-9a-fA-F]{6})/.exec(value ?? '');
  if (match?.[1] !== undefined) return `#${match[1].toLowerCase()}`;
  const palette = ['#2f766d', '#c67a42', '#6f78a8', '#b85f68', '#718f4f'];
  const index = createHash('sha256').update(stableKey).digest()[0] ?? 0;
  return palette[index % palette.length] ?? '#2f766d';
}

function assertOptions(options: CalDavCalendarProviderOptions): void {
  assertSecureUrl(options.serverUrl, 'CalDAV server');
  if (options.username.trim().length === 0 || options.appPassword.length === 0) {
    throw new CalendarProviderError(
      'CONFIGURATION_REQUIRED',
      'Calendar sign-in details are not configured.',
    );
  }
  if (options.calendarAllowlist.length === 0) {
    throw new CalendarProviderError(
      'CONFIGURATION_REQUIRED',
      'Choose at least one calendar before connecting Hearth.',
    );
  }
  const names = options.calendarAllowlist.map(({ displayName }) => displayName.trim());
  if (names.some((name) => name.length === 0) || new Set(names).size !== names.length) {
    throw new CalendarProviderError(
      'CONFIGURATION_REQUIRED',
      'Approved calendar names must be unique and non-empty.',
    );
  }
}

function assertSecureUrl(value: string, label: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CalendarProviderError('CONFIGURATION_REQUIRED', `The ${label} URL is invalid.`);
  }
  if (url.protocol !== 'https:') {
    throw new CalendarProviderError(
      'CONFIGURATION_REQUIRED',
      `The ${label} must use private HTTPS.`,
    );
  }
}

function translateProviderError(error: unknown): CalendarProviderError {
  const status = statusFrom(error);
  if (status === 401 || status === 403) {
    return new CalendarProviderError(
      'AUTHENTICATION_REQUIRED',
      'Calendar sign-in needs attention.',
    );
  }
  return new CalendarProviderError('UNAVAILABLE', 'Calendar could not be refreshed safely.');
}

function statusFrom(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) return null;
  const record = error as Record<string, unknown>;
  if (typeof record.status === 'number') return record.status;
  if (typeof record.response === 'object' && record.response !== null) {
    const response = record.response as Record<string, unknown>;
    if (typeof response.status === 'number') return response.status;
  }
  if (error instanceof Error && /\b(?:401|403|unauthori[sz]ed|forbidden)\b/i.test(error.message)) {
    return 401;
  }
  return null;
}

async function timeoutFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(15_000);
  const signal =
    init?.signal === null || init?.signal === undefined
      ? timeoutSignal
      : AbortSignal.any([init.signal, timeoutSignal]);
  return fetch(input, { ...init, signal });
}

function truncate(value: string, maximum: number): string {
  return value.length <= maximum ? value : value.slice(0, maximum);
}

function truncateNullable(value: string | null, maximum: number): string | null {
  return value === null ? null : truncate(value, maximum);
}
