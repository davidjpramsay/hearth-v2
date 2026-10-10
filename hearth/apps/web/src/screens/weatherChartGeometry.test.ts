import { describe, expect, it } from 'vitest';
import type { HourlyWeatherForecast } from '@hearth/shared';

import { chartGeometry, weatherClock, weatherMinute } from './weatherChartGeometry';

const day = '2026-08-03';
const hours: HourlyWeatherForecast[] = Array.from({ length: 25 }, (_, index) => ({
  time: `${index === 24 ? '2026-08-04' : day}T${String(index % 24).padStart(2, '0')}:00`,
  temperatureCelsius: 10 + index,
  apparentTemperatureCelsius: 9 + index,
  condition: 'clear',
  label: 'Clear',
  precipitationProbabilityPercent: index,
  precipitationMillimetres: index / 10,
  windSpeedKph: index,
  windGustKph: index + 5,
  windDirectionDegrees: 0,
}));

describe('fixed weather day geometry', () => {
  it.each([0, 0.1, 1, 1.5, 4.8, 12, 49])(
    'gives %s mm a labelled zero-based rain lane separate from percent',
    (maximum) => {
      const samples = hours.map((hour) => ({ ...hour, precipitationMillimetres: maximum }));
      const graph = chartGeometry(samples, 'rain', day, 390, 268);
      expect(graph.ticks.map((tick) => tick.label)).toEqual(['0%', '50%', '100%']);
      expect(graph.rainMaximum).toBeGreaterThanOrEqual(Math.max(1, maximum));
      expect(graph.rainTicks[0]!.label).toBe('0');
      expect(Number(graph.rainTicks.at(-1)!.label)).toBe(graph.rainMaximum);
      expect(graph.rainY(0)).toBe(graph.baseline);
      expect(graph.rainY(graph.rainMaximum)).toBe(graph.rainTop);
      expect(graph.rainTop).toBeGreaterThan(graph.primaryBaseline);
      expect(graph.y(0)).toBe(graph.primaryBaseline);
      expect(graph.y(100)).toBe(graph.top);
      expect(graph.rainY(maximum)).toBeGreaterThanOrEqual(graph.rainTop);
      expect(graph.rainY(maximum)).toBeLessThanOrEqual(graph.baseline);
    },
  );

  it('does not rescale probability when expected rain changes and shows wind from zero', () => {
    const ordinary = chartGeometry(hours, 'rain', day, 1000, 238);
    const heavy = chartGeometry(
      hours.map((hour) => ({ ...hour, precipitationMillimetres: 50 })),
      'rain',
      day,
      1000,
      238,
    );
    expect(heavy.primaryPath).toBe(ordinary.primaryPath);
    expect(heavy.nowPoint(510)).toEqual(ordinary.nowPoint(510));
    const wind = chartGeometry(hours, 'wind', day, 1000, 238);
    expect(wind.ticks[0]!.value).toBe(0);
    expect(wind.y(0)).toBe(wind.baseline);
    expect(wind.ticks.map((tick) => tick.value)).toEqual([0, 10, 20, 30]);
    expect(wind.ticks.every((tick) => tick.label === String(tick.value))).toBe(true);
  });

  it('uses provider-local wall time and includes the following midnight endpoint', () => {
    expect(weatherMinute(hours[0]!.time, day)).toBe(0);
    expect(weatherMinute(hours[12]!.time, day)).toBe(720);
    expect(weatherMinute(hours[24]!.time, day)).toBe(1440);
  });

  it('converts the household clock without using the browser timezone', () => {
    expect(weatherClock('2026-08-03T00:30:00Z', 'Australia/Perth')).toEqual({ day, minute: 510 });
    expect(weatherClock('2026-08-03T16:00:00Z', 'Australia/Perth')).toEqual({
      day: '2026-08-04',
      minute: 0,
    });
    expect(weatherClock('2026-08-03T00:30:00Z', 'America/New_York')).toEqual({
      day: '2026-08-02',
      minute: 1230,
    });
  });

  it.each([
    [320, 190],
    [760, 190],
    [1500, 238],
    [3200, 238],
  ])('computes native-pixel geometry at %i × %i without stretching', (width, height) => {
    const graph = chartGeometry(hours, 'temperature', day, width, height);
    expect(graph.x(0)).toBe(graph.left);
    expect(graph.x(24)).toBe(graph.right);
    expect(graph.baseline).toBe(height - 34);
    expect(graph.hourY).toBe(height - 8);
    expect(graph.hourTicks[0]).toBe(0);
    expect(graph.hourTicks.at(-1)).toBe(1440);
    expect(graph.nowPoint(720)).toEqual([graph.x(12), graph.primaryY(12)]);
    expect(graph.barWidth).toBeLessThan((graph.right - graph.left) / 24);
  });

  it.each(['temperature', 'rain', 'wind'] as const)(
    'keeps the live %s dot on the curve between samples',
    (mode) => {
      const graph = chartGeometry(hours, mode, day, 1000, 238);
      const point = graph.nowPoint(510)!;
      expect(point[0]).toBe(graph.xMinute(510));
      expect(point[1]).toBeCloseTo((graph.primaryY(8) + graph.primaryY(9)) / 2);
      expect(graph.nowPoint(511)![0]).toBeGreaterThan(point[0]);
      expect(graph.nowPoint(-1)).toBeNull();
      expect(graph.nowPoint(1441)).toBeNull();
    },
  );

  it('does not connect missing samples, fabricate a dot in a gap, or move midnight to the first available hour', () => {
    const incomplete = hours.filter((_, index) => index !== 9 && index > 3);
    const graph = chartGeometry(incomplete, 'temperature', day, 1000, 238);
    expect(graph.x(0)).toBe(graph.xMinute(240));
    expect(graph.nowPoint(510)).toBeNull();
    expect(graph.nowPoint(60)).toBeNull();
    expect(graph.primaryPath.match(/M /g)).toHaveLength(2);
    expect(graph.secondaryPath.match(/M /g)).toHaveLength(2);
    expect(graph.areaPath.match(/Z/g)).toHaveLength(2);
  });
});
