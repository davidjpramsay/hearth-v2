import type { HourlyWeatherForecast } from '@hearth/shared';

export type WeatherMode = 'temperature' | 'rain' | 'wind';
type Point = readonly [number, number];

// Forecast timestamps are provider-local wall times, not browser-local instants.
export function weatherMinute(time: string, day: string): number {
  return (Date.parse(`${time}:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 60_000;
}

export function weatherClock(instant: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((value) => value.type === type)!.value;
  return {
    day: `${part('year')}-${part('month')}-${part('day')}`,
    minute: Number(part('hour')) * 60 + Number(part('minute')),
  };
}

export function chartGeometry(
  hours: readonly HourlyWeatherForecast[],
  mode: WeatherMode,
  day: string,
  width: number,
  height: number,
) {
  const primaryValues = hours.map((hour) =>
    mode === 'temperature'
      ? hour.temperatureCelsius
      : mode === 'rain'
        ? hour.precipitationProbabilityPercent
        : hour.windSpeedKph,
  );
  const secondaryValues = hours.map((hour) =>
    mode === 'temperature'
      ? hour.apparentTemperatureCelsius
      : mode === 'rain'
        ? hour.precipitationMillimetres
        : hour.windGustKph,
  );
  const minValue =
    mode === 'rain' ? 0 : Math.floor(Math.min(...primaryValues, ...secondaryValues) / 5) * 5;
  const maxValue =
    mode === 'rain'
      ? 100
      : Math.max(minValue + 5, Math.ceil(Math.max(...primaryValues, ...secondaryValues) / 5) * 5);
  const top = 16;
  const baseline = height - 34;
  const left = width < 600 ? 42 : 58;
  const right = width - (width < 600 ? 24 : 30);
  const xMinute = (minute: number) => left + ((right - left) * minute) / 1440;
  const minutes = hours.map((hour) => weatherMinute(hour.time, day));
  const x = (index: number) => xMinute(minutes[index] ?? 0);
  const y = (value: number) =>
    baseline - ((value - minValue) / (maxValue - minValue)) * (baseline - top);
  const primaryCoordinates = primaryValues.map((value, index) => [x(index), y(value)] as const);
  const secondaryScaleMaximum = Math.max(3, ...secondaryValues);
  const secondaryCoordinates = secondaryValues.map(
    (value, index) =>
      [
        x(index),
        mode === 'rain' ? baseline - (value / secondaryScaleMaximum) * (baseline - top) : y(value),
      ] as const,
  );
  const segments = (points: readonly Point[]) => {
    const result: Point[][] = [];
    points.forEach((point, index) => {
      if (index === 0 || minutes[index]! - minutes[index - 1]! > 60) result.push([]);
      result.at(-1)!.push(point);
    });
    return result;
  };
  const primarySegments = segments(primaryCoordinates);
  const nowPoint = (minute: number): Point | null => {
    const exact = minutes.indexOf(minute);
    if (exact >= 0) return primaryCoordinates[exact]!;
    const next = minutes.findIndex((value) => value > minute);
    if (next < 1 || minutes[next]! - minutes[next - 1]! > 60) return null;
    const previous = next - 1;
    const fraction = (minute - minutes[previous]!) / (minutes[next]! - minutes[previous]!);
    // Control-point x values at thirds give linear time and smooth, bounded y.
    const eased = fraction * fraction * (3 - 2 * fraction);
    return [
      xMinute(minute),
      primaryCoordinates[previous]![1] +
        eased * (primaryCoordinates[next]![1] - primaryCoordinates[previous]![1]),
    ];
  };
  return {
    areaPath: primarySegments
      .map(
        (points) =>
          `${smoothPath(points)} L ${points.at(-1)![0]} ${baseline} L ${points[0]![0]} ${baseline} Z`,
      )
      .join(' '),
    primaryPath: primarySegments.map(smoothPath).join(' '),
    secondaryPath: segments(secondaryCoordinates).map(smoothPath).join(' '),
    baseline,
    top,
    left,
    right,
    hourY: height - 8,
    barWidth: Math.max(2, Math.min(24, ((right - left) / 24) * 0.7)),
    primaryY: (index: number) => primaryCoordinates[index]?.[1] ?? baseline,
    ticks: Array.from({ length: 5 }, (_, index) => {
      const value = minValue + ((maxValue - minValue) * index) / 4;
      return {
        value,
        y: y(value),
        label: `${Math.round(value)}${mode === 'temperature' ? '°' : mode === 'rain' ? '%' : ''}`,
      };
    }),
    hourTicks: Array.from(
      { length: width < 600 ? 5 : 7 },
      (_, index) => index * (width < 600 ? 360 : 240),
    ),
    markerStep: width < 600 ? 6 : width < 1000 ? 3 : 2,
    nowPoint,
    x,
    xMinute,
    y,
  };
}

function smoothPath(points: readonly Point[]): string {
  const first = points[0];
  if (first === undefined) return '';
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index]!;
    const distance = (point[0] - previous[0]) / 3;
    return `${path} C ${previous[0] + distance} ${previous[1]}, ${point[0] - distance} ${point[1]}, ${point[0]} ${point[1]}`;
  }, `M ${first[0]} ${first[1]}`);
}
