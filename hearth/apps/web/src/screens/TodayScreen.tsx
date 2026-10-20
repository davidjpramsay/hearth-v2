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
import { getTodayRailCapacity, useTodayViewportClass } from '../layout/todayRailCapacity';
import { useHearthRuntime } from '../runtime/context';
import { useModules } from '../modules/context';
import './TodayScreen.css';

export function TodayScreen({
  scenario,
  preparing,
}: {
  scenario: DemoScenario | 'offline';
  preparing: boolean;
}) {
  const modules = useModules();
  const query = useTodayQuery(!preparing);
  const todayPhoto =
    modules.photos && query.data?.sections.photo === true ? query.data.photo : null;
  const photosQuery = usePhotosQuery(!preparing && todayPhoto !== null);
  const { rotationPaused } = usePhotoRotationPreference();
  const rotatingPhoto = useTodayPhotoRotation({
    // Do not flash the fixed server preview before the shuffled album's first image arrives.
    // A failed album read still retains Today's safe cached preview.
    fallbackPhoto: photosQuery.isPending ? null : (todayPhoto ?? null),
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
  const viewportClass = useTodayViewportClass();

  if (preparing || query.isPending) return <LoadingState />;
  if (query.data === undefined) return <FailureState onRetry={() => void query.refetch()} />;
  const raw = query.data;
  const today = {
    ...raw,
    weather: modules.weather ? raw.weather : null,
    events: modules.calendar ? raw.events : [],
    chores: modules.chores ? raw.chores : [],
    sections: {
      dinner: modules.meals && raw.sections.dinner,
      listSummary: modules.lists && raw.sections.listSummary,
      notice: modules.notices && raw.sections.notice,
      photo: modules.photos && raw.sections.photo,
      dailyVerse: modules.dailyVerse && raw.sections.dailyVerse,
      reminders: modules.reminders && raw.sections.reminders,
    },
  };
  const showReminderSummary = today.sections.reminders && today.reminderSummary !== null;
  const visibleSummaryCount = [
    today.sections.dinner,
    today.sections.listSummary,
    today.sections.notice,
    today.sections.dailyVerse,
    showReminderSummary,
  ].filter(Boolean).length;
  const showPhoto = today.sections.photo && rotatingPhoto !== null;
  const photoOrientation = showPhoto && rotatingPhoto !== null ? rotatingPhoto.orientation : 'none';
  const railCapacity = getTodayRailCapacity({
    photoOrientation,
    summaryCount: visibleSummaryCount,
    hasVerse: today.sections.dailyVerse,
    viewportClass,
  });
  const visibleEvents = today.events.slice(0, railCapacity);
  const visibleChores = today.chores.slice(0, railCapacity);
  const eventOverflowCount = Math.max(0, today.events.length - visibleEvents.length);
  const choreOverflowCount = Math.max(0, today.chores.length - visibleChores.length);
  const primaryChoreId =
    today.chores.find((chore) => chore.state === 'pending' && !chore.locked)?.id ??
    today.chores[0]?.id;
  const dashboardDensity =
    eventOverflowCount > 0 || choreOverflowCount > 0 || visibleSummaryCount >= 3
      ? 'dense'
      : 'relaxed';
  const hasVisibleSummaryContent =
    (today.sections.dinner && today.dinner !== null) ||
    (today.sections.listSummary && today.listSummary !== null) ||
    (today.sections.notice && today.notice !== null) ||
    today.sections.dailyVerse ||
    showReminderSummary ||
    showPhoto;
  const empty = today.events.length === 0 && today.chores.length === 0 && !hasVisibleSummaryContent;
  if (empty) {
    if (!modules.calendar && !modules.chores)
      return (
        <div className="screen today-screen">
          <ScreenHeader title="Today" />
          <p>All set for today.</p>
        </div>
      );
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
    // Spatial navigation follows the actual grid after resize, photo rotation and toggles.
    return { 'data-focus-id': focusId };
  }

  return (
    <div className="screen today-screen">
      <ScreenHeader
        eyebrow={today.household.mode}
        title="Today"
        actions={
          modules.weather ? (
            <div className="today-glance">
              <div className="weather">
                <Icon name={today.weather === null ? 'cloud' : 'sun'} />
                <strong>
                  {today.weather === null ? '—' : `${today.weather.temperatureCelsius}°`}
                </strong>
                <span>{today.weather?.condition ?? 'Forecast unavailable'}</span>
              </div>
            </div>
          ) : undefined
        }
      />
      {!online ? <StatusBanner kind="offline">Offline · Showing saved plans.</StatusBanner> : null}
      {modules.calendar && today.freshness === 'stale' && online ? (
        <StatusBanner kind={scenario === 'unavailable' ? 'unavailable' : 'stale'}>
          {today.statusMessage}
        </StatusBanner>
      ) : null}
      <div
        className={`today-dashboard today-dashboard--photo-${photoOrientation}`}
        data-density={dashboardDensity}
        data-core-count={Number(modules.chores) + Number(modules.calendar)}
        data-photo-orientation={photoOrientation}
        data-rail-capacity={railCapacity}
        data-summary-count={visibleSummaryCount}
      >
        <div
          className={`today-columns${!modules.calendar || !modules.chores ? ' today-columns--single' : ''}`}
          hidden={!modules.calendar && !modules.chores}
        >
          {modules.chores ? (
            <section className="today-section chores-due-section">
              <div className="section-heading">
                <h2>Due now &amp; today</h2>
                {choreOverflowCount > 0 ? (
                  <Link
                    aria-label={`View ${choreOverflowCount} more ${choreOverflowCount === 1 ? 'chore' : 'chores'}`}
                    className="today-section-more focusable"
                    data-focus-id="today-chore-overflow"
                    to="/chores"
                  >
                    +{choreOverflowCount} more <Icon name="chevron-right" />
                  </Link>
                ) : (
                  <span>{today.chores.filter((item) => item.state === 'pending').length} left</span>
                )}
              </div>
              <div className="chore-list">
                {visibleChores.map((occurrence) => (
                  <ChoreRow
                    focus={{
                      'data-focus-id': `today-chore-${occurrence.id}`,
                      'data-focus-entry': occurrence.id === primaryChoreId ? 'true' : undefined,
                    }}
                    key={occurrence.id}
                    mutation={mutation}
                    occurrence={occurrence}
                  />
                ))}
              </div>
            </section>
          ) : null}
          {modules.calendar ? (
            <section className="today-section upcoming-section">
              <div className="section-heading">
                <h2>Upcoming</h2>
                {eventOverflowCount > 0 ? (
                  <Link
                    aria-label={`View ${eventOverflowCount} more ${eventOverflowCount === 1 ? 'plan' : 'plans'} in Calendar`}
                    className="today-section-more focusable"
                    data-focus-id="today-event-overflow"
                    to="/calendar/agenda"
                  >
                    +{eventOverflowCount} more <Icon name="chevron-right" />
                  </Link>
                ) : (
                  <span>{today.events.length} plans</span>
                )}
              </div>
              <div className="event-list">
                {visibleEvents.map((event) => (
                  <EventRow
                    event={event}
                    focus={{
                      'data-focus-id': `today-event-${event.id}`,
                    }}
                    key={event.id}
                    onSelect={setSelectedEvent}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
        {visibleSummaryCount === 0 && !showPhoto ? null : (
          <div
            className={`summary-row${showPhoto ? '' : ' summary-row--without-photo'}${visibleSummaryCount === 0 ? ' summary-row--photo-only' : ''}`}
          >
            {visibleSummaryCount === 0 ? null : (
              <div
                className={`summary-details summary-details--count-${visibleSummaryCount}${today.sections.dailyVerse ? ' summary-details--with-verse' : ''}`}
              >
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
                {showReminderSummary && today.reminderSummary !== null ? (
                  <SummaryBand
                    ariaLabel="Open reminders"
                    focus={summaryFocus('today-summary-reminders')}
                    icon="bell"
                    label="Reminders"
                    to="/reminders"
                  >
                    {today.reminderSummary.openCount === 0 ? (
                      'No open reminders'
                    ) : (
                      <>
                        <span className="today-reminder-summary__count">
                          {today.reminderSummary.openCount}{' '}
                          {today.reminderSummary.openCount === 1
                            ? 'open reminder'
                            : 'open reminders'}
                        </span>
                        <br />
                        <span className="today-reminder-summary__preview">
                          {today.reminderSummary.items[0]?.title ?? 'Open reminders'}
                          {today.reminderSummary.openCount > 1
                            ? ` · +${today.reminderSummary.openCount - 1} more`
                            : ''}
                        </span>
                      </>
                    )}
                  </SummaryBand>
                ) : null}
                {today.sections.dailyVerse ? (
                  today.dailyVerse === null ? (
                    <SummaryBand className="today-daily-verse" icon="book-open" label="Daily verse">
                      Add the private ESV key to show today’s verse
                    </SummaryBand>
                  ) : (
                    <SummaryBand
                      ariaLabel={`Read ${today.dailyVerse.reference}`}
                      className="today-daily-verse"
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
                data-focus-id="today-photo"
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
        event={modules.calendar ? selectedEvent : null}
        onClose={() => setSelectedEvent(null)}
        timezone={runtime.timezone}
      />
      <NoticeDetailsDialog
        message={modules.notices ? selectedNotice : null}
        onClose={() => setSelectedNotice(null)}
      />
      <DailyVerseDetailsDialog
        onClose={() => setSelectedDailyVerse(null)}
        verse={modules.dailyVerse ? selectedDailyVerse : null}
      />
    </div>
  );
}
