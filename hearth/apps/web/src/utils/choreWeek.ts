import { addLocalDays, localDateOffset } from '@hearth/core';

export function earlierWeekDates(weekStart: string, localDate: string): string[] {
  const daysSinceWeekStart = Math.max(0, Math.min(6, localDateOffset(weekStart, localDate)));
  return Array.from({ length: daysSinceWeekStart }, (_, index) =>
    addLocalDays(localDate, -(index + 1)),
  );
}
