import { useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';

import { addLocalDays } from '@hearth/core';
import type { CalendarEvent, DemoScenario, WeekDay } from '@hearth/shared';

import { Avatar } from '../components/Avatar';
import { CalendarAgenda, WeekForecast } from '../components/CalendarAgenda';
import { CalendarDayDialog } from '../components/CalendarDayDialog';
import { CalendarViewSwitch } from '../components/CalendarViewSwitch';
import { EventDetailsDialog } from '../components/EventDetailsDialog';
import { Icon, type IconName } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { FailureState, LoadingState, StatusBanner } from '../components/Status';
import { useWeekQuery } from '../hooks/useCalendarQueries';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { COMPANION_QUERY } from '../layout/viewportQueries';
import { useHearthRuntime } from '../runtime/context';
import { eventColorVariables, forecastIcon } from '../utils/calendar';
import { formatEventDayTime } from '../utils/date';
import {
  layoutWeekDay,
  timelineHourLabel,
  weekTimeline,
  type WeekDayLayout,
  type WeekTimeline,
  type TimedWeekEventLayout,
} from '../utils/weekLayout';

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
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const companion = useSyncExternalStore(subscribeCompanion, companionSnapshot);
  const presentation = useMemo(() => {
    if (query.data === undefined) return null;
    const timeline = weekTimeline(
      query.data.events,
      query.data.days.map((day) => day.localDate),
      runtime.timezone,
    );
    const layouts = query.data.days.map((day) =>
      layoutWeekDay(query.data.events, day.localDate, runtime.timezone, timeline),
    );
    return { timeline, layouts };
  }, [query.data, runtime.timezone]);
  if (preparing || query.isPending) return <LoadingState />;
  if (query.data === undefined || presentation === null)
    return <FailureState onRetry={() => void query.refetch()} />;
  const week = query.data;
  const currentForecast = week.days.find((day) => day.isToday)?.forecast ?? null;
  const { timeline, layouts } = presentation;
  const focusColumns = layouts.map((layout, index) =>
    columnFocusIds(layout, week.days[index]!.localDate),
  );
  const primaryFocusId = focusColumns.flat()[0];
  const lastFocusId = focusColumns.flat().at(-1);
  const openDayIndex = week.days.findIndex((day) => day.localDate === selectedDay);
  const allDayRowCount = Math.max(0, ...layouts.map((layout) => layout.allDay.length));
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
      {!companion ? (
        <div
          className={`week-grid${allDayRowCount > 0 ? ' week-grid--with-all-day' : ''}`}
          aria-label={`${week.displayRange} schedule`}
          style={
            {
              '--week-all-day-height': `${allDayRowCount * 68}px`,
              '--timeline-steps': (timeline.end - timeline.start) / 120,
            } as CSSProperties
          }
        >
          <div className="week-time-axis" aria-hidden="true">
            <div className="week-time-axis__labels">
              {Array.from(
                { length: (timeline.end - timeline.start) / 120 + 1 },
                (_, index) => timeline.start + index * 120,
              ).map((minutes) => (
                <span
                  key={minutes}
                  style={{
                    top: `${((minutes - timeline.start) / (timeline.end - timeline.start)) * 100}%`,
                  }}
                >
                  {timelineHourLabel(minutes)}
                </span>
              ))}
            </div>
          </div>
          {week.days.map((day, dayIndex) => (
            <WeekColumn
              day={day}
              dayIndex={dayIndex}
              layout={layouts[dayIndex]!}
              timeline={timeline}
              focusColumns={focusColumns}
              key={day.localDate}
              onSelect={setSelectedEvent}
              primaryFocusId={primaryFocusId}
              onOpenDay={() => setSelectedDay(day.localDate)}
              timezone={runtime.timezone}
            />
          ))}
        </div>
      ) : null}
      <div className="week-footer-controls">
        <button
          aria-label="Earlier week"
          className="focusable"
          data-focus-id="week-earlier"
          data-focus-entry={week.events.length === 0 ? 'true' : undefined}
          data-focus-left="nav-calendar"
          data-focus-right="week-today"
          data-focus-up={companion ? undefined : lastFocusId}
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
          data-focus-up={companion ? undefined : lastFocusId}
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
          data-focus-up={companion ? undefined : lastFocusId}
          onClick={() => changeWeek(7)}
          type="button"
        >
          <span>Later week</span>
          <Icon name="chevron-right" />
        </button>
      </div>
      {companion ? (
        <CalendarAgenda
          className="week-agenda"
          days={week.days}
          events={week.events}
          onSelect={setSelectedEvent}
          timezone={runtime.timezone}
        />
      ) : null}
      {openDayIndex < 0 ? null : (
        <CalendarDayDialog
          day={week.days[openDayIndex]!}
          events={layouts[openDayIndex]!.events}
          timezone={runtime.timezone}
          onClose={() => setSelectedDay(null)}
        />
      )}
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
  layout,
  timeline,
  dayIndex,
  primaryFocusId,
  focusColumns,
  timezone,
  onSelect,
  onOpenDay,
}: {
  day: WeekDay;
  layout: WeekDayLayout;
  timeline: WeekTimeline;
  dayIndex: number;
  primaryFocusId: string | undefined;
  focusColumns: string[][];
  timezone: string;
  onSelect: (event: CalendarEvent) => void;
  onOpenDay: () => void;
}) {
  const focusIds = focusColumns[dayIndex]!;
  const focusProps = (id: string) => {
    const index = focusIds.indexOf(id);
    const leftColumn = focusColumns
      .slice(0, dayIndex)
      .reverse()
      .find((column) => column.length > 0);
    const rightColumn = focusColumns.slice(dayIndex + 1).find((column) => column.length > 0);
    return {
      'data-focus-id': id,
      'data-focus-entry': id === primaryFocusId ? 'true' : undefined,
      'data-focus-up': focusIds[index - 1] ?? 'calendar-view-week',
      'data-focus-down': focusIds[index + 1] ?? 'week-earlier',
      'data-focus-left': leftColumn?.[Math.min(index, leftColumn.length - 1)] ?? 'nav-calendar',
      'data-focus-right': rightColumn?.[Math.min(index, rightColumn.length - 1)] ?? 'week-later',
    };
  };

  return (
    <section className={`week-column${day.isToday ? ' week-column--today' : ''}`}>
      <header>
        <span className="week-day-heading">
          <span>{day.dayLabel}</span>
          <strong className="week-day-date">{day.dateLabel.split(' ')[0]}</strong>
        </span>
        <WeekForecast forecast={day.forecast} />
      </header>
      <div className="week-column__all-day-events">
        {layout.allDay.map((event, index) => (
          <WeekEventCard
            allDayPosition={index}
            localDate={day.localDate}
            event={event}
            key={event.id}
            focusProps={focusProps(`week-event-${day.localDate}-${event.id}`)}
            onSelect={onSelect}
            timeline={timeline}
            timezone={timezone}
          />
        ))}
      </div>
      <div className="week-column__events">
        {layout.timed.map((item) => (
          <WeekEventCard
            localDate={day.localDate}
            event={item.event}
            key={item.event.id}
            layout={item}
            focusProps={focusProps(`week-event-${day.localDate}-${item.event.id}`)}
            onSelect={onSelect}
            timeline={timeline}
            timezone={timezone}
          />
        ))}
      </div>
      {layout.hiddenCount > 0 ? (
        <button
          className="week-more focusable"
          type="button"
          aria-label={`${layout.hiddenCount} more events, ${day.dayLabel} ${day.dateLabel}. View full day`}
          {...focusProps(`week-more-${day.localDate}`)}
          onClick={onOpenDay}
        >
          +{layout.hiddenCount} more
        </button>
      ) : null}
    </section>
  );
}

