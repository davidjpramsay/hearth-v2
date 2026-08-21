import type { CalendarEvent, DailyForecast } from '@hearth/shared';

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

export function eventsForDay(events: CalendarEvent[], localDate: string): CalendarEvent[] {
  return events.filter(
    (event) => event.startLocalDate <= localDate && event.endLocalDate >= localDate,
  );
}
