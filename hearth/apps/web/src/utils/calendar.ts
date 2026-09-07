import { localDateInTimezone } from '@hearth/core';
import type { CalendarEvent, DailyForecast, WeekDay } from '@hearth/shared';

import type { IconName } from '../components/Icon';

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

export function eventsForDay(
  events: CalendarEvent[],
  localDate: string,
  timezone?: string,
): CalendarEvent[] {
  return events.filter((event) => {
    if (event.allDay || timezone === undefined) {
      return event.startLocalDate <= localDate && event.endLocalDate >= localDate;
    }
    // Timed ends are exclusive, including an event finishing exactly at midnight.
    const lastInstant = new Date(
      Math.max(Date.parse(event.start), Date.parse(event.end) - 1),
    ).toISOString();
    return (
      localDateInTimezone(event.start, timezone) <= localDate &&
      localDateInTimezone(lastInstant, timezone) >= localDate
    );
  });
}

export function weekTemperatureDomain(days: readonly WeekDay[]): readonly [number, number] | null {
  const forecasts = days.flatMap((day) => (day.forecast === null ? [] : [day.forecast]));
  if (forecasts.length === 0) return null;
  const minimum = Math.min(...forecasts.map((forecast) => forecast.lowTemperatureCelsius));
  const maximum = Math.max(...forecasts.map((forecast) => forecast.highTemperatureCelsius));
  return minimum === maximum ? [minimum - 1, maximum + 1] : [minimum, maximum];
}
