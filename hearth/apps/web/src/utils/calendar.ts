import type { CalendarEvent, DailyForecast, WeekDay } from '@hearth/shared';

import type { IconName } from '../components/Icon';

export const WEEK_EVENT_COLLISION_MINUTES = 120;

export interface TimedWeekEventLayout {
  event: CalendarEvent;
  laneIndex: number;
  laneCount: number;
}

export function eventColorVariables(color: string): Record<string, string> {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
  const [red = 0, green = 0, blue = 0] = channels;
  const darkForeground = [red, green, blue].map((channel) =>
    Math.round(channel + (255 - channel) * 0.55),
  );
  return {
    '--event-color': color,
    '--event-background': `rgba(${red}, ${green}, ${blue}, 0.36)`,
    '--event-background-dark': `rgba(${red}, ${green}, ${blue}, 0.44)`,
    '--event-border': `rgba(${red}, ${green}, ${blue}, 0.74)`,
    '--event-foreground-dark': `rgb(${darkForeground.join(', ')})`,
  };
}

export function forecastIcon(condition: DailyForecast['condition']): IconName {
  switch (condition) {
    case 'clear':
      return 'sun';
    case 'partly-cloudy':
      return 'cloud-sun';
    case 'cloudy':
      return 'cloud';
    case 'rain':
      return 'cloud-rain';
  }
}

export function eventsForDay(events: CalendarEvent[], localDate: string): CalendarEvent[] {
  return events.filter(
    (event) => event.startLocalDate <= localDate && event.endLocalDate >= localDate,
  );
}

export function layoutTimedWeekEvents(events: readonly CalendarEvent[]): TimedWeekEventLayout[] {
  const ordered = events
    .filter((event) => !event.allDay)
    .map((event) => {
      const start = new Date(event.start).getTime();
      const end = Math.max(
        new Date(event.end).getTime(),
        start + WEEK_EVENT_COLLISION_MINUTES * 60_000,
      );
      return { event, start, end };
    })
    .sort(
      (left, right) =>
        left.start - right.start ||
        left.end - right.end ||
        left.event.id.localeCompare(right.event.id),
    );

  const result: TimedWeekEventLayout[] = [];
  let cluster: Array<Omit<TimedWeekEventLayout, 'laneCount'>> = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;
  let laneEnds: number[] = [];

  const finishCluster = (): void => {
    const laneCount = laneEnds.length;
    result.push(...cluster.map((item) => ({ ...item, laneCount })));
    cluster = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
    laneEnds = [];
  };

  for (const item of ordered) {
    if (cluster.length > 0 && item.start >= clusterEnd) finishCluster();

    let laneIndex = laneEnds.findIndex((laneEnd) => laneEnd <= item.start);
    if (laneIndex === -1) laneIndex = laneEnds.length;
    laneEnds[laneIndex] = item.end;
    clusterEnd = Math.max(clusterEnd, item.end);
    cluster.push({ event: item.event, laneIndex });
  }

  if (cluster.length > 0) finishCluster();
  return result;
}

export function weekTemperatureDomain(days: readonly WeekDay[]): readonly [number, number] | null {
  const forecasts = days.flatMap((day) => (day.forecast === null ? [] : [day.forecast]));
  if (forecasts.length === 0) return null;
  const minimum = Math.min(...forecasts.map((forecast) => forecast.lowTemperatureCelsius));
  const maximum = Math.max(...forecasts.map((forecast) => forecast.highTemperatureCelsius));
  return minimum === maximum ? [minimum - 1, maximum + 1] : [minimum, maximum];
}
