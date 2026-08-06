import type { CalendarEvent, DailyForecast, DemoScenario, WeekDay } from '@hearth/shared';

import { Avatar } from '../components/Avatar';
import { CalendarViewSwitch } from '../components/CalendarViewSwitch';
import { Icon, type IconName } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState, FailureState, LoadingState, StatusBanner } from '../components/Status';
import { useWeekQuery } from '../hooks/useHearthQueries';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { formatEventTime } from '../utils/date';

export function WeekScreen({
  scenario,
  preparing,
}: {
  scenario: DemoScenario | 'offline';
  preparing: boolean;
}) {
  const query = useWeekQuery(!preparing);
  const online = useOnlineStatus(scenario === 'offline');
  if (preparing || query.isPending) return <LoadingState />;
  if (query.data === undefined) return <FailureState onRetry={() => void query.refetch()} />;
  const week = query.data;
  if (week.events.length === 0) return <EmptyState onBootstrap={() => void query.refetch()} />;
  return (
    <div className="screen week-screen">
      <ScreenHeader
        title="This week"
        meta={week.displayRange}
        actions={
          <div className="week-glance">
            <div>
              <Icon name="sun" />
              <strong>16°</strong>
              <span>Clear</span>
            </div>
            <div>
              <Icon name="sunrise" />
              <strong>Morning</strong>
            </div>
          </div>
        }
      />
      <CalendarViewSwitch />
      {!online ? (
        <StatusBanner kind="offline">You’re offline · Showing saved plans.</StatusBanner>
      ) : null}
      {week.freshness === 'stale' && online ? (
        <StatusBanner kind={scenario === 'unavailable' ? 'unavailable' : 'stale'}>
          {week.statusMessage}
        </StatusBanner>
      ) : null}
      <div className="week-grid" aria-label={`${week.displayRange} schedule`}>
        <div className="week-time-axis" aria-hidden="true">
          {['8 am', '10 am', '12 pm', '2 pm', '4 pm', '6 pm', '8 pm'].map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        {week.days.map((day, dayIndex) => (
          <WeekColumn
            day={day}
            dayIndex={dayIndex}
            events={eventsForDay(week.events, day.localDate)}
            key={day.localDate}
          />
        ))}
      </div>
      <div className="week-footer-controls">
        <button aria-label="Earlier week" type="button">
          <Icon name="chevron-left" />
          <span>Earlier week</span>
        </button>
        <button aria-label="Later week" type="button">
          <span>Later week</span>
          <Icon name="chevron-right" />
        </button>
      </div>
      <div className="week-agenda">
        {week.days.map((day, dayIndex) => {
          const events = eventsForDay(week.events, day.localDate);
          return (
            <section className="agenda-day" key={day.localDate}>
              <header>
                <strong>{day.dayLabel}</strong>
                <span className="agenda-day__date">{day.dateLabel}</span>
                <DayForecast forecast={day.forecast} />
              </header>
              {events.length === 0 ? (
                <p>Nothing planned</p>
              ) : (
                events.map((event, index) => (
                  <WeekAgendaEvent dayIndex={dayIndex} event={event} index={index} key={event.id} />
                ))
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function WeekColumn({
  day,
  events,
  dayIndex,
}: {
  day: WeekDay;
  events: CalendarEvent[];
  dayIndex: number;
}) {
  return (
    <section className={`week-column${day.isToday ? ' week-column--today' : ''}`}>
      <header>
        <span>{day.dayLabel}</span>
        <strong className="week-day-date">{day.dateLabel.split(' ')[0]}</strong>
        <DayForecast forecast={day.forecast} />
      </header>
      <div className="week-column__events">
        {events.length === 0 ? (
          <span className="week-column__empty">—</span>
        ) : (
          events.map((event, index) => {
            const prior = events[index - 1];
            const next = events[index + 1];
            return (
              <button
                aria-label={`${formatEventTime(event)}, ${event.title}, ${event.sourceLabel}`}
                className="week-event focusable"
                data-focus-id={`week-event-${event.id}`}
                data-focus-left={dayIndex === 0 ? 'nav-week' : undefined}
                data-focus-up={
                  prior === undefined ? `week-event-${event.id}` : `week-event-${prior.id}`
                }
                data-focus-down={
                  next === undefined ? `week-event-${event.id}` : `week-event-${next.id}`
                }
                style={timelineStyle(event)}
                type="button"
                key={event.id}
              >
                <span className="week-event__meta">
                  {event.owner === null ? (
                    <span aria-hidden="true" className="week-event__family">
                      H
                    </span>
                  ) : (
                    <Avatar member={event.owner} size="small" />
                  )}
                  <time>{formatEventTime(event)}</time>
                </span>
                <strong>{event.title}</strong>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

function DayForecast({ forecast }: { forecast: DailyForecast | null }) {
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

function forecastIcon(condition: DailyForecast['condition']): IconName {
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

function WeekAgendaEvent({
  event,
  dayIndex,
  index,
}: {
  event: CalendarEvent;
  dayIndex: number;
  index: number;
}) {
  return (
    <button
      aria-label={`${formatEventTime(event)}, ${event.title}, ${event.sourceLabel}`}
      className="agenda-event focusable"
      data-focus-id={`agenda-${event.id}`}
      data-focus-left={dayIndex === 0 ? 'phone-tab-week' : undefined}
      data-focus-up={index === 0 ? 'phone-tab-week' : undefined}
      style={{ '--event-color': event.color } as React.CSSProperties}
      type="button"
    >
      <time>{formatEventTime(event)}</time>
      <span />
      <div>
        <strong>{event.title}</strong>
        <p>{event.sourceLabel}</p>
      </div>
    </button>
  );
}

function eventsForDay(events: CalendarEvent[], localDate: string): CalendarEvent[] {
  return events.filter(
    (event) => event.startLocalDate <= localDate && event.endLocalDate >= localDate,
  );
}

function timelineStyle(event: CalendarEvent): React.CSSProperties {
  if (event.allDay) {
    return {
      '--event-color': event.color,
      '--event-top': '0%',
      '--event-height': '11.25%',
    } as React.CSSProperties;
  }
  const start = perthClockMinutes(event.start);
  const duration = Math.max(
    45,
    Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000),
  );
  return {
    '--event-color': event.color,
    '--event-top': `${(Math.max(0, start - 8 * 60) / (12 * 60)) * 100}%`,
    '--event-height': `${(duration / (12 * 60)) * 100}%`,
  } as React.CSSProperties;
}

function perthClockMinutes(timestamp: string): number {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Perth',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return Number(values.get('hour') ?? 0) * 60 + Number(values.get('minute') ?? 0);
}
