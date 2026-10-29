import type { IndoorClimate, IndoorMetric, IndoorSample } from '@hearth/shared';
import { indoorTimeLabels, indoorValueScale } from './indoorChartAxes';
export function indoorSummary(samples: IndoorSample[]) {
  const minimum = samples.flatMap((point) => (point.min === null ? [] : [point.min]));
  const maximum = samples.flatMap((point) => (point.max === null ? [] : [point.max]));
  let total = 0,
    duration = 0;
  for (const point of samples)
    if (point.mean !== null) {
      const weight = Math.max(0, Date.parse(point.end) - Date.parse(point.at));
      total += point.mean * weight;
      duration += weight;
    }
  return {
    min: minimum.length ? Math.min(...minimum) : null,
    max: maximum.length ? Math.max(...maximum) : null,
    mean: duration > 0 ? total / duration : null,
  };
}

export function indoorGeometry(
  samples: IndoorSample[],
  size: { width: number; height: number; fontSize?: number },
  data: Pick<IndoorClimate, 'start' | 'end' | 'intervalSeconds' | 'timezone' | 'period'>,
  metric: IndoorMetric,
) {
  const values = samples.flatMap((point) =>
    [point.min, point.mean, point.max].filter((value) => value !== null),
  );
  const start = Date.parse(data.start),
    end = Date.parse(data.end),
    width = Math.max(1, size.width - 56),
    fontSize = size.fontSize ?? 14,
    height = Math.max(1, size.height - fontSize * 2 - 16);
  const { low, high, step } = indoorValueScale(values, metric, height, fontSize);
  const x = (at: number) => 44 + Math.max(0, Math.min(1, (at - start) / (end - start))) * width;
  const y = (value: number) => fontSize + (1 - (value - low) / (high - low)) * height;
  const paths: string[] = [],
    dots: { x: number; y: number }[] = [],
    ranges: { x: number; y: number; width: number; height: number }[] = [];
  let path = '',
    last = -Infinity;
  for (const sample of samples) {
    const time = Date.parse(sample.at);
    if (sample.mean === null || time - last > data.intervalSeconds * 1800) {
      if (path) paths.push(path);
      path = '';
    }
    if (sample.mean !== null) {
      const px = x(time),
        py = y(sample.mean);
      path += `${path ? 'L' : 'M'}${px.toFixed(2)},${py.toFixed(2)} `;
      dots.push({ x: px, y: py });
    }
    if (sample.min !== null && sample.max !== null)
      ranges.push({
        x: x(time),
        y: y(sample.max),
        width: Math.max(1, Math.min(size.width - 12, x(Date.parse(sample.end))) - x(time)),
        height: Math.max(1, y(sample.min) - y(sample.max)),
      });
    last = sample.mean === null ? -Infinity : time;
  }
  if (path) paths.push(path);
  return {
    paths,
    dots,
    ranges,
    baseline: y(low),
    labelY: size.height - fontSize / 2,
    ticks: Array.from({ length: Math.round((high - low) / step) + 1 }, (_, index) => {
      const value = low + step * index;
      return { value, y: y(value) };
    }),
    labels: indoorTimeLabels(data, { width: size.width, fontSize }, x),
  };
}
