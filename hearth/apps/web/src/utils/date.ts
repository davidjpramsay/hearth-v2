import type { CalendarEvent } from '@hearth/shared';

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Australia/Perth',
  }).format(new Date(value));
}

export function formatEventTime(event: Pick<CalendarEvent, 'allDay' | 'start'>): string {
  return event.allDay ? 'All day' : formatTime(event.start);
}
