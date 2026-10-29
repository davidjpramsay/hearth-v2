import type { IndoorClimate, IndoorMetric, IndoorSample } from '@hearth/shared';
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
  size: { width: number; height: number },
  data: Pick<IndoorClimate, 'start' | 'end' | 'intervalSeconds' | 'timezone' | 'period'>,
  metric: IndoorMetric,
) {
  const values = samples.flatMap((point) =>
    [point.min, point.mean, point.max].filter((value) => value !== null),
  );
  let low = metric === 'humidity' ? 0 : Math.floor(Math.min(...values, 15) - 1);
  let high = metric === 'humidity' ? 100 : Math.ceil(Math.max(...values, 25) + 1);
  if (high <= low) {
    low -= 1;
    high += 1;
  }
  const start = Date.parse(data.start),
    end = Date.parse(data.end),
    width = Math.max(1, size.width - 56),
    height = Math.max(1, size.height - 36);
  const x = (at: string) =>
    44 + Math.max(0, Math.min(1, (Date.parse(at) - start) / (end - start))) * width;
  const y = (value: number) => 10 + (1 - (value - low) / (high - low)) * height;
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
      const px = x(sample.at),
        py = y(sample.mean);
      path += `${path ? 'L' : 'M'}${px.toFixed(2)},${py.toFixed(2)} `;
      dots.push({ x: px, y: py });
    }
    if (sample.min !== null && sample.max !== null)
      ranges.push({
        x: x(sample.at),
        y: y(sample.max),
        width: Math.max(1, Math.min(size.width - 12, x(sample.end)) - x(sample.at)),
        height: Math.max(1, y(sample.min) - y(sample.max)),
      });
    last = sample.mean === null ? -Infinity : time;
  }
  if (path) paths.push(path);
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: data.timezone,
    ...(data.period === 'day'
      ? { hour: 'numeric' as const, minute: '2-digit' as const }
      : data.period === 'year'
        ? { month: 'short' as const, year: '2-digit' as const }
        : { day: 'numeric' as const, month: 'short' as const }),
  });
  return {
    paths,
    dots,
    ranges,
    ticks: [0, 0.5, 1].map((fraction) => ({
      value: low + (high - low) * fraction,
      y: y(low + (high - low) * fraction),
    })),
    labels: [0, 0.5, 1].map((fraction) => ({
      x: 44 + fraction * width,
      text: formatter.format(new Date(start + (end - start) * fraction)),
    })),
  };
}
