import { describe, expect, it } from 'vitest';

import { formatChoreTiming } from './choreTiming';

describe('chore timing labels', () => {
  it('keeps same-period windows compact for dense television rows', () => {
    expect(formatChoreTiming('07:00', '07:30')).toBe('7:00–7:30 am');
  });

  it('keeps the day period on both sides when a window crosses noon', () => {
    expect(formatChoreTiming('11:30', '13:00')).toBe('11:30 am–1:00 pm');
  });

  it('labels one-sided availability and deadlines honestly', () => {
    expect(formatChoreTiming('16:00', null)).toBe('From 4:00 pm');
    expect(formatChoreTiming(null, '18:30')).toBe('Due 6:30 pm');
    expect(formatChoreTiming(null, null)).toBeNull();
  });
});
