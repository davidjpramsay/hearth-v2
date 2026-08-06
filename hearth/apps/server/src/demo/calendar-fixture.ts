import { createDemoSeed, DEMO_NOW } from './seed.js';
import type {
  CalendarDescriptor,
  ProviderCalendarEvent,
} from '../integrations/calendar-provider.js';

export interface DemoCalendarFixture {
  calendars: CalendarDescriptor[];
  events: ProviderCalendarEvent[];
  ownerByCalendarExternalId: ReadonlyMap<string, string | null>;
  syncedAt: string;
}

export function createDemoCalendarFixture(): DemoCalendarFixture {
  const seed = createDemoSeed();
  return {
    calendars: seed.calendars.map((calendar) => ({
      externalId: calendar.id,
      displayName: calendar.displayName,
      color: calendar.color,
      capabilities: { read: true, write: calendar.access === 'read-write' },
    })),
    events: seed.events.map((event) => ({
      externalId: event.id,
      calendarExternalId: event.calendarId,
      providerVersion: event.providerVersion,
      title: event.title,
      description: null,
      location: event.location,
      allDay: event.allDay,
      start: event.start,
      end: event.end,
      startLocalDate: event.startLocalDate,
      endLocalDate: event.endLocalDate,
      recurrenceMasterExternalId: event.recurrenceMasterId,
      isRecurrenceException: event.isRecurrenceException,
      sourceModifiedAt: DEMO_NOW,
    })),
    ownerByCalendarExternalId: new Map(
      seed.calendars.map((calendar) => [calendar.id, calendar.owner?.id ?? null]),
    ),
    syncedAt: DEMO_NOW,
  };
}
