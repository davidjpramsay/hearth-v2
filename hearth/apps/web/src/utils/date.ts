import { localDateInTimezone } from '@hearth/core';
import type { CalendarEvent } from '@hearth/shared';

export function formatTime(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(value));
}

export function formatEventTime(
  event: Pick<CalendarEvent, 'allDay' | 'start'>,
  timezone: string,
): string {
  return event.allDay ? 'All day' : formatTime(event.start, timezone);
}

export function formatEventDayTime(event: CalendarEvent, date: string, timezone: string): string {
  if (event.allDay) return 'All day';
  if (localDateInTimezone(event.start, timezone) < date) {
    return localDateInTimezone(event.end, timezone) > date
      ? 'Continues'
      : `Until ${formatTime(event.end, timezone)}`;
  }
  return formatTime(event.start, timezone);
}

export function formatEventDateRange(event: CalendarEvent, timezone: string): string {
  const dateLabel = (date: string) =>
    new Intl.DateTimeFormat('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(new Date(`${date}T12:00:00Z`));
  if (event.allDay) {
    const dates =
      event.startLocalDate === event.endLocalDate
        ? dateLabel(event.startLocalDate)
        : `${dateLabel(event.startLocalDate)} – ${dateLabel(event.endLocalDate)}`;
    return `${dates} · All day`;
  }
  const startDate = localDateInTimezone(event.start, timezone);
  const endDate = localDateInTimezone(event.end, timezone);
  const end =
    startDate === endDate
      ? formatTime(event.end, timezone)
      : `${dateLabel(endDate)} · ${formatTime(event.end, timezone)}`;
  return `${dateLabel(startDate)} · ${formatTime(event.start, timezone)} – ${end}`;
}
