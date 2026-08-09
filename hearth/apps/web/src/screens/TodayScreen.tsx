import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import type { DemoScenario } from '@hearth/shared';

import { hearthApi } from '../api/client';
import { ChoreRow } from '../components/ChoreRow';
import { EventRow } from '../components/EventRow';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState, FailureState, LoadingState, StatusBanner } from '../components/Status';
import { SummaryBand } from '../components/SummaryBand';
import { TodayPhoto } from '../components/TodayPhoto';
import { useChoreMutation } from '../hooks/useChoreMutation';
import { useTodayQuery } from '../hooks/useHearthQueries';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useHearthRuntime } from '../runtime/context';

export function TodayScreen({
  scenario,
  preparing,
}: {
  scenario: DemoScenario | 'offline';
  preparing: boolean;
}) {
  const query = useTodayQuery(!preparing);
  const runtime = useHearthRuntime();
  const mutation = useChoreMutation();
  const online = useOnlineStatus(scenario === 'offline');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  if (preparing || query.isPending) return <LoadingState />;
  if (query.data === undefined) return <FailureState onRetry={() => void query.refetch()} />;
  const today = query.data;
  const primaryChoreId =
    today.chores.find((chore) => chore.state === 'pending' && !chore.locked)?.id ??
    today.chores[0]?.id;
  const empty = today.events.length === 0 && today.chores.length === 0;
  if (empty) {
    return (
      <EmptyState onBootstrap={runtime.mode === 'private' ? undefined : () => void bootstrap()} />
    );
  }

  async function bootstrap() {
    await hearthApi.resetDemo();
    await queryClient.invalidateQueries();
    navigate('/today', { replace: true });
  }

  return (
    <div className="screen today-screen">
      <ScreenHeader
        eyebrow={today.household.mode}
        title="Today"
        meta={<span>{today.displayDate}</span>}
        actions={
          <div className="today-glance">
            <div>
              <strong>{today.displayTime}</strong>
              <span>{timezoneLabel(today.household.timezone)}</span>
            </div>
            <div className="weather">
              <Icon name={today.weather === null ? 'cloud' : 'sun'} />
              <strong>
                {today.weather === null ? '—' : `${today.weather.temperatureCelsius}°`}
              </strong>
              <span>{today.weather?.condition ?? 'Forecast unavailable'}</span>
            </div>
          </div>
        }
      />
      {!online ? (
        <StatusBanner kind="offline">You’re offline · Showing saved plans.</StatusBanner>
      ) : null}
      {today.freshness === 'stale' && online ? (
        <StatusBanner kind={scenario === 'unavailable' ? 'unavailable' : 'stale'}>
          {today.statusMessage}
        </StatusBanner>
      ) : null}
      <div className="today-columns">
        <section className="today-section upcoming-section">
          <div className="section-heading">
            <h2>Upcoming</h2>
            <span>{today.events.length} plans</span>
          </div>
          <div className="event-list">
            {today.events.slice(0, 3).map((event, index, events) => (
              <EventRow
                event={event}
                focus={{
                  'data-focus-id': `today-event-${event.id}`,
                  'data-focus-up':
                    index === 0
                      ? `today-event-${event.id}`
                      : `today-event-${events[index - 1]?.id}`,
                  'data-focus-down':
                    index === events.length - 1
                      ? `today-event-${event.id}`
                      : `today-event-${events[index + 1]?.id}`,
                  'data-focus-left': 'nav-today',
                  'data-focus-right': `today-chore-${today.chores[Math.min(index, today.chores.length - 1)]?.id ?? 'occurrence_school_bag'}`,
                }}
                key={event.id}
              />
            ))}
          </div>
        </section>
        <section className="today-section chores-due-section">
          <div className="section-heading">
            <h2>Due now &amp; today</h2>
            <span>
              {today.chores.slice(0, 3).filter((item) => item.state === 'pending').length} left
            </span>
          </div>
          <div className="chore-list">
            {today.chores.slice(0, 3).map((occurrence, index, chores) => (
              <ChoreRow
                focus={{
                  'data-focus-id': `today-chore-${occurrence.id}`,
                  'data-focus-entry': occurrence.id === primaryChoreId ? 'true' : undefined,
                  'data-focus-up':
                    index === 0
                      ? `today-chore-${occurrence.id}`
                      : `today-chore-${chores[index - 1]?.id}`,
                  'data-focus-down':
                    index === chores.length - 1
                      ? `today-chore-${occurrence.id}`
                      : `today-chore-${chores[index + 1]?.id}`,
                  'data-focus-left':
                    index < today.events.length
                      ? `today-event-${today.events[index]?.id}`
                      : 'nav-today',
                }}
                key={occurrence.id}
                mutation={mutation}
                occurrence={occurrence}
              />
            ))}
          </div>
        </section>
      </div>
      <div className={`summary-row${today.photo === null ? ' summary-row--without-photo' : ''}`}>
        <div className="summary-details">
          <SummaryBand icon="meal" label="Dinner">
            {today.dinner ?? 'Nothing planned'}
          </SummaryBand>
          <SummaryBand icon="list" label="List summary">
            {today.listSummary === null
              ? 'No active list'
              : `${today.listSummary.name} · ${today.listSummary.remainingCount} items left`}
          </SummaryBand>
          <SummaryBand icon="home" label="Notice">
            {today.notice ?? 'No notices'}
          </SummaryBand>
        </div>
        {today.photo === null ? null : <TodayPhoto photo={today.photo} />}
      </div>
      <p className="sr-only" aria-live="polite">
        {mutation.pendingOccurrenceId === null ? '' : 'Saving chore change'}
      </p>
    </div>
  );
}

function timezoneLabel(timezone: string): string {
  return (timezone.split('/').at(-1) ?? timezone).replaceAll('_', ' ');
}
