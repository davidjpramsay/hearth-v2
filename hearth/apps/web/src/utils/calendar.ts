import { localDateInTimezone } from '@hearth/core';
import type { CalendarEvent, DailyForecast } from '@hearth/shared';

import type { IconName } from '../components/Icon';

export function eventColorVariables(color: string): Record<string, string> {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
  const [red = 0, green = 0, blue = 0] = channels;
  const darkForeground = [red, green, blue].map((channel) =>
    Math.round(channel + (255 - channel) * 0.55),
  );
  // Pre-composite the source tint onto each canvas so grid lines and neighbouring
  // cards cannot show through. Keep the existing restrained light/dark palette.
  const solidTint = (base: number[], amount: number) =>
    `rgb(${channels.map((channel, index) => Math.round(channel * amount + base[index]! * (1 - amount))).join(', ')})`;
  return {
    '--event-color': color,
    '--event-background': solidTint([248, 246, 240], 0.36),
    '--event-background-dark': solidTint([21, 26, 24], 0.44),
    '--event-border': color,
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
