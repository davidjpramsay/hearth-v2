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
    expect(result.ticks.map((tick) => tick.value)).toEqual([0, 50, 100]);
    expect(result.dots).toHaveLength(1);
    expect(result.paths[0]).toMatch(/^M/);
    expect(result.labels).toHaveLength(3);
    expect(result.labels[2]?.x).toBe(288);
  });
  it('duration-weights averages and never reports missing readings as zero', () => {
    expect(indoorSummary([])).toEqual({ min: null, mean: null, max: null });
    expect(
      indoorSummary([point(0, 10), { ...point(1, 30), end: '2026-10-29T01:30:00Z' }]).mean,
    ).toBeCloseTo(50 / 3);
    expect(indoorSummary([point(0, 0)])).toEqual({ min: -1, mean: 0, max: 1 });
  });
});
