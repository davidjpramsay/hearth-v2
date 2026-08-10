import { useMemo, useState } from 'react';

import type { AuditSummary } from '@hearth/shared';

import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Icon } from '../components/Icon';
import { useActivityQuery, useAdminQuery } from '../hooks/useHearthQueries';
import { useHearthRuntime } from '../runtime/context';
import {
  activityFilters,
  actorLabel,
  presentationForActivity,
  resultLabel,
  sourceLabel,
  type ActivityFilter,
} from './activityPresentation';

interface ActivityGroup {
  key: string;
  label: string;
  entries: AuditSummary[];
}

export function SystemActivityScreen() {
  const runtime = useHearthRuntime();
  const activity = useActivityQuery();
  const admin = useAdminQuery();
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const groups = useMemo(
    () =>
      activity.data === undefined
        ? []
        : groupActivity(
            activity.data.entries.filter(
              (entry) =>
                filter === 'all' || presentationForActivity(entry.action).filter === filter,
            ),
            runtime.locale,
            runtime.timezone,
            runtime.localDate,
          ),
    [activity.data, filter, runtime.localDate, runtime.locale, runtime.timezone],
  );

  if (activity.isPending || admin.isPending) return <AdminLoading />;
  if (activity.isError) return <AdminError message={activity.error.message} />;
  if (admin.isError) return <AdminError message={admin.error.message} />;

  const visibleCount = groups.reduce((total, group) => total + group.entries.length, 0);

  return (
    <AdminPage
      backLabel="Back to System health"
      backTo="/admin/system"
      title="Recent activity"
      subtitle="A private record of changes made on this Hearth"
    >
      <section className="activity-privacy" aria-label="Activity privacy">
        <span className="activity-privacy__icon">
          <Icon name="shield" />
        </span>
        <div>
          <strong>Stored only on this Hearth</strong>
          <p>Passwords, provider tokens and private calendar details are never included.</p>
        </div>
      </section>

      <div className="activity-filters" role="group" aria-label="Filter recent activity">
        {activityFilters.map((option, index) => {
          const prior = activityFilters[index - 1] ?? option;
          const next = activityFilters[index + 1] ?? option;
          return (
            <button
              aria-pressed={filter === option.id}
              className="activity-filter focusable"
              data-focus-down={`activity-filter-${option.id}`}
              data-focus-entry={index === 0 ? 'true' : undefined}
              data-focus-id={`activity-filter-${option.id}`}
              data-focus-left={`activity-filter-${prior.id}`}
              data-focus-right={`activity-filter-${next.id}`}
              data-focus-up="admin-back"
              key={option.id}
              onClick={() => setFilter(option.id)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="activity-count" role="status">
        {visibleCount === 0
          ? filter === 'all'
            ? 'No changes recorded yet'
            : `No ${activityFilters.find((option) => option.id === filter)?.label.toLowerCase()} changes`
          : `${visibleCount} recent change${visibleCount === 1 ? '' : 's'}`}
      </div>

      {groups.length === 0 ? (
        <section className="activity-empty">
          <Icon name="refresh" />
          <h2>{filter === 'all' ? 'Nothing has changed yet' : 'No matching activity'}</h2>
          <p>
            {filter === 'all'
              ? 'Household changes will appear here after an adult, television or approved service makes them.'
              : 'Choose another filter to review the rest of the household history.'}
          </p>
        </section>
      ) : (
        <div className="activity-groups">
          {groups.map((group) => (
            <section className="activity-group" key={group.key}>
              <h2>{group.label}</h2>
              <div className="activity-list">
                {group.entries.map((entry) => {
                  const presentation = presentationForActivity(entry.action);
                  return (
                    <article className="activity-row" key={entry.id}>
                      <span
                        className={`activity-row__icon activity-row__icon--${presentation.filter}`}
                      >
                        <Icon name={presentation.icon} />
                      </span>
                      <div className="activity-row__copy">
                        <strong>{presentation.title}</strong>
                        <span>
                          {actorLabel(entry, admin.data)} · {sourceLabel(entry.source)}
                        </span>
                      </div>
                      <div className="activity-row__meta">
                        <time dateTime={entry.occurredAt}>
                          {formatActivityTime(entry.occurredAt, runtime.locale, runtime.timezone)}
                        </time>
                        <span
                          className={`activity-result activity-result--${entry.result}`}
                          aria-label={`Result: ${resultLabel(entry.result)}`}
                        >
                          {resultLabel(entry.result)}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="activity-retention-note">
        Showing the latest {activity.data.entries.length} of up to 50 changes. Recovery copies keep
        the complete audit history with the household database.
      </p>
    </AdminPage>
  );
}

function groupActivity(
  entries: AuditSummary[],
  locale: string,
  timezone: string,
  today: string,
): ActivityGroup[] {
  const groups = new Map<string, ActivityGroup>();
  for (const entry of entries) {
    const key = localDateKey(entry.occurredAt, timezone);
    const existing = groups.get(key);
    if (existing !== undefined) {
      existing.entries.push(entry);
      continue;
    }
    groups.set(key, {
      key,
      label:
        key === today
          ? 'Today'
          : new Intl.DateTimeFormat(locale, {
              timeZone: timezone,
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            }).format(new Date(entry.occurredAt)),
      entries: [entry],
    });
  }
  return [...groups.values()];
}

function localDateKey(timestamp: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function formatActivityTime(timestamp: string, locale: string, timezone: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}
