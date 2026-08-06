import type { CalendarEvent } from '@hearth/shared';

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface MonthGridDay {
  localDate: string;
  dayNumber: number;
  inMonth: boolean;
  isToday: boolean;
}

export interface MonthGrid {
  startDate: string;
  endDate: string;
  days: MonthGridDay[];
}

export function addLocalDays(localDate: string, dayCount: number): string {
  assertLocalDate(localDate);
  const date = new Date(`${localDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayCount);
  return date.toISOString().slice(0, 10);
}

export function localDateInTimezone(timestamp: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get('year');
  const month = values.get('month');
  const day = values.get('day');
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Could not project ${timestamp} into ${timezone}.`);
  }
  return `${year}-${month}-${day}`;
}

export function calendarEventOverlapsRange(
  event: Pick<CalendarEvent, 'startLocalDate' | 'endLocalDate'>,
  startDate: string,
  endDate: string,
): boolean {
  assertLocalDate(startDate);
  assertLocalDate(endDate);
  return event.startLocalDate <= endDate && event.endLocalDate >= startDate;
}

export function calendarEventOccursOn(
  event: Pick<CalendarEvent, 'startLocalDate' | 'endLocalDate'>,
  localDate: string,
): boolean {
  return calendarEventOverlapsRange(event, localDate, localDate);
}

export function createMonthGrid(month: string, today: string): MonthGrid {
  if (!MONTH_PATTERN.test(month)) {
    throw new Error(`Expected a YYYY-MM month, received ${month}.`);
  }
  assertLocalDate(today);
  const firstDate = `${month}-01`;
  const firstWeekday = new Date(`${firstDate}T12:00:00.000Z`).getUTCDay();
  const leadingDays = (firstWeekday + 6) % 7;
  const startDate = addLocalDays(firstDate, -leadingDays);
  const days = Array.from({ length: 42 }, (_, index) => {
    const localDate = addLocalDays(startDate, index);
    return {
      localDate,
      dayNumber: Number(localDate.slice(-2)),
      inMonth: localDate.startsWith(`${month}-`),
      isToday: localDate === today,
    };
  });
  return { startDate, endDate: days[41]!.localDate, days };
}

function assertLocalDate(localDate: string): void {
  if (!LOCAL_DATE_PATTERN.test(localDate)) {
    throw new Error(`Expected a YYYY-MM-DD local date, received ${localDate}.`);
  }
}
