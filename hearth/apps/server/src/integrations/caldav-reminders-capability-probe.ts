import ICAL from 'ical.js';
import { DAVClient, type DAVCalendar, type DAVCalendarObject, type DAVResponse } from 'tsdav';

import { CalendarProviderError } from './calendar-provider.js';

const DEFAULT_SAMPLE_LIMIT = 3;
const MAX_SAMPLE_LIMIT = 10;
const MAX_DISCOVERED_COLLECTIONS = 80;
const MAX_REMINDER_OBJECT_BYTES = 1024 * 1024;

type ReminderProbeClient = Pick<
  DAVClient,
  'login' | 'fetchCalendars' | 'calendarQuery' | 'fetchCalendarObjects'
>;

type ReminderProbeStage =
  'account sign-in' | 'collection discovery' | 'task collection query' | 'task sample read';

export interface CalDavReminderCapabilityProbeOptions {
  serverUrl: string;
  username: string;
  appPassword: string;
  sampleLimit?: number;
  now?: () => Date;
  clientFactory?: () => ReminderProbeClient;
}

export interface CalDavReminderSample {
  title: string;
  status: string | null;
  due: string | null;
  completedAt: string | null;
}

export interface CalDavCollectionCapability {
  displayName: string;
  advertisedComponents: string[];
  reminderCapability: 'advertised' | 'not-advertised';
  matchingResourceCount: number | null;
  ignoredCollectionResponseCount: number;
  sampledItems: CalDavReminderSample[];
  unreadableSampleCount: number;
}

export interface CalDavReminderCapabilityProbeResult {
  probedAt: string;
  collectionCount: number;
  taskCollectionCount: number;
  sampleLimit: number;
  collections: CalDavCollectionCapability[];
}

/**
 * Operator-only, read-only CalDAV capability probe.
 *
 * It intentionally queries only collections that explicitly advertise VTODO,
 * requests at most a bounded sample of those resources and returns no account,
 * credential, collection URL, object URL, UID, description or raw DAV payload.
 */
export async function probeCalDavReminderCapabilities(
  options: CalDavReminderCapabilityProbeOptions,
): Promise<CalDavReminderCapabilityProbeResult> {
  assertSecureUrl(options.serverUrl, 'CalDAV server');
  if (options.username.trim().length === 0 || options.appPassword.length === 0) {
    throw new CalendarProviderError(
      'CONFIGURATION_REQUIRED',
      'Calendar sign-in details are not configured.',
    );
  }
  const sampleLimit = normalizeSampleLimit(options.sampleLimit);

  try {
    const client =
      options.clientFactory?.() ??
      new DAVClient({
        serverUrl: options.serverUrl,
        credentials: { username: options.username, password: options.appPassword },
        authMethod: 'Basic',
        defaultAccountType: 'caldav',
        fetch: timeoutFetch,
      });
    await atProbeStage('account sign-in', () =>
      client.login({ loadCollections: false, loadObjects: false }),
    );
    const calendars = await atProbeStage('collection discovery', () => client.fetchCalendars());
    if (calendars.length > MAX_DISCOVERED_COLLECTIONS) {
      throw new CalendarProviderError(
        'UNAVAILABLE',
        'Calendar returned too many collections for one safe capability check.',
      );
    }

    const collections: CalDavCollectionCapability[] = [];
    for (const calendar of calendars) {
      assertSecureUrl(calendar.url, 'calendar collection');
      const advertisedComponents = normalizeComponents(calendar.components);
      const reminderCapability = advertisedComponents.includes('VTODO')
        ? 'advertised'
        : 'not-advertised';
      const base: CalDavCollectionCapability = {
        displayName: safeDisplayName(calendar),
        advertisedComponents,
        reminderCapability,
        matchingResourceCount: null,
        ignoredCollectionResponseCount: 0,
        sampledItems: [],
        unreadableSampleCount: 0,
      };
      collections.push(
        reminderCapability === 'advertised'
          ? await sampleReminderCollection(client, calendar, sampleLimit, base)
          : base,
      );
    }

    return {
      probedAt: (options.now ?? (() => new Date()))().toISOString(),
      collectionCount: collections.length,
      taskCollectionCount: collections.filter(
        ({ reminderCapability }) => reminderCapability === 'advertised',
      ).length,
      sampleLimit,
      collections,
    };
  } catch (error) {
    if (error instanceof CalendarProviderError) throw error;
    throw translateProviderError(error, 'collection discovery');
  }
}

async function sampleReminderCollection(
  client: ReminderProbeClient,
  calendar: DAVCalendar,
  sampleLimit: number,
  base: CalDavCollectionCapability,
): Promise<CalDavCollectionCapability> {
  const matches = await atProbeStage('task collection query', () =>
    client.calendarQuery({
      url: calendar.url,
      props: { 'd:getetag': {} },
      filters: reminderFilters(),
      depth: '1',
    }),
  );
  const locations = matchedObjectUrls(matches, calendar.url);
  const objectUrls = locations.objectUrls;
  if (sampleLimit === 0 || objectUrls.length === 0) {
    return {
      ...base,
      matchingResourceCount: objectUrls.length,
      ignoredCollectionResponseCount: locations.ignoredCollectionResponseCount,
    };
  }

  const objects = await atProbeStage('task sample read', () =>
    client.fetchCalendarObjects({
      calendar,
      objectUrls: objectUrls.slice(0, sampleLimit),
      useMultiGet: true,
      urlFilter: (url) => url.length > 0,
    }),
  );
  const sampledItems: CalDavReminderSample[] = [];
  let unreadableSampleCount = 0;
  for (const object of objects) {
    const parsed = parseReminderObject(object, sampleLimit - sampledItems.length);
    sampledItems.push(...parsed.items);
    unreadableSampleCount += parsed.unreadableCount;
    if (sampledItems.length >= sampleLimit) break;
  }

  return {
    ...base,
    matchingResourceCount: objectUrls.length,
    ignoredCollectionResponseCount: locations.ignoredCollectionResponseCount,
    sampledItems,
    unreadableSampleCount,
  };
}

