import type { IndoorClimate, IndoorMetric } from '@hearth/shared';

type HistoryWindow = Pick<IndoorClimate, 'start' | 'end' | 'timezone' | 'period'>;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function indoorValueScale(
  values: number[],
  metric: IndoorMetric,
  height: number,
  fontSize: number,
) {
  if (metric === 'humidity') return { low: 0, high: 100, step: height < fontSize * 6 ? 25 : 20 };
  const minimum = values.length ? Math.min(...values) : 15;
  const maximum = values.length ? Math.max(...values) : 25;
  const range = maximum - minimum;
  const padding = Math.max(1, (4 - range) / 2, range * 0.1);
  const intervals = Math.max(4, Math.min(6, Math.floor(height / (fontSize + 12))));
  const rough = Math.max(1, (maximum - minimum + padding * 2) / intervals);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].find((value) => value * magnitude >= rough)! * magnitude;
  let low = Math.floor((minimum - padding) / step) * step;
  let high = Math.ceil((maximum + padding) / step) * step;
  // Keep five useful values even when a short chart needs a coarser nice step.
  while ((high - low) / step < 4) {
    if (minimum - low < high - maximum) low -= step;
    else high += step;
  }
  return { low, high, step };
}

export function indoorTimeLabels(
  data: HistoryWindow,
  size: { width: number; fontSize: number },
  x: (instant: number) => number,
) {
  const start = Date.parse(data.start),
    end = Date.parse(data.end);
  const clock = new Intl.DateTimeFormat('en-CA', {
    timeZone: data.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  // A UTC-shaped wall clock is only used to enumerate local calendar boundaries.
  // Positions always use real instants, including DST and non-whole-hour offsets.
  const localClock = (at: number) => {
    const parts = clock.formatToParts(at);
    const part = (key: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((item) => item.type === key)!.value);
    return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
  };
  const midnight = (wall: number): number | null => {
    let instant = wall;
    for (let attempt = 0; attempt < 4; attempt++) {
      const difference = wall - localClock(instant);
      if (difference === 0) return instant;
      instant += difference;
    }
    // Some zones skip midnight during DST. Omit that boundary rather than mislabel it.
    return null;
  };
  const candidates: { at: number; index: number }[] = [];
  if (data.period === 'day') {
    // Modern IANA offsets (including quarter/half-hour zones) and DST transitions.
    for (let at = Math.ceil(start / (HOUR / 4)) * (HOUR / 4); at <= end; at += HOUR / 4) {
      const local = new Date(localClock(at));
      if (local.getUTCMinutes() === 0) candidates.push({ at, index: local.getUTCHours() });
    }
  } else {
    const first = new Date(localClock(start));
    const last = localClock(end);
    first.setUTCHours(0, 0, 0, 0);
    if (data.period === 'year') first.setUTCDate(1);
    for (let wall = first.getTime(); wall <= last; wall = first.getTime()) {
      const at = midnight(wall);
      const index = data.period === 'year' ? first.getUTCMonth() : Math.round(wall / DAY) - 4; // Monday anchors weekly marks.
      if (at !== null && at >= start && at <= end) candidates.push({ at, index });
      if (data.period === 'year') first.setUTCMonth(first.getUTCMonth() + 1);
      else first.setUTCDate(first.getUTCDate() + 1);
    }
  }
  const formatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: data.timezone,
    ...(data.period === 'day'
      ? { hour: 'numeric' as const, hour12: true }
      : data.period === 'year'
        ? { month: 'short' as const, year: '2-digit' as const }
        : { day: 'numeric' as const, month: 'short' as const }),
  });
  const steps = {
    day: [1, 2, 3, 6, 12],
    week: [1, 2, 3, 7],
    month: [2, 5, 7, 10, 15],
    year: [1, 2, 3, 4, 6],
  }[data.period];
  for (const step of steps) {
    const labels = candidates
      .filter(({ index }) => index % step === 0)
      .map(({ at }) => {
        const text = formatter.format(at).replace(/\s+/g, data.period === 'day' ? '' : ' ');
        const width = text.length * size.fontSize * 0.6;
        const position = x(at);
        const anchor =
          position - width / 2 < 0
            ? ('start' as const)
            : position + width / 2 > size.width
              ? ('end' as const)
              : ('middle' as const);
        const left = position - (anchor === 'middle' ? width / 2 : anchor === 'end' ? width : 0);
        return { at, x: position, text, anchor, left, right: left + width };
      });
    if (labels.every((label, index) => index === 0 || label.left >= labels[index - 1]!.right + 8))
      return labels;
  }
  return [];
}
