import type { CalendarEvent, DailyForecast } from '@hearth/shared';

import type { IconName } from '../components/Icon';

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
