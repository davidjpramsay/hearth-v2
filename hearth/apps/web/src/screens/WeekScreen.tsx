import { useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';

import { addLocalDays } from '@hearth/core';
import type { CalendarEvent, DemoScenario, WeekDay } from '@hearth/shared';

import { Avatar } from '../components/Avatar';
import { CalendarAgenda, WeekForecast } from '../components/CalendarAgenda';
import { CalendarViewSwitch } from '../components/CalendarViewSwitch';
import { EventDetailsDialog } from '../components/EventDetailsDialog';
import { Icon, type IconName } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { FailureState, LoadingState, StatusBanner } from '../components/Status';
import { useWeekQuery } from '../hooks/useCalendarQueries';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useHearthRuntime } from '../runtime/context';
import {
  eventColorVariables,
  eventsForDay,
  forecastIcon,
  layoutTimedWeekEvents,
  type TimedWeekEventLayout,
  weekTemperatureDomain,
} from '../utils/calendar';
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
  const primaryEventId = week.events[0]?.id;
  const currentForecast = week.days.find((day) => day.isToday)?.forecast ?? null;
  const forecastDomain = weekTemperatureDomain(week.days);
  const eventsByDay = new Map(
    week.days.map((day) => [day.localDate, eventsForDay(week.events, day.localDate)]),
  );
  const allDayRowCount = Math.max(
    0,
    ...Array.from(eventsByDay.values(), (events) =>
      events.reduce((count, event) => count + Number(event.allDay), 0),
    ),
  );
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
      {week.events.length === 0 ? (
        <p className="week-empty-message" role="status">
          Nothing planned this week.
        </p>
      ) : null}
      {!online ? <StatusBanner kind="offline">Offline · Showing saved plans.</StatusBanner> : null}
      {week.freshness === 'stale' && online ? (
        <StatusBanner kind={scenario === 'unavailable' ? 'unavailable' : 'stale'}>
          {week.statusMessage}
        </StatusBanner>
      ) : null}
      <div
        className={`week-grid${allDayRowCount > 0 ? ' week-grid--with-all-day' : ''}`}
        aria-label={`${week.displayRange} schedule`}
        style={{ '--week-all-day-height': `${allDayRowCount * 68}px` } as CSSProperties}
      >
        <div className="week-time-axis" aria-hidden="true">
          {['8 am', '10 am', '12 pm', '2 pm', '4 pm', '6 pm', '8 pm'].map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        {week.days.map((day, dayIndex) => (
          <WeekColumn
            day={day}
            dayIndex={dayIndex}
            events={eventsByDay.get(day.localDate) ?? []}
            key={day.localDate}
            onSelect={setSelectedEvent}
            primaryEventId={primaryEventId}
            forecastDomain={forecastDomain}
            timezone={runtime.timezone}
          />
        ))}
      </div>
      <div className="week-footer-controls">
        <button
          aria-label="Earlier week"
          className="focusable"
          data-focus-id="week-earlier"
          data-focus-entry={week.events.length === 0 ? 'true' : undefined}
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
  forecastDomain,
  timezone,
  onSelect,
}: {
  day: WeekDay;
  events: CalendarEvent[];
  dayIndex: number;
  primaryEventId: string | undefined;
  forecastDomain: readonly [number, number] | null;
  timezone: string;
  onSelect: (event: CalendarEvent) => void;
}) {
  const allDayEvents = events.filter((event) => event.allDay);
  const timedLayouts = layoutTimedWeekEvents(events);
  const orderedEvents = [...allDayEvents, ...timedLayouts.map((layout) => layout.event)];
  const neighbours = new Map(
    orderedEvents.map((event, index) => [
      event.id,
      {
        previous: orderedEvents[index - 1],
        next: orderedEvents[index + 1],
      },
    ]),
  );

  return (
    <section className={`week-column${day.isToday ? ' week-column--today' : ''}`}>
      <header>
        <span className="week-day-heading">
          <span>{day.dayLabel}</span>
          <strong className="week-day-date">{day.dateLabel.split(' ')[0]}</strong>
        </span>
        <WeekForecast domain={forecastDomain} forecast={day.forecast} />
      </header>
      <div className="week-column__all-day-events">
        {allDayEvents.map((event, index) => (
          <WeekEventCard
            allDayPosition={index}
            dayIndex={dayIndex}
            localDate={day.localDate}
            event={event}
            key={event.id}
            neighbours={neighbours.get(event.id)}
            onSelect={onSelect}
            primaryEventId={primaryEventId}
            timezone={timezone}
          />
        ))}
      </div>
      <div className="week-column__events">
        {events.length === 0 ? <span className="week-column__empty">—</span> : null}
        {timedLayouts.map((layout) => (
          <WeekEventCard
            dayIndex={dayIndex}
            localDate={day.localDate}
            event={layout.event}
            key={layout.event.id}
            layout={layout}
            neighbours={neighbours.get(layout.event.id)}
            onSelect={onSelect}
            primaryEventId={primaryEventId}
            timezone={timezone}
          />
        ))}
      </div>
    </section>
  );
}

