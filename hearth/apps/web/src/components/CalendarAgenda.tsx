import type { CSSProperties } from 'react';

import type { CalendarEvent, DailyForecast, WeekDay } from '@hearth/shared';

import { Icon } from './Icon';
import { eventsForDay, forecastIcon } from '../utils/calendar';
import { formatEventTime } from '../utils/date';

export function CalendarAgenda({
  days,
  events,
  timezone,
  onSelect,
  className = '',
}: {
  days: WeekDay[];
  events: CalendarEvent[];
  timezone: string;
  onSelect: (event: CalendarEvent) => void;
  className?: string;
}) {
  const focusableEvents = days.flatMap((day) =>
    eventsForDay(events, day.localDate).map((event) => ({ day: day.localDate, event })),
  );
  return (
    <div className={`calendar-agenda ${className}`.trim()}>
      {days.map((day) => {
        const dayEvents = eventsForDay(events, day.localDate);
        return (
          <section className="agenda-day" key={day.localDate}>
            <header>
              <strong>{day.dayLabel}</strong>
              <span className="agenda-day__date">{day.dateLabel}</span>
              {day.isToday ? <span className="agenda-day__today">Today</span> : null}
              <DayForecast forecast={day.forecast} />
            </header>
            {dayEvents.length === 0 ? (
              <p>Nothing planned</p>
            ) : (
              dayEvents.map((event) => {
                const eventIndex = focusableEvents.findIndex(
                  (candidate) => candidate.day === day.localDate && candidate.event.id === event.id,
                );
                const prior = focusableEvents[eventIndex - 1];
                const next = focusableEvents[eventIndex + 1];
                const timeLabel = formatEventTime(event, timezone);
                const focusId = agendaFocusId(day.localDate, event.id);
                return (
                  <button
                    aria-label={`${timeLabel}, ${event.title}, ${event.sourceLabel}`}
                    className="agenda-event focusable"
                    data-focus-entry={eventIndex === 0 ? 'true' : undefined}
                    data-focus-id={focusId}
                    data-focus-left="nav-calendar"
                    data-focus-up={
                      prior === undefined
                        ? 'calendar-view-agenda'
                        : agendaFocusId(prior.day, prior.event.id)
                    }
                    data-focus-down={
                      next === undefined ? focusId : agendaFocusId(next.day, next.event.id)
                    }
                    onClick={() => onSelect(event)}
                    style={{ '--event-color': event.color } as CSSProperties}
                    type="button"
                    key={event.id}
                  >
                    <time>{timeLabel}</time>
                    <span />
                    <div>
                      <strong>{event.title}</strong>
                      <p>{event.owner?.displayName ?? event.sourceLabel}</p>
                    </div>
                  </button>
                );
              })
            )}
          </section>
        );
      })}
    </div>
  );
}

export function DayForecast({ forecast }: { forecast: DailyForecast | null }) {
  if (forecast === null) return null;
  const accessibleLabel = `${forecast.label}, ${forecast.temperatureCelsius} degrees Celsius`;
  return (
    <span
      aria-label={accessibleLabel}
      className={`week-day-forecast week-day-forecast--${forecast.condition}`}
      title={accessibleLabel}
    >
      <Icon name={forecastIcon(forecast.condition)} />
      <strong>{forecast.temperatureCelsius}°</strong>
    </span>
  );
}

function agendaFocusId(localDate: string, eventId: string): string {
  return `agenda-${localDate}-${eventId}`;
}
