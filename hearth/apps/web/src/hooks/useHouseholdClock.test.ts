import { describe, expect, it } from 'vitest';

import { formatHouseholdTime } from './useHouseholdClock';

describe('household clock', () => {
  it('formats the same instant in the configured household timezone', () => {
    const instant = new Date('2026-08-02T23:42:00.000Z');
    expect(formatHouseholdTime(instant, 'en-AU', 'Australia/Perth')).toBe('7:42 am');
    expect(formatHouseholdTime(instant, 'en-AU', 'Australia/Sydney')).toBe('9:42 am');
  });
});