function WeekEventCard({
  event,
  dayIndex,
  localDate,
  primaryEventId,
  timezone,
  neighbours,
  layout,
  allDayPosition = 0,
  onSelect,
}: {
  event: CalendarEvent;
  dayIndex: number;
  localDate: string;
  primaryEventId: string | undefined;
  timezone: string;
  neighbours: { previous: CalendarEvent | undefined; next: CalendarEvent | undefined } | undefined;
  layout?: TimedWeekEventLayout;
  allDayPosition?: number;
  onSelect: (event: CalendarEvent) => void;
}) {
  const timeLabel = formatEventTime(event, timezone);
  const overlaps = (layout?.laneCount ?? 1) > 1;
  const previous = neighbours?.previous;
  const next = neighbours?.next;
  return (
    <button
      aria-label={`${timeLabel}, ${event.title}, ${event.sourceLabel}${overlaps ? ', overlaps another event' : ''}`}
      className={`week-event focusable${event.allDay ? ' week-event--all-day' : ''}${overlaps ? ' week-event--overlapping' : ''}`}
      data-focus-entry={
        event.id === primaryEventId && (dayIndex === 0 || localDate === event.startLocalDate)
          ? 'true'
          : undefined
      }
      data-focus-id={`week-event-${localDate}-${event.id}`}
      data-focus-left={dayIndex === 0 ? 'nav-calendar' : undefined}
      data-focus-up={
        previous === undefined ? 'calendar-view-week' : `week-event-${localDate}-${previous.id}`
      }
      data-focus-down={next === undefined ? 'week-earlier' : `week-event-${localDate}-${next.id}`}
      onClick={() => onSelect(event)}
      style={timelineStyle(event, timezone, allDayPosition, layout)}
      type="button"
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
}

function timelineStyle(
  event: CalendarEvent,
  timezone: string,
  allDayPosition: number,
  layout?: TimedWeekEventLayout,
): CSSProperties {
  if (event.allDay) {
    return {
      ...eventColorVariables(event.color),
      '--event-top': `${allDayPosition * 68}px`,
      '--event-height': '60px',
    } as CSSProperties;
  }
  const start = clockMinutes(event.start, timezone);
  const duration = Math.max(
    45,
    Math.round((new Date(event.end).getTime() - new Date(event.start).getTime()) / 60_000),
  );
  return {
    ...eventColorVariables(event.color),
    '--event-top': `${(Math.max(0, start - 8 * 60) / (12 * 60)) * 100}%`,
    '--event-height': `${(duration / (12 * 60)) * 100}%`,
    '--event-left': eventLaneLeft(layout),
    '--event-width': eventLaneWidth(layout),
  } as CSSProperties;
}

function eventLaneLeft(layout: TimedWeekEventLayout | undefined): string {
  if (layout === undefined || layout.laneCount === 1) return '6px';
  return `calc(${(layout.laneIndex / layout.laneCount) * 100}% + 3px)`;
}

function eventLaneWidth(layout: TimedWeekEventLayout | undefined): string {
  if (layout === undefined || layout.laneCount === 1) return 'calc(100% - 12px)';
  return `calc(${100 / layout.laneCount}% - 6px)`;
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