function parseReminderObject(
  object: DAVCalendarObject,
  remaining: number,
): { items: CalDavReminderSample[]; unreadableCount: number } {
  if (
    remaining <= 0 ||
    typeof object.data !== 'string' ||
    object.data.length === 0 ||
    Buffer.byteLength(object.data, 'utf8') > MAX_REMINDER_OBJECT_BYTES
  ) {
    return { items: [], unreadableCount: remaining <= 0 ? 0 : 1 };
  }

  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(object.data));
  } catch {
    return { items: [], unreadableCount: 1 };
  }

  const items = root
    .getAllSubcomponents('vtodo')
    .slice(0, remaining)
    .map((component) => {
      const status = safeStatus(component.getFirstPropertyValue('status'));
      return {
        title: truncate(
          String(component.getFirstPropertyValue('summary') ?? '').trim() || 'Untitled reminder',
          160,
        ),
        status,
        due: safeCalendarValue(component.getFirstPropertyValue('due')),
        completedAt: safeCalendarValue(component.getFirstPropertyValue('completed')),
      };
    });
  return { items, unreadableCount: items.length === 0 ? 1 : 0 };
}

function reminderFilters() {
  return [
    {
      'comp-filter': {
        _attributes: { name: 'VCALENDAR' },
        'comp-filter': { _attributes: { name: 'VTODO' } },
      },
    },
  ];
}

function matchedObjectUrls(
  responses: DAVResponse[],
  collectionUrl: string,
): { objectUrls: string[]; ignoredCollectionResponseCount: number } {
  const collection = new URL(collectionUrl);
  const collectionSegments = safePathSegments(collection);
  const objectUrls: string[] = [];
  let ignoredCollectionResponseCount = 0;

  for (const { ok, href } of responses) {
    if (!ok || typeof href !== 'string' || href.length === 0) continue;
    let object: URL;
    try {
      object = new URL(href, collection);
    } catch {
      throw unsafeTaskResourceLocation();
    }
    assertSecureUrl(object.href, 'calendar object');
    if (
      object.origin !== collection.origin ||
      object.username.length > 0 ||
      object.password.length > 0 ||
      object.hash.length > 0
    ) {
      throw unsafeTaskResourceLocation();
    }

    const objectSegments = safePathSegments(object);
    if (pathsEqual(collectionSegments, objectSegments)) {
      ignoredCollectionResponseCount += 1;
      continue;
    }
    if (
      object.pathname.endsWith('/') ||
      object.search.length > 0 ||
      objectSegments.length !== collectionSegments.length + 1 ||
      !collectionSegments.every((segment, index) => objectSegments[index] === segment)
    ) {
      throw unsafeTaskResourceLocation();
    }
    objectUrls.push(object.href);
  }

  return {
    objectUrls: [...new Set(objectUrls)].sort(),
    ignoredCollectionResponseCount,
  };
}

function safePathSegments(url: URL): string[] {
  const segments = url.pathname.split('/').slice(1);
  if (segments.at(-1) === '') segments.pop();
  return segments.map((segment) => {
    if (/%(?:2f|5c|00)/i.test(segment)) throw unsafeTaskResourceLocation();
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw unsafeTaskResourceLocation();
    }
    if (
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      hasControlCharacters(decoded)
    ) {
      throw unsafeTaskResourceLocation();
    }
    return decoded;
  });
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function pathsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((segment, index) => right[index] === segment);
}

function unsafeTaskResourceLocation(): CalendarProviderError {
  return new CalendarProviderError(
    'UNAVAILABLE',
    'Calendar returned an unsafe task resource location.',
  );
}

function normalizeComponents(components: string[] | undefined): string[] {
  return [...new Set((components ?? []).map((component) => component.trim().toUpperCase()))]
    .filter(Boolean)
    .sort();
}

function safeDisplayName(calendar: DAVCalendar): string {
  const value = typeof calendar.displayName === 'string' ? calendar.displayName.trim() : '';
  return truncate(value || 'Unnamed collection', 80);
}

function safeStatus(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  return truncate(value.trim().toUpperCase(), 40);
}

function safeCalendarValue(value: unknown): string | null {
  if (value instanceof ICAL.Time) return truncate(value.toString(), 64);
  if (typeof value === 'string' && value.trim().length > 0) return truncate(value.trim(), 64);
  return null;
}

function normalizeSampleLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_SAMPLE_LIMIT;
  if (!Number.isInteger(value) || value < 0 || value > MAX_SAMPLE_LIMIT) {
    throw new CalendarProviderError(
      'CONFIGURATION_REQUIRED',
      `Reminder sample limit must be a whole number from 0 to ${MAX_SAMPLE_LIMIT}.`,
    );
  }
  return value;
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

async function atProbeStage<T>(stage: ReminderProbeStage, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof CalendarProviderError) throw error;
    throw translateProviderError(error, stage);
  }
}

function translateProviderError(error: unknown, stage: ReminderProbeStage): CalendarProviderError {
  const status = statusFrom(error);
  if (status === 401 || status === 403) {
    return new CalendarProviderError(
      'AUTHENTICATION_REQUIRED',
      'Calendar sign-in needs attention.',
    );
  }
  return new CalendarProviderError(
    'UNAVAILABLE',
    `Calendar reminder capability check failed during ${stage}.`,
  );
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
