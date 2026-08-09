import { useMemo, useState, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CalendarEvent, CalendarSource, DemoScenario, MonthDay } from '@hearth/shared';

import { Avatar } from '../components/Avatar';
import { CalendarViewSwitch } from '../components/CalendarViewSwitch';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { FailureState, LoadingState, StatusBanner } from '../components/Status';
import { useMonthQuery } from '../hooks/useHearthQueries';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useHearthRuntime } from '../runtime/context';

const WEEKDAYS = [
  ['Monday', 'Mon'],
  ['Tuesday', 'Tue'],
  ['Wednesday', 'Wed'],
  ['Thursday', 'Thu'],
  ['Friday', 'Fri'],
  ['Saturday', 'Sat'],
  ['Sunday', 'Sun'],
] as const;
const MAX_VISIBLE_EVENTS = 2;
const MAX_COMPACT_MARKS = 6;

export function MonthScreen({
  scenario,
  preparing,
}: {
  scenario: DemoScenario | 'offline';
  preparing: boolean;
}) {
  const runtime = useHearthRuntime();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMonth = searchParams.get('month');
  const monthKey =
    requestedMonth !== null && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)
      ? requestedMonth
      : runtime.currentMonth;
  const query = useMonthQuery(monthKey, !preparing);
  const online = useOnlineStatus(scenario === 'offline');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const eventsByDate = useMemo(
    () => indexEventsByDate(query.data?.events ?? []),
    [query.data?.events],
  );

  if (preparing || query.isPending) return <LoadingState />;
  if (query.data === undefined) return <FailureState onRetry={() => void query.refetch()} />;
  const month = query.data;
  const defaultDay =
    month.days.find((day) => day.isToday) ?? month.days.find((day) => day.inMonth) ?? month.days[0];
  const selectedDay = month.days.find((day) => day.localDate === selectedDate) ?? defaultDay;
  const selectedEvents =
    selectedDay === undefined ? [] : (eventsByDate.get(selectedDay.localDate) ?? []);

  return (
    <div className="screen month-screen">
      <ScreenHeader
        title={month.displayMonth}
        meta={month.displayYear}
        actions={
          runtime.mode === 'private' ? null : (
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
          )
        }
      />
      <CalendarViewSwitch />
      {!online ? (
        <StatusBanner kind="offline">You’re offline · Showing saved plans.</StatusBanner>
      ) : null}
      {month.freshness === 'stale' && online ? (
        <StatusBanner kind={scenario === 'unavailable' ? 'unavailable' : 'stale'}>
          {month.statusMessage}
        </StatusBanner>
      ) : null}
      {month.events.length === 0 ? (
        <div className="month-empty-note" role="status">
          Nothing planned this month yet.
        </div>
      ) : null}
      <div className="month-weekdays" aria-hidden="true">
        {WEEKDAYS.map(([full, short]) => (
          <span key={full}>
            <span className="month-weekday-full">{full}</span>
            <span className="month-weekday-short">{short}</span>
          </span>
        ))}
      </div>
      <div
        aria-label={`${month.displayMonth} ${month.displayYear} calendar`}
        className="month-grid"
      >
        {month.days.map((day, index) => (
          <MonthCell
            day={day}
            days={month.days}
            events={eventsByDate.get(day.localDate) ?? []}
            index={index}
            key={day.localDate}
            onSelect={setSelectedDate}
            selected={selectedDay?.localDate === day.localDate}
          />
        ))}
      </div>
      {selectedDay === undefined ? null : (
        <MonthDayDetails day={selectedDay} events={selectedEvents} />
      )}
      <MonthLegend calendars={month.calendars} />
      <div className="month-footer-controls">
        <button
          aria-label="Earlier month"
          className="focusable"
          data-focus-id="month-earlier"
          data-focus-left="nav-month"
          data-focus-right="month-later"
          data-focus-up={`month-day-${month.days[36]?.localDate ?? month.gridEndDate}`}
          onClick={() => changeMonth(-1)}
          type="button"
        >
          <Icon name="chevron-left" />
          <span>Earlier month</span>
        </button>
        <button
          aria-label="Later month"
          className="focusable"
          data-focus-id="month-later"
          data-focus-left="month-earlier"
          data-focus-right="month-later"
          data-focus-up={`month-day-${month.days[41]?.localDate ?? month.gridEndDate}`}
          onClick={() => changeMonth(1)}
          type="button"
        >
          <span>Later month</span>
          <Icon name="chevron-right" />
        </button>
      </div>
    </div>
  );

  function changeMonth(delta: number): void {
    const date = new Date(`${monthKey}-01T12:00:00.000Z`);
    date.setUTCMonth(date.getUTCMonth() + delta);
    const next = date.toISOString().slice(0, 7);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('month', next);
    setSearchParams(nextParams, { replace: true });
  }
}

