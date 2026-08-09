import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { addLocalDays } from '@hearth/core';
import type { CalendarEvent, DemoScenario } from '@hearth/shared';

import { CalendarAgenda } from '../components/CalendarAgenda';
import { CalendarViewSwitch } from '../components/CalendarViewSwitch';
import { EventDetailsDialog } from '../components/EventDetailsDialog';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { FailureState, LoadingState, StatusBanner } from '../components/Status';
import { useWeekQuery } from '../hooks/useHearthQueries';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useHearthRuntime } from '../runtime/context';

export function AgendaScreen({
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
  return (
    <div className="screen agenda-screen">
      <ScreenHeader
        eyebrow="Calendar"
        title="Agenda"
        meta={week.displayRange}
        actions={<span className="agenda-count">{agendaCount(week.events.length)}</span>}
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
      <CalendarAgenda
        days={week.days}
        events={week.events}
        onSelect={setSelectedEvent}
        timezone={runtime.timezone}
      />
      <div className="calendar-period-controls">
        <button
          className="focusable"
          data-focus-id="agenda-earlier"
          data-focus-left="nav-calendar"
          data-focus-right="agenda-today"
          onClick={() => changeWeek(-7)}
          type="button"
        >
          <Icon name="chevron-left" /> Earlier
        </button>
        <button
          className="focusable"
          data-focus-id="agenda-today"
          data-focus-left="agenda-earlier"
          data-focus-right="agenda-later"
          onClick={goToCurrentWeek}
          type="button"
        >
          This week
        </button>
        <button
          className="focusable"
          data-focus-id="agenda-later"
          data-focus-left="agenda-today"
          data-focus-right="agenda-later"
          onClick={() => changeWeek(7)}
          type="button"
        >
          Later <Icon name="chevron-right" />
        </button>
      </div>
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

function agendaCount(eventCount: number): string {
  return `${eventCount} ${eventCount === 1 ? 'plan' : 'plans'} this week`;
}
