import { useState } from 'react';
import { Link } from 'react-router-dom';

import './RemindersScreen.css';

import type { HearthReminder } from '@hearth/shared';

import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState, FailureState, LoadingState, StatusBanner } from '../components/Status';
import { useRemindersQuery } from '../hooks/useReminderQueries';
import { useHearthRuntime } from '../runtime/context';

type ReminderFilter = 'open' | 'all';

export function RemindersScreen({ preparing }: { preparing: boolean }) {
  const [filter, setFilter] = useState<ReminderFilter>('open');
  const query = useRemindersQuery(filter === 'all', !preparing);
  const runtime = useHearthRuntime();

  if (preparing || query.isPending) return <LoadingState />;
  if (query.data === undefined) return <FailureState onRetry={() => void query.refetch()} />;

  const overview = query.data;
  const source = overview.source;
  const usable = source?.status === 'current' || source?.status === 'stale';
  if (!usable) {
    const waiting = source?.status === 'awaiting-first-snapshot';
    return (
      <div className="screen reminders-screen reminders-screen--setup">
        <EmptyState
          title={waiting ? 'Waiting for the first reminder update' : 'Connect Apple Reminders'}
          description={waiting ? 'Open Hearth Companion.' : 'Use Hearth Companion.'}
        />
        <Link
          className="reminders-setup-link focusable"
          data-focus-entry="true"
          data-focus-id="reminders-setup"
          data-focus-left="nav-reminders"
          to="/admin/connections/reminders"
        >
          Open connection <Icon name="chevron-right" />
        </Link>
      </div>
    );
  }

  const visibleLists = overview.lists.filter((list) =>
    overview.reminders.some((reminder) => reminder.listId === list.id),
  );
  const openCount = overview.lists.reduce((total, list) => total + list.incompleteCount, 0);

  return (
    <div className="screen reminders-screen">
      <ScreenHeader
        title="Reminders"
        meta={`${openCount} open across ${overview.lists.length} ${overview.lists.length === 1 ? 'list' : 'lists'}`}
        actions={
          <div aria-label="Reminder filter" className="reminders-filter" role="group">
            <button
              aria-pressed={filter === 'open'}
              className="focusable"
              data-focus-entry="true"
              data-focus-id="reminders-filter-open"
              data-focus-left="nav-reminders"
              data-focus-right="reminders-filter-all"
              onClick={() => setFilter('open')}
              type="button"
            >
              Open
            </button>
            <button
              aria-pressed={filter === 'all'}
              className="focusable"
              data-focus-id="reminders-filter-all"
              data-focus-left="reminders-filter-open"
              data-focus-right="reminders-filter-all"
              onClick={() => setFilter('all')}
              type="button"
            >
              All
            </button>
          </div>
        }
      />
      {source.status === 'stale' ? (
        <StatusBanner kind="stale">Showing the last saved reminders.</StatusBanner>
      ) : null}
      <p className="reminders-freshness">
        <Icon name={source.status === 'current' ? 'shield' : 'warning'} />
        {formatFreshness(source.lastSnapshotReceivedAt, overview.generatedAt)} · Read-only
      </p>
      {visibleLists.length === 0 ? (
        <EmptyState
          title={filter === 'open' ? 'No open reminders' : 'No reminders shared'}
          description={
            filter === 'open'
              ? 'Everything is complete.'
              : 'Choose a populated list in Hearth Companion.'
          }
        />
      ) : (
        <div className="reminders-list-grid">
          {visibleLists.map((list) => {
            const reminders = overview.reminders.filter((reminder) => reminder.listId === list.id);
            return (
              <section className="reminder-list-card" key={list.id}>
                <header>
                  <span className="reminder-list-card__icon">
                    <Icon name="list" />
                  </span>
                  <div>
                    <h2>{list.title}</h2>
                    <p>{list.incompleteCount} open</p>
                  </div>
                </header>
                <div className="reminder-items">
                  {reminders.map((reminder) => (
                    <ReminderRow
                      key={reminder.id}
                      locale={runtime.locale}
                      localDate={runtime.localDate}
                      reminder={reminder}
                      timezone={runtime.household?.timezone ?? 'Australia/Perth'}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReminderRow({
  reminder,
  localDate,
  locale,
  timezone,
}: {
  reminder: HearthReminder;
  localDate: string;
  locale: string;
  timezone: string;
}) {
  return (
    <article className={`reminder-row${reminder.isCompleted ? ' reminder-row--completed' : ''}`}>
      <span className="reminder-row__state">
        {reminder.isCompleted ? <Icon name="check" /> : null}
      </span>
      <div>
        <h3>{reminder.title}</h3>
        <p>{formatDue(reminder, localDate, locale, timezone)}</p>
      </div>
    </article>
  );
}

function formatDue(
  reminder: HearthReminder,
  localDate: string,
  locale: string,
  timezone: string,
): string {
  if (reminder.isCompleted) return 'Completed';
  if (reminder.dueLocalDate === null) return 'No due date';
  const dateLabel = relativeDateLabel(reminder.dueLocalDate, localDate, locale);
  if (!reminder.hasDueTime || reminder.dueAt === null) return dateLabel;
  const time = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  }).format(new Date(reminder.dueAt));
  return `${dateLabel} · ${time}`;
}

function relativeDateLabel(dueDate: string, localDate: string, locale: string): string {
  if (dueDate === localDate) return 'Today';
  if (dueDate === shiftLocalDate(localDate, 1)) return 'Tomorrow';
  if (dueDate < localDate) return 'Overdue';
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${dueDate}T00:00:00.000Z`));
}

function shiftLocalDate(localDate: string, days: number): string {
  const date = new Date(`${localDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatFreshness(receivedAt: string | null, generatedAt: string): string {
  if (receivedAt === null) return 'No snapshot received';
  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.parse(generatedAt) - Date.parse(receivedAt)) / 60_000),
  );
  if (elapsedMinutes < 1) return 'Updated just now';
  if (elapsedMinutes < 60) return `Updated ${elapsedMinutes} min ago`;
  const hours = Math.floor(elapsedMinutes / 60);
  return `Updated ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
}
