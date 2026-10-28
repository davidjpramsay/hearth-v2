import { localDateInTimezone } from './calendar.js';

export function morningIsWeekday(localDate: string): boolean {
  const day = new Date(`${localDate}T12:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

/** Household wall-clock schedule, independent of screen lifetime or the browser timezone. */
export function morningClock(
  timestamp: string,
  timezone: string,
  startTime: string,
  endTime: string,
) {
  const localDate = localDateInTimezone(timestamp, timezone);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const value = (name: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === name)?.value ?? 0);
  const seconds = value('hour') * 3600 + value('minute') * 60 + value('second');
  const toSeconds = (time: string) => Number(time.slice(0, 2)) * 3600 + Number(time.slice(3)) * 60;
  const start = toSeconds(startTime),
    end = toSeconds(endTime);
  const isWeekday = morningIsWeekday(localDate);
  const phase = !isWeekday
    ? 'weekend'
    : seconds < start
      ? 'before'
      : seconds >= end
        ? 'finished'
        : 'running';
  return {
    localDate,
    phase,
    remainingSeconds: Math.max(0, Math.min(end - start, end - seconds)),
    elapsedFraction: Math.max(0, Math.min(1, (seconds - start) / (end - start))),
  };
}
