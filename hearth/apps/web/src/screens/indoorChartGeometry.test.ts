import { describe, expect, it } from 'vitest';
import { indoorGeometry, indoorSummary } from './indoorChartGeometry';
const data = {
  start: '2026-10-29T00:00:00Z',
  end: '2026-10-30T00:00:00Z',
  intervalSeconds: 3600,
  timezone: 'Australia/Perth',
  period: 'day' as const,
};
const point = (hour: number, mean: number | null = 20) => ({
  at: `2026-10-29T${String(hour).padStart(2, '0')}:00:00Z`,
  end: `2026-10-29T${String(hour + 1).padStart(2, '0')}:00:00Z`,
  mean,
  min: mean === null ? null : mean - 1,
  max: mean === null ? null : mean + 1,
});
describe('indoor history geometry', () => {
  it('leaves missing periods and null readings as gaps rather than joining a fabricated trend', () => {
    const result = indoorGeometry(
      [point(0), point(1), point(4), point(5, null), point(6)],
      { width: 400, height: 220 },
      data,
      'temperature',
    );
    expect(result.paths).toHaveLength(3);
    expect(result.dots).toHaveLength(4);
    expect(result.paths.join('')).not.toMatch(/NaN|Infinity/);
    expect(result.dots[0]?.x).toBe(44);
    expect(result.dots.at(-1)!.x).toBeLessThan(200);
  });
  it('keeps humidity in percent, measured phone geometry and single-point history visible', () => {
    const result = indoorGeometry([point(12, 50)], { width: 300, height: 180 }, data, 'humidity');
    expect(result.ticks.map((tick) => tick.value)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(result.dots).toHaveLength(1);
    expect(result.paths[0]).toMatch(/^M/);
    expect(result.labels.map((label) => label.text)).toEqual(['12pm', '6pm', '12am', '6am']);
    expect(result.labels.every((label) => label.left >= 0 && label.right <= 300)).toBe(true);
  });
  it.each([
    [20, 20],
    [19.3, 22.7],
    [-12.5, -4.1],
    [-2, 43],
  ])('encloses %s to %s Celsius with distinct, regular whole-number ticks', (min, max) => {
    const result = indoorGeometry(
      [{ ...point(0), min, max, mean: (min + max) / 2 }],
      { width: 500, height: 220 },
      data,
      'temperature',
    );
    const values = result.ticks.map((tick) => tick.value);
    expect(values[0]).toBeLessThan(min);
    expect(values.at(-1)).toBeGreaterThan(max);
    expect(values.length).toBeGreaterThanOrEqual(5);
    expect(values.every(Number.isInteger)).toBe(true);
    const step = values[1]! - values[0]!;
    expect(values.slice(1).every((value, index) => value - values[index]! === step)).toBe(true);
    expect(result.dots[0]!.y).toBeGreaterThan(result.ticks.at(-1)!.y);
    expect(result.dots[0]!.y).toBeLessThan(result.ticks[0]!.y);
  });
  it('keeps vertical labels apart in the compact TV chart', () => {
    const result = indoorGeometry(
      [point(0, 50)],
      { width: 500, height: 130, fontSize: 18 },
      data,
      'humidity',
    );
    expect(result.ticks.map((tick) => tick.value)).toEqual([0, 25, 50, 75, 100]);
    expect(result.ticks[0]!.y - result.ticks[1]!.y).toBeGreaterThan(18);
  });
  it('retains five temperature labels when a compact chart needs a coarser scale', () => {
    const result = indoorGeometry(
      [{ ...point(0), min: 19, max: 29, mean: 24 }],
      { width: 500, height: 130, fontSize: 18 },
      data,
      'temperature',
    );
    expect(result.ticks.map((tick) => tick.value)).toEqual([15, 20, 25, 30, 35]);
    expect(result.ticks[0]!.y - result.ticks[1]!.y).toBeGreaterThan(18);
  });
  it.each(['Australia/Perth', 'Australia/Adelaide', 'Asia/Kathmandu', 'Pacific/Chatham'])(
    'uses whole local hours in %s even when the rolling window starts at an odd minute',
    (timezone) => {
      const window = {
        ...data,
        start: '2026-10-29T02:15:37Z',
        end: '2026-10-30T02:15:37Z',
        timezone,
      };
      const result = indoorGeometry(
        [],
        { width: 760, height: 220, fontSize: 18 },
        window,
        'temperature',
      );
      const clock = new Intl.DateTimeFormat('en-AU', {
        timeZone: timezone,
        minute: '2-digit',
        second: '2-digit',
      });
      expect(result.labels.length).toBeGreaterThanOrEqual(6);
      for (const label of result.labels) {
        expect(clock.format(label.at)).toBe('00:00');
        expect(label.text).not.toContain(':');
        expect(label.x).toBeCloseTo(
          44 + ((label.at - Date.parse(window.start)) / 86_400_000) * (760 - 56),
        );
      }
    },
  );
  it.each([360, 375, 390])('retains at least three year labels on a %spx phone', (viewport) => {
    const result = indoorGeometry(
      [],
      { width: viewport - 74, height: 180 },
      { ...data, period: 'year', start: '2025-10-29T02:15:00Z', end: '2026-10-29T02:15:00Z' },
      'temperature',
    );
    expect(result.labels.length).toBeGreaterThanOrEqual(3);
    expect(
      result.labels.every(
        (label, index) => index === 0 || label.left >= result.labels[index - 1]!.right + 8,
      ),
    ).toBe(true);
  });
  it.each([
    ['2026-10-03T12:15:00Z', '2026-10-04T12:15:00Z'],
    ['2026-04-04T12:15:00Z', '2026-04-05T12:15:00Z'],
  ])('preserves elapsed positions through Sydney DST from %s', (start, end) => {
    const window = { ...data, start, end, timezone: 'Australia/Sydney' };
    const result = indoorGeometry([], { width: 760, height: 220 }, window, 'temperature');
    const clock = new Intl.DateTimeFormat('en-AU', {
      timeZone: window.timezone,
      minute: '2-digit',
    });
    expect(result.labels.length).toBeGreaterThanOrEqual(6);
    expect(result.labels.every((label) => clock.format(label.at) === '0')).toBe(true);
    expect(
      result.labels.every((label, index) => index === 0 || label.at > result.labels[index - 1]!.at),
    ).toBe(true);
  });
  it.each([
    ['week', 7],
    ['month', 30],
    ['year', 365],
  ] as const)(
    'uses local calendar boundaries and responsive non-overlapping %s labels',
    (period, days) => {
      const end = '2026-10-29T02:15:00Z';
      const window = {
        ...data,
        start: new Date(Date.parse(end) - days * 86_400_000).toISOString(),
        end,
        period,
        timezone: 'Australia/Sydney',
      };
      const phone = indoorGeometry([], { width: 320, height: 180 }, window, 'temperature');
      const tv = indoorGeometry(
        [],
        { width: 760, height: 330, fontSize: 18 },
        window,
        'temperature',
      );
      expect(phone.labels.length).toBeGreaterThanOrEqual(3);
      expect(tv.labels.length).toBeGreaterThan(phone.labels.length);
      const clock = new Intl.DateTimeFormat('en-AU', {
        timeZone: window.timezone,
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hourCycle: 'h23',
      });
      for (const result of [phone, tv]) {
        result.labels.forEach((label, index) => {
          const parts = clock.formatToParts(label.at);
          expect(parts.find((part) => part.type === 'hour')?.value).toBe('00');
          expect(parts.find((part) => part.type === 'minute')?.value).toBe('00');
          if (period === 'year') expect(parts.find((part) => part.type === 'day')?.value).toBe('1');
          if (index > 0)
            expect(label.left - result.labels[index - 1]!.right).toBeGreaterThanOrEqual(8);
        });
      }
    },
  );
  it('duration-weights averages and never reports missing readings as zero', () => {
    expect(indoorSummary([])).toEqual({ min: null, mean: null, max: null });
    expect(
      indoorSummary([point(0, 10), { ...point(1, 30), end: '2026-10-29T01:30:00Z' }]).mean,
    ).toBeCloseTo(50 / 3);
    expect(indoorSummary([point(0, 0)])).toEqual({ min: -1, mean: 0, max: 1 });
  });
});
