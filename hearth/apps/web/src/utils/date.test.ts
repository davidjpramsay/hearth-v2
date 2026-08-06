import { describe, expect, it } from 'vitest';

import { formatEventTime, formatTime } from './date';

describe('calendar display time', () => {
  it('labels normalized all-day events without manufacturing a clock time', () => {
    expect(formatEventTime({ allDay: true, start: '2026-08-03T00:00:00+08:00' })).toBe('All day');
  });

  it('renders timed provider events in the Hearth household timezone', () => {
    expect(formatTime('2026-08-02T23:15:00.000Z')).toBe('7:15 am');
    expect(formatEventTime({ allDay: false, start: '2026-08-03T15:20:00+08:00' })).toBe('3:20 pm');
  });
});
