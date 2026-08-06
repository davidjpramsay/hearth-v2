export interface CalendarCapabilities {
  read: boolean;
  write: boolean;
}

export interface CalendarDescriptor {
  externalId: string;
  displayName: string;
  color: string;
  capabilities: CalendarCapabilities;
}

export interface ProviderCalendarEvent {
  externalId: string;
  calendarExternalId: string;
  providerVersion: string | null;
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  start: string;
  end: string;
  startLocalDate: string;
  endLocalDate: string;
  recurrenceMasterExternalId: string | null;
  isRecurrenceException: boolean;
  sourceModifiedAt: string | null;
}

export type CalendarSyncChange =
  | { type: 'upsert'; event: ProviderCalendarEvent }
  | {
      type: 'delete';
      calendarExternalId: string;
      externalId: string;
      deletedAt: string;
    };

export interface CalendarSyncResult {
  changes: CalendarSyncChange[];
  cursor: string;
  syncedAt: string;
  full: boolean;
}

export interface CalendarProvider {
  readonly providerType: string;
  listCalendars(): Promise<CalendarDescriptor[]>;
  syncEvents(input: {
    startDate: string;
    endDate: string;
    cursor: string | null;
  }): Promise<CalendarSyncResult>;
  getEvent(input: {
    calendarExternalId: string;
    eventExternalId: string;
  }): Promise<ProviderCalendarEvent | null>;
}

export class CalendarProviderError extends Error {
  constructor(
    readonly code: 'AUTHENTICATION_REQUIRED' | 'CONFIGURATION_REQUIRED' | 'UNAVAILABLE',
    message: string,
  ) {
    super(message);
    this.name = 'CalendarProviderError';
  }
}

export class UnconfiguredCalendarProvider implements CalendarProvider {
  readonly providerType = 'unconfigured';

  async listCalendars(): Promise<CalendarDescriptor[]> {
    throw this.error();
  }

  async syncEvents(_input: {
    startDate: string;
    endDate: string;
    cursor: string | null;
  }): Promise<CalendarSyncResult> {
    throw this.error();
  }

  async getEvent(_input: {
    calendarExternalId: string;
    eventExternalId: string;
  }): Promise<ProviderCalendarEvent | null> {
    throw this.error();
  }

  private error(): CalendarProviderError {
    return new CalendarProviderError(
      'CONFIGURATION_REQUIRED',
      'Choose approved calendars in the private server configuration.',
    );
  }
}

interface RevisionChange {
  revision: number;
  change: CalendarSyncChange;
}

export class FakeCalendarProvider implements CalendarProvider {
  readonly providerType = 'fake';
  private calendars: CalendarDescriptor[];
  private readonly events = new Map<string, ProviderCalendarEvent>();
  private readonly changes: RevisionChange[] = [];
  private revision = 1;
  private available = true;

  constructor(
    calendars: readonly CalendarDescriptor[],
    initialEvents: readonly ProviderCalendarEvent[],
  ) {
    this.calendars = calendars.map((calendar) => ({
      ...calendar,
      capabilities: { ...calendar.capabilities },
    }));
    for (const event of initialEvents) this.events.set(eventKey(event), event);
  }

  async listCalendars(): Promise<CalendarDescriptor[]> {
    this.assertAvailable();
    return this.calendars.map((calendar) => ({
      ...calendar,
      capabilities: { ...calendar.capabilities },
    }));
  }

  async syncEvents(input: {
    startDate: string;
    endDate: string;
    cursor: string | null;
  }): Promise<CalendarSyncResult> {
    this.assertAvailable();
    const cursorRevision = readCursor(input.cursor);
    const full = cursorRevision === null;
    const changes = full
      ? [...this.events.values()]
          .filter((event) => eventOverlaps(event, input.startDate, input.endDate))
          .map((event): CalendarSyncChange => ({ type: 'upsert', event: { ...event } }))
      : this.changes
          .filter((entry) => entry.revision > cursorRevision)
          .map((entry) => cloneChange(entry.change));
    return {
      changes,
      cursor: cursorFor(this.revision),
      syncedAt: '2026-08-03T07:42:00+08:00',
      full,
    };
  }

  async getEvent(input: {
    calendarExternalId: string;
    eventExternalId: string;
  }): Promise<ProviderCalendarEvent | null> {
    this.assertAvailable();
    const event = this.events.get(`${input.calendarExternalId}:${input.eventExternalId}`);
    return event === undefined ? null : { ...event };
  }

  queueUpsert(event: ProviderCalendarEvent): void {
    this.events.set(eventKey(event), { ...event });
    this.record({ type: 'upsert', event: { ...event } });
  }

  queueDelete(calendarExternalId: string, externalId: string, deletedAt: string): void {
    this.events.delete(`${calendarExternalId}:${externalId}`);
    this.record({ type: 'delete', calendarExternalId, externalId, deletedAt });
  }

  setAvailable(available: boolean): void {
    this.available = available;
  }

  setCalendars(calendars: readonly CalendarDescriptor[]): void {
    this.calendars = calendars.map((calendar) => ({
      ...calendar,
      capabilities: { ...calendar.capabilities },
    }));
  }

  currentCursor(): string {
    return cursorFor(this.revision);
  }

  private record(change: CalendarSyncChange): void {
    this.revision += 1;
    this.changes.push({ revision: this.revision, change });
  }

  private assertAvailable(): void {
    if (!this.available) {
      throw new CalendarProviderError('UNAVAILABLE', 'The fake calendar provider is unavailable.');
    }
  }
}

function eventKey(event: ProviderCalendarEvent): string {
  return `${event.calendarExternalId}:${event.externalId}`;
}

function eventOverlaps(event: ProviderCalendarEvent, startDate: string, endDate: string): boolean {
  return event.startLocalDate <= endDate && event.endLocalDate >= startDate;
}

function cursorFor(revision: number): string {
  return `fake_cursor_${revision}`;
}

function readCursor(cursor: string | null): number | null {
  if (cursor === null) return null;
  const match = /^fake_cursor_(\d+)$/.exec(cursor);
  return match === null ? null : Number.parseInt(match[1] ?? '0', 10);
}

function cloneChange(change: CalendarSyncChange): CalendarSyncChange {
  return change.type === 'upsert' ? { type: 'upsert', event: { ...change.event } } : { ...change };
}