function MonthCell({
  day,
  days,
  events,
  index,
  onSelect,
  selected,
}: {
  day: MonthDay;
  days: MonthDay[];
  events: CalendarEvent[];
  index: number;
  onSelect: (localDate: string) => void;
  selected: boolean;
}) {
  const previous = index > 0 ? index - 1 : index;
  const next = index < 41 ? index + 1 : index;
  const above = index >= 7 ? index - 7 : index;
  const below = index <= 34 ? index + 7 : index;
  return (
    <button
      aria-label={dayLabel(day.localDate, events)}
      aria-pressed={selected}
      className={`month-cell focusable${day.inMonth ? '' : ' month-cell--outside'}${day.isToday ? ' month-cell--today' : ''}`}
      data-focus-entry={day.isToday ? 'true' : undefined}
      data-focus-id={`month-day-${day.localDate}`}
      data-focus-left={
        index % 7 === 0 ? 'nav-month' : `month-day-${days[previous]?.localDate ?? day.localDate}`
      }
      data-focus-right={
        index % 7 === 6
          ? `month-day-${day.localDate}`
          : `month-day-${days[next]?.localDate ?? day.localDate}`
      }
      data-focus-up={`month-day-${days[above]?.localDate ?? day.localDate}`}
      data-focus-down={
        index <= 34
          ? `month-day-${days[below]?.localDate ?? day.localDate}`
          : index % 7 <= 3
            ? 'month-earlier'
            : 'month-later'
      }
      onClick={() => onSelect(day.localDate)}
      onFocus={() => onSelect(day.localDate)}
      type="button"
    >
      <strong>{day.dayNumber}</strong>
      <span aria-hidden="true" className="month-events">
        {events.slice(0, MAX_VISIBLE_EVENTS).map((event, eventIndex) => (
          <span
            className={`month-event-label${eventIndex === 1 ? ' month-event-label--secondary' : ''}`}
            key={event.id}
            title={event.title}
          >
            <i style={{ '--event-color': event.color } as CSSProperties} />
            <span>{event.title}</span>
          </span>
        ))}
        {events.length > MAX_VISIBLE_EVENTS ? (
          <span className="month-event-more month-event-more--wide">
            +{events.length - MAX_VISIBLE_EVENTS} more
          </span>
        ) : null}
        {events.length > 1 ? (
          <span className="month-event-more month-event-more--compact">
            +{events.length - 1} more
          </span>
        ) : null}
        <span className="month-event-compact-marks">
          {events.slice(0, MAX_COMPACT_MARKS).map((event) => (
            <i key={event.id} style={{ '--event-color': event.color } as CSSProperties} />
          ))}
        </span>
      </span>
    </button>
  );
}

function MonthDayDetails({ day, events }: { day: MonthDay; events: CalendarEvent[] }) {
  return (
    <section aria-live="polite" className="month-day-details">
      <header>
        <h2>{detailDateLabel(day.localDate)}</h2>
        <span>
          {events.length === 0
            ? 'Nothing planned'
            : `${events.length} ${events.length === 1 ? 'plan' : 'plans'}`}
        </span>
      </header>
      {events.length === 0 ? (
        <p>Nothing planned for this day.</p>
      ) : (
        <ul>
          {events.map((event) => (
            <li key={event.id}>
              <i style={{ '--event-color': event.color } as CSSProperties} />
              <strong>{event.title}</strong>
              <span>{eventTimeLabel(event)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MonthLegend({ calendars }: { calendars: CalendarSource[] }) {
  const orderedCalendars = calendars.toSorted(
    (left, right) => Number(left.owner === null) - Number(right.owner === null),
  );
  return (
    <section aria-label="Calendar key" className="month-legend">
      <h2>Calendar key</h2>
      <div>
        {orderedCalendars.map((calendar) => (
          <span className="month-legend__item" key={calendar.id}>
            <i style={{ '--event-color': calendar.color } as CSSProperties} />
            {calendar.owner === null ? (
              <span aria-hidden="true" className="month-legend__family">
                H
              </span>
            ) : (
              <Avatar member={calendar.owner} size="small" />
            )}
            <strong>{calendar.displayName}</strong>
          </span>
        ))}
      </div>
    </section>
  );
}

function indexEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const indexed = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    let date = event.startLocalDate;
    while (date <= event.endLocalDate) {
      const existing = indexed.get(date);
      if (existing === undefined) indexed.set(date, [event]);
      else existing.push(event);
      date = nextLocalDate(date);
    }
  }
  return indexed;
}

function nextLocalDate(localDate: string): string {
  const date = new Date(`${localDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function dayLabel(localDate: string, events: CalendarEvent[]): string {
  const date = new Intl.DateTimeFormat('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${localDate}T12:00:00.000Z`));
  if (events.length === 0) return `${date}, nothing planned`;
  return `${date}, ${events.length} ${events.length === 1 ? 'plan' : 'plans'}: ${events.map((event) => event.title).join(', ')}`;
}

function detailDateLabel(localDate: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${localDate}T12:00:00.000Z`));
}

function eventTimeLabel(event: CalendarEvent): string {
  if (event.allDay) return 'All day';
  return new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Australia/Perth',
  }).format(new Date(event.start));
}
