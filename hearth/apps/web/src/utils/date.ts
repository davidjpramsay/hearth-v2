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