function WeekEventCard({
  event,
  localDate,
  timezone,
  focusProps,
  timeline,
  layout,
  allDayPosition = 0,
  onSelect,
}: {
  event: CalendarEvent;
  localDate: string;
  timezone: string;
  focusProps: Record<string, string | undefined>;
  timeline: WeekTimeline;
  layout?: TimedWeekEventLayout;
  allDayPosition?: number;
  onSelect: (event: CalendarEvent) => void;
}) {
  const timeLabel = formatEventDayTime(event, localDate, timezone);
  const overlaps = (layout?.laneCount ?? 1) > 1;
  return (
    <button
      aria-label={`${timeLabel}, ${event.title}, ${event.sourceLabel}${overlaps ? ', overlaps another event' : ''}`}
      className={`week-event focusable${event.allDay ? ' week-event--all-day' : ''}${overlaps ? ' week-event--overlapping' : ''}`}
      {...focusProps}
      onClick={() => onSelect(event)}
      style={timelineStyle(event, timeline, allDayPosition, layout)}
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
  timeline: WeekTimeline,
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
  const span = timeline.end - timeline.start;
  return {
    ...eventColorVariables(event.color),
    '--event-top': `${(((layout?.start ?? timeline.start) - timeline.start) / span) * 100}%`,
    '--event-height': `calc(${(((layout?.displayEnd ?? timeline.end) - (layout?.start ?? timeline.start)) / span) * 100}% - 4px)`,
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

function columnFocusIds(layout: WeekDayLayout, date: string): string[] {
  return [
    ...[...layout.allDay, ...layout.timed.map((item) => item.event)].map(
      (event) => `week-event-${date}-${event.id}`,
    ),
    ...(layout.hiddenCount > 0 ? [`week-more-${date}`] : []),
  ];
}

function companionSnapshot(): boolean {
  return window.matchMedia(COMPANION_QUERY).matches;
}

function subscribeCompanion(onChange: () => void): () => void {
  const media = window.matchMedia(COMPANION_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}
