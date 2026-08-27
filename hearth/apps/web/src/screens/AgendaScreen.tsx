import { useState } from 'react';

import type { CalendarEvent, DemoScenario, WeekDay } from '@hearth/shared';

import { CalendarAgenda } from '../components/CalendarAgenda';
import { CalendarViewSwitch } from '../components/CalendarViewSwitch';
import { EventDetailsDialog } from '../components/EventDetailsDialog';
import { ScreenHeader } from '../components/ScreenHeader';
import { FailureState, LoadingState, StatusBanner } from '../components/Status';
import { useWeekQuery } from '../hooks/useCalendarQueries';
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
  const query = useWeekQuery(runtime.localDate, !preparing);
  const online = useOnlineStatus(scenario === 'offline');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  if (preparing || query.isPending) return <LoadingState />;
  if (query.data === undefined) return <FailureState onRetry={() => void query.refetch()} />;
  const week = query.data;
  const days = week.days.slice(0, 4);
  const events = eventsInRange(week.events, days);
  return (
    <div className="screen agenda-screen">
      <ScreenHeader
        title="Agenda"
        meta={agendaRange(days, runtime.locale)}
        actions={<span className="agenda-count">{agendaCount(events.length)}</span>}
      />
      <CalendarViewSwitch />
      {!online ? <StatusBanner kind="offline">Offline · Showing saved plans.</StatusBanner> : null}
      {week.freshness === 'stale' && online ? (
        <StatusBanner kind={scenario === 'unavailable' ? 'unavailable' : 'stale'}>
          {week.statusMessage}
        </StatusBanner>
      ) : null}
      <CalendarAgenda
        days={days}
        events={events}
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
}

function agendaCount(eventCount: number): string {
  return `${eventCount} ${eventCount === 1 ? 'plan' : 'plans'} · 4 days`;
}

function eventsInRange(events: CalendarEvent[], days: WeekDay[]): CalendarEvent[] {
  const firstDay = days[0]?.localDate;
  const lastDay = days[days.length - 1]?.localDate;
  if (firstDay === undefined || lastDay === undefined) return [];
  return events.filter(
    (event) => event.startLocalDate <= lastDay && event.endLocalDate >= firstDay,
  );
}

function agendaRange(days: WeekDay[], locale: string): string {
  const firstDay = days[0]?.localDate;
  const lastDay = days[days.length - 1]?.localDate;
  if (firstDay === undefined || lastDay === undefined) return 'Today and the next 3 days';
  const start = new Date(`${firstDay}T12:00:00.000Z`);
  const end = new Date(`${lastDay}T12:00:00.000Z`);
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', timeZone: 'UTC' });
  const month = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' });
  const startDay = day.format(start);
  const endDay = day.format(end);
  const startMonth = month.format(start);
  const endMonth = month.format(end);
  return startMonth === endMonth
    ? `${startDay}–${endDay} ${endMonth}`
    : `${startDay} ${startMonth}–${endDay} ${endMonth}`;
}
