import { describe, expect, it } from 'vitest';

import {
  addLocalDays,
  calendarEventOccursOn,
  calendarEventOverlapsRange,
  createMonthGrid,
  localDateInTimezone,
} from './calendar.js';

describe('calendar projection dates', () => {
  it('advances household-local dates without depending on the process timezone', () => {
    expect(addLocalDays('2026-08-03', 6)).toBe('2026-08-09');
    expect(addLocalDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('projects imported instants through DST while Perth remains stable', () => {
    expect(localDateInTimezone('2026-10-04T13:30:00.000Z', 'Australia/Sydney')).toBe('2026-10-05');
    expect(localDateInTimezone('2026-10-04T13:30:00.000Z', 'Australia/Perth')).toBe('2026-10-04');
    expect(localDateInTimezone('2026-04-04T16:30:00.000Z', 'Australia/Sydney')).toBe('2026-04-05');
  });

  it('keeps multi-day and all-day projections visible on each inclusive local date', () => {
    const event = { startLocalDate: '2026-08-03', endLocalDate: '2026-08-05' };
    expect(calendarEventOccursOn(event, '2026-08-04')).toBe(true);
    expect(calendarEventOccursOn(event, '2026-08-06')).toBe(false);
    expect(calendarEventOverlapsRange(event, '2026-08-05', '2026-08-09')).toBe(true);
  });

  it('builds a stable Monday-first six-week month grid', () => {
    const grid = createMonthGrid('2026-08', '2026-08-03');
    expect(grid).toMatchObject({ startDate: '2026-07-27', endDate: '2026-09-06' });
    expect(grid.days).toHaveLength(42);
    expect(grid.days[7]).toEqual({
      localDate: '2026-08-03',
      dayNumber: 3,
      inMonth: true,
      isToday: true,
    });
    expect(grid.days.filter((day) => day.inMonth)).toHaveLength(31);
  });

  it('rejects malformed month keys', () => {
    expect(() => createMonthGrid('2026-13', '2026-08-03')).toThrow('Expected a YYYY-MM month');
  });
});
