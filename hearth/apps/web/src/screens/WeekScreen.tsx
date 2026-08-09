import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { addLocalDays } from '@hearth/core';
import type { CalendarEvent, DemoScenario, WeekDay } from '@hearth/shared';

import { Avatar } from '../components/Avatar';
import { CalendarAgenda, DayForecast } from '../components/CalendarAgenda';
import { CalendarViewSwitch } from '../components/CalendarViewSwitch';
import { EventDetailsDialog } from '../components/EventDetailsDialog';
import { Icon, type IconName } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState, FailureState, LoadingState, StatusBanner } from '../components/Status';
import { useWeekQuery } from '../hooks/useHearthQueries';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useHearthRuntime } from '../runtime/context';
import { eventsForDay, forecastIcon } from '../utils/calendar';
import { formatEventTime } from '../utils/date';

export function WeekScreen({
  scenario,
  preparing,
}: {
  scenario: DemoScenario | 'offline';
  preparing: boolean;
}) {
  const runtime = useHearthRuntime();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedStart = searchParams.get('start');
  const weekStart =
    requestedStart !== null && /^\d{4}-\d{2}-\d{2}$/.test(requestedStart)
      ? requestedStart
      : runtime.weekStart;
  const query = useWeekQuery(weekStart, !preparing);
  const online = useOnlineStatus(scenario === 'offline');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  if (preparing || query.isPending) return <LoadingState />;
  if (query.data === undefined) return <FailureState onRetry={() => void query.refetch()} />;
  const week = query.data;
  if (week.events.length === 0)
    return (
      <EmptyState
        onBootstrap={runtime.mode === 'private' ? undefined : () => void query.refetch()}
      />
    );
  const primaryEventId = week.events[0]?.id;
  const currentForecast = week.days.find((day) => day.isToday)?.forecast ?? null;
  return (
    <div className="screen week-screen">
      <ScreenHeader
        title={weekStart === runtime.weekStart ? 'This week' : 'Week'}
        meta={week.displayRange}
        actions={
          <div className="week-glance">
            {currentForecast === null ? null : (
              <div>
                <Icon name={forecastIcon(currentForecast.condition)} />
                <strong>{currentForecast.temperatureCelsius}°</strong>
                <span>{currentForecast.label}</span>
              </div>
            )}
            <div>
              <Icon name={dayPeriodIcon(runtime.generatedAt, runtime.timezone)} />
              <strong>{dayPeriod(runtime.generatedAt, runtime.timezone)}</strong>
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
            onSelect={setSelectedEvent}
            primaryEventId={primaryEventId}
            timezone={runtime.timezone}
          />
        ))}
      </div>
      <div className="week-footer-controls">
        <button
          aria-label="Earlier week"
          className="focusable"
          data-focus-id="week-earlier"
          data-focus-left="nav-calendar"
          data-focus-right="week-today"
          onClick={() => changeWeek(-7)}
          type="button"
        >
          <Icon name="chevron-left" />
          <span>Earlier week</span>
        </button>
        <button
          aria-label="Go to this week"
          className="focusable"
          data-focus-id="week-today"
          data-focus-left="week-earlier"
          data-focus-right="week-later"
          onClick={goToCurrentWeek}
          type="button"
        >
          This week
        </button>
        <button
          aria-label="Later week"
          className="focusable"
          data-focus-id="week-later"
          data-focus-left="week-today"
          data-focus-right="week-later"
          onClick={() => changeWeek(7)}
          type="button"
        >
          <span>Later week</span>
          <Icon name="chevron-right" />
        </button>
      </div>
      <CalendarAgenda
        className="week-agenda"
        days={week.days}
        events={week.events}
        onSelect={setSelectedEvent}
        timezone={runtime.timezone}
      />
      <EventDetailsDialog
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        timezone={runtime.timezone}
      />
    </div>
  );

  function changeWeek(dayCount: number): void {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('start', addLocalDays(weekStart, dayCount));
    setSearchParams(nextParams, { replace: true });
  }

  function goToCurrentWeek(): void {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('start');
    setSearchParams(nextParams, { replace: true });
  }
}

function dayPeriod(timestamp: string, timezone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: timezone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(timestamp)),
  );
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

function dayPeriodIcon(timestamp: string, timezone: string): IconName {
  return dayPeriod(timestamp, timezone) === 'Morning' ? 'sunrise' : 'sun';
}

function WeekColumn({
  day,
  events,
  dayIndex,
  primaryEventId,
  timezone,
  onSelect,
}: {
  day: WeekDay;
  events: CalendarEvent[];
  dayIndex: number;
  primaryEventId: string | undefined;
  timezone: string;
  onSelect: (event: CalendarEvent) => void;
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
            const timeLabel = formatEventTime(event, timezone);
            return (
              <button
                aria-label={`${timeLabel}, ${event.title}, ${event.sourceLabel}`}
                className="week-event focusable"
                data-focus-entry={event.id === primaryEventId ? 'true' : undefined}
                data-focus-id={`week-event-${event.id}`}
                data-focus-left={dayIndex === 0 ? 'nav-calendar' : undefined}
                data-focus-up={
                  prior === undefined ? 'calendar-view-week' : `week-event-${prior.id}`
                }
                data-focus-down={
                  next === undefined ? `week-event-${event.id}` : `week-event-${next.id}`
                }
                onClick={() => onSelect(event)}
                style={timelineStyle(event, timezone)}
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
                  <time>{timeLabel}</time>
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

function timelineStyle(event: CalendarEvent, timezone: string): React.CSSProperties {
  if (event.allDay) {
    return {
      '--event-color': event.color,
      '--event-top': '0%',
      '--event-height': '11.25%',
    } as React.CSSProperties;
  }
  const start = clockMinutes(event.start, timezone);
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

function clockMinutes(timestamp: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return Number(values.get('hour') ?? 0) * 60 + Number(values.get('minute') ?? 0);
}
