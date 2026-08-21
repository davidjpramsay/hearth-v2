import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { CalendarEvent, DailyVerseSummary, DemoScenario } from '@hearth/shared';

import { demoApi as hearthApi } from '../api/demo';
import { ChoreRow } from '../components/ChoreRow';
import { DailyVerseDetailsDialog } from '../components/DailyVerseDetailsDialog';
import { EventDetailsDialog } from '../components/EventDetailsDialog';
import { EventRow } from '../components/EventRow';
import { Icon } from '../components/Icon';
import { NoticeDetailsDialog } from '../components/NoticeDetailsDialog';
import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState, FailureState, LoadingState, StatusBanner } from '../components/Status';
import { SummaryBand } from '../components/SummaryBand';
import { TodayPhoto } from '../components/TodayPhoto';
import { useChoreMutation } from '../hooks/useChoreMutation';
import { usePhotoRotationPreference } from '../hooks/usePhotoRotationPreference';
import { usePhotosQuery } from '../hooks/usePhotoQueries';
import { useTodayPhotoRotation } from '../hooks/useTodayPhotoRotation';
import { useTodayQuery } from '../hooks/useTodayQueries';
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
  const todayPhoto = query.data?.sections.photo === true ? query.data.photo : null;
  const photosQuery = usePhotosQuery(!preparing && todayPhoto !== null);
  const { rotationPaused } = usePhotoRotationPreference();
  const rotatingPhoto = useTodayPhotoRotation({
    fallbackPhoto: todayPhoto ?? null,
    gallery: todayPhoto === null ? undefined : photosQuery.data,
    paused: rotationPaused,
  });
  const runtime = useHearthRuntime();
  const mutation = useChoreMutation();
  const online = useOnlineStatus(scenario === 'offline');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [selectedNotice, setSelectedNotice] = useState<string | null>(null);
  const [selectedDailyVerse, setSelectedDailyVerse] = useState<DailyVerseSummary | null>(null);

  if (preparing || query.isPending) return <LoadingState />;
  if (query.data === undefined) return <FailureState onRetry={() => void query.refetch()} />;
  const today = query.data;
  const visibleEvents = today.events.slice(0, 3);
  const visibleChores = today.chores.slice(0, 3);
  const eventOverflowCount = Math.max(0, today.events.length - visibleEvents.length);
  const choreOverflowCount = Math.max(0, today.chores.length - visibleChores.length);
  const primaryChoreId =
    today.chores.find((chore) => chore.state === 'pending' && !chore.locked)?.id ??
    today.chores[0]?.id;
  const visibleSummaryCount = [
    today.sections.dinner,
    today.sections.listSummary,
    today.sections.notice,
    today.sections.dailyVerse,
  ].filter(Boolean).length;
  const showPhoto = today.sections.photo && rotatingPhoto !== null;
  const photoOrientation = showPhoto && rotatingPhoto !== null ? rotatingPhoto.orientation : 'none';
  const dashboardDensity =
    eventOverflowCount > 0 || choreOverflowCount > 0 || visibleSummaryCount >= 3
      ? 'dense'
      : 'relaxed';
  const summaryFocusIds = [
    today.sections.dinner ? 'today-summary-dinner' : null,
    today.sections.listSummary ? 'today-summary-list' : null,
    today.sections.notice && today.notice !== null ? 'today-summary-notice' : null,
    today.sections.dailyVerse && today.dailyVerse !== null ? 'today-summary-daily-verse' : null,
  ].filter((focusId): focusId is string => focusId !== null);
  const lastEventFocusId = visibleEvents.at(-1)
    ? `today-event-${visibleEvents.at(-1)!.id}`
    : 'nav-today';
  const lastChoreFocusId = visibleChores.at(-1)
    ? `today-chore-${visibleChores.at(-1)!.id}`
    : 'nav-today';
  const firstBottomFocusId = summaryFocusIds[0] ?? (showPhoto ? 'today-photo' : 'nav-today');
  const eventAfterRowsFocusId =
    eventOverflowCount > 0
      ? 'today-event-overflow'
      : firstBottomFocusId === 'nav-today'
        ? lastEventFocusId
        : firstBottomFocusId;
  const choreAfterRowsFocusId =
    choreOverflowCount > 0
      ? 'today-chore-overflow'
      : showPhoto
        ? 'today-photo'
        : (summaryFocusIds[0] ?? lastChoreFocusId);
  const hasVisibleSummaryContent =
    (today.sections.dinner && today.dinner !== null) ||
    (today.sections.listSummary && today.listSummary !== null) ||
    (today.sections.notice && today.notice !== null) ||
    today.sections.dailyVerse ||
    showPhoto;
  const empty = today.events.length === 0 && today.chores.length === 0 && !hasVisibleSummaryContent;
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

  function summaryFocus(focusId: string) {
    const index = summaryFocusIds.indexOf(focusId);
    return {
      'data-focus-id': focusId,
      'data-focus-up':
        index === 0
          ? eventOverflowCount > 0
            ? 'today-event-overflow'
            : lastEventFocusId
          : (summaryFocusIds[index - 1] ?? focusId),
      'data-focus-down': summaryFocusIds[index + 1] ?? focusId,
      'data-focus-left': 'nav-today',
      'data-focus-right': showPhoto ? 'today-photo' : focusId,
    };
  }

  return (
    <div className="screen today-screen">
      <ScreenHeader
        eyebrow={today.household.mode}
        title="Today"
        actions={
          <div className="today-glance">
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
      <div
        className={`today-dashboard today-dashboard--photo-${photoOrientation}`}
        data-density={dashboardDensity}
        data-photo-orientation={photoOrientation}
        data-summary-count={visibleSummaryCount}
      >
        <div className="today-columns">
          <section className="today-section upcoming-section">
            <div className="section-heading">
              <h2>Upcoming</h2>
              {eventOverflowCount > 0 ? (
                <Link
                  aria-label={`View ${eventOverflowCount} more ${eventOverflowCount === 1 ? 'plan' : 'plans'} in Calendar`}
                  className="today-section-more focusable"
                  data-focus-down={firstBottomFocusId}
                  data-focus-id="today-event-overflow"
                  data-focus-left="nav-today"
                  data-focus-right={
                    choreOverflowCount > 0 ? 'today-chore-overflow' : lastChoreFocusId
                  }
                  data-focus-up={lastEventFocusId}
                  to="/calendar/agenda"
                >
                  +{eventOverflowCount} more <Icon name="chevron-right" />
                </Link>
              ) : (
                <span>{today.events.length} plans</span>
              )}
            </div>
            <div className="event-list">
              {visibleEvents.map((event, index, events) => (
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
                        ? eventAfterRowsFocusId
                        : `today-event-${events[index + 1]?.id}`,
                    'data-focus-left': 'nav-today',
                    'data-focus-right': visibleChores[Math.min(index, visibleChores.length - 1)]
                      ? `today-chore-${visibleChores[Math.min(index, visibleChores.length - 1)]!.id}`
                      : 'nav-today',
                  }}
                  key={event.id}
                  onSelect={setSelectedEvent}
                />
              ))}
            </div>
          </section>
          <section className="today-section chores-due-section">
            <div className="section-heading">
              <h2>Due now &amp; today</h2>
              {choreOverflowCount > 0 ? (
                <Link
                  aria-label={`View ${choreOverflowCount} more ${choreOverflowCount === 1 ? 'chore' : 'chores'}`}
                  className="today-section-more focusable"
                  data-focus-down={showPhoto ? 'today-photo' : firstBottomFocusId}
                  data-focus-id="today-chore-overflow"
                  data-focus-left={
                    eventOverflowCount > 0 ? 'today-event-overflow' : lastEventFocusId
                  }
                  data-focus-right="today-chore-overflow"
                  data-focus-up={lastChoreFocusId}
                  to="/chores"
                >
                  +{choreOverflowCount} more <Icon name="chevron-right" />
                </Link>
              ) : (
                <span>{today.chores.filter((item) => item.state === 'pending').length} left</span>
              )}
            </div>
            <div className="chore-list">
              {visibleChores.map((occurrence, index, chores) => (
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
                        ? choreAfterRowsFocusId
                        : `today-chore-${chores[index + 1]?.id}`,
                    'data-focus-left':
                      index < visibleEvents.length
                        ? `today-event-${visibleEvents[index]?.id}`
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
        {visibleSummaryCount === 0 && !showPhoto ? null : (
          <div
            className={`summary-row${showPhoto ? '' : ' summary-row--without-photo'}${visibleSummaryCount === 0 ? ' summary-row--photo-only' : ''}`}
          >
            {visibleSummaryCount === 0 ? null : (
              <div className={`summary-details summary-details--count-${visibleSummaryCount}`}>
                {today.sections.dinner ? (
                  <SummaryBand
                    ariaLabel="Open the family meal plan"
                    focus={summaryFocus('today-summary-dinner')}
                    icon="meal"
                    label="Dinner"
                    to="/meals"
                  >
                    {today.dinner ?? 'Nothing planned'}
                  </SummaryBand>
                ) : null}
                {today.sections.listSummary ? (
                  <SummaryBand
                    ariaLabel="Open household lists"
                    focus={summaryFocus('today-summary-list')}
                    icon="list"
                    label="List summary"
                    to="/lists"
                  >
                    {today.listSummary === null
                      ? 'No active list'
                      : `${today.listSummary.name} · ${today.listSummary.remainingCount} items left`}
                  </SummaryBand>
                ) : null}
                {today.sections.notice ? (
                  today.notice === null ? (
                    <SummaryBand icon="home" label="Notice">
                      No notices
                    </SummaryBand>
                  ) : (
                    <SummaryBand
                      ariaLabel="Read the full household notice"
                      focus={summaryFocus('today-summary-notice')}
                      icon="home"
                      label="Notice"
                      onActivate={() => setSelectedNotice(today.notice)}
                    >
                      {today.notice}
                    </SummaryBand>
                  )
                ) : null}
                {today.sections.dailyVerse ? (
                  today.dailyVerse === null ? (
                    <SummaryBand icon="book-open" label="Daily verse">
                      Add the private ESV key to show today’s verse
                    </SummaryBand>
                  ) : (
                    <SummaryBand
                      ariaLabel={`Read ${today.dailyVerse.reference}`}
                      focus={summaryFocus('today-summary-daily-verse')}
                      icon="book-open"
                      label="Daily verse"
                      onActivate={() => setSelectedDailyVerse(today.dailyVerse)}
                    >
                      {today.dailyVerse.reference} · {today.dailyVerse.text}
                    </SummaryBand>
                  )
                ) : null}
              </div>
            )}
            {showPhoto && rotatingPhoto !== null ? (
              <Link
                aria-label="Open family photos"
                className="today-photo-action focusable"
                data-focus-down="today-photo"
                data-focus-id="today-photo"
                data-focus-left={summaryFocusIds.at(-1) ?? 'nav-today'}
                data-focus-right="today-photo"
                data-focus-up={choreOverflowCount > 0 ? 'today-chore-overflow' : lastChoreFocusId}
                to="/photos"
              >
                <TodayPhoto photo={rotatingPhoto} />
              </Link>
            ) : null}
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {mutation.pendingOccurrenceId === null ? '' : 'Saving chore change'}
      </p>
      <EventDetailsDialog
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        timezone={runtime.timezone}
      />
      <NoticeDetailsDialog message={selectedNotice} onClose={() => setSelectedNotice(null)} />
      <DailyVerseDetailsDialog
        onClose={() => setSelectedDailyVerse(null)}
        verse={selectedDailyVerse}
      />
    </div>
  );
}
