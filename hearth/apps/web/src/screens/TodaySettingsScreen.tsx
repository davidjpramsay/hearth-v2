import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { HouseholdNotice, TodayConfiguration, TodaySectionVisibility } from '@hearth/shared';

import { createRequestId, getHearthRuntime } from '../api/core';
import { queryKeys } from '../api/queryKeys';
import { todayApi as hearthApi } from '../api/today';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Icon } from '../components/Icon';
import { TodayConfigurationPreview } from '../components/TodayConfigurationPreview';
import { createTodayPreviewData } from '../components/todayPreviewData';
import { useTodayConfigurationQuery, useTodayQuery } from '../hooks/useTodayQueries';

const sectionOptions: Array<{
  key: keyof TodaySectionVisibility;
  title: string;
  description: string;
}> = [
  { key: 'dinner', title: 'Dinner', description: 'Tonight’s meal from the family plan' },
  { key: 'listSummary', title: 'List summary', description: 'Items left on the main list' },
  { key: 'notice', title: 'Notice', description: 'The highest-priority active notice' },
  {
    key: 'dailyVerse',
    title: 'Daily Bible verse',
    description: 'One ESV passage selected for the household’s local day',
  },
  {
    key: 'photo',
    title: 'Family photo',
    description: 'A substantial photo from the private Hearth collection',
  },
];

export function TodaySettingsScreen() {
  const query = useTodayConfigurationQuery();
  const todayQuery = useTodayQuery();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'standard' | 'important'>('standard');
  const [expiry, setExpiry] = useState<'day' | 'tomorrow' | 'week' | 'none'>('tomorrow');
  const [editing, setEditing] = useState<HouseholdNotice | null>(null);
  const configuration = query.data;

  const saveSections = useMutation({
    scope: { id: 'today-section-visibility' },
    mutationFn: (sections: TodaySectionVisibility) =>
      hearthApi.updateTodaySections(sections, createRequestId('today_sections')),
    onMutate: async (sections) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.todayConfiguration });
      const previous = queryClient.getQueryData<TodayConfiguration>(queryKeys.todayConfiguration);
      if (previous !== undefined) {
        queryClient.setQueryData<TodayConfiguration>(queryKeys.todayConfiguration, {
          ...previous,
          sections,
        });
      }
      return { previous };
    },
    onError: (_error, _sections, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKeys.todayConfiguration, context.previous);
      }
    },
    onSuccess: async (result) => {
      queryClient.setQueryData(queryKeys.todayConfiguration, result.configuration);
      await queryClient.invalidateQueries({ queryKey: queryKeys.today });
    },
  });
  const saveNotice = useMutation({
    mutationFn: async () => {
      const runtime = getHearthRuntime();
      const startsAt = editing?.startsAt ?? runtime.generatedAt;
      const input = {
        requestId: createRequestId(editing === null ? 'notice_create' : 'notice_update'),
        message: message.trim(),
        priority,
        startsAt,
        expiresAt: expiryTimestamp(startsAt, expiry),
      };
      return editing === null
        ? hearthApi.createNotice(input)
        : hearthApi.updateNotice(editing.id, input);
    },
    onSuccess: async (result) => {
      queryClient.setQueryData(queryKeys.todayConfiguration, result.configuration);
      setMessage('');
      setPriority('standard');
      setExpiry('tomorrow');
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.today });
    },
  });
  const archiveNotice = useMutation({
    mutationFn: (noticeId: string) =>
      hearthApi.archiveNotice(noticeId, createRequestId('notice_archive')),
    onSuccess: async (result) => {
      queryClient.setQueryData(queryKeys.todayConfiguration, result.configuration);
      await queryClient.invalidateQueries({ queryKey: queryKeys.today });
    },
  });

  const sortedNotices = useMemo(
    () => configuration?.notices.toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)) ?? [],
    [configuration?.notices],
  );
  const activeNotice =
    configuration?.notices.find((notice) => notice.id === configuration.activeNoticeId)?.message ??
    null;
  const previewData = createTodayPreviewData(todayQuery.data, activeNotice);

  function toggleSection(key: keyof TodaySectionVisibility) {
    const latest =
      queryClient.getQueryData<TodayConfiguration>(queryKeys.todayConfiguration) ?? configuration;
    if (latest === undefined) return;
    saveSections.mutate({
      ...latest.sections,
      [key]: !latest.sections[key],
    });
  }

  if (query.isPending) return <AdminLoading />;
  if (query.isError || configuration === undefined)
    return <AdminError message={query.error?.message ?? 'Today settings could not be loaded.'} />;

  const error = saveSections.error ?? saveNotice.error ?? archiveNotice.error;
  return (
    <AdminPage
      title="Today & notices"
      subtitle="Choose the useful details your family sees at a glance"
    >
      <section className="today-admin-section">
        <div className="today-admin-section__heading">
          <div>
            <p className="admin-kicker">Today overview</p>
            <h2>Show what matters</h2>
          </div>
          <span>{Object.values(configuration.sections).filter(Boolean).length} shown</span>
        </div>
        <div className="today-section-switches">
          {sectionOptions.map((option) => {
            const enabled = configuration.sections[option.key];
            return (
              <button
                aria-checked={enabled}
                className="today-section-switch focusable"
                data-focus-entry={option.key === 'dinner' ? 'true' : undefined}
                data-focus-id={`today-setting-${option.key}`}
                key={option.key}
                onClick={() => toggleSection(option.key)}
                role="switch"
                type="button"
              >
                <span>
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>
                <span className="settings-toggle" aria-hidden="true">
                  <span />
                </span>
              </button>
            );
          })}
        </div>
        <TodayConfigurationPreview
          data={previewData}
          sections={configuration.sections}
          status={
            todayQuery.data !== undefined
              ? 'ready'
              : todayQuery.isPending
                ? 'loading'
                : 'unavailable'
          }
        />
      </section>

      <section className="today-admin-section">
        <div className="today-admin-section__heading">
          <div>
            <p className="admin-kicker">Household notices</p>
            <h2>{editing === null ? 'Create a notice' : 'Edit notice'}</h2>
          </div>
          <Icon name="today" />
        </div>
        <form
          className="notice-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (message.trim().length > 0) saveNotice.mutate();
          }}
        >
          <label>
            Message
            <textarea
              maxLength={240}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="What should everyone know?"
              required
              rows={3}
              value={message}
            />
            <small>{message.length}/240</small>
          </label>
          <div className="notice-form__options">
            <label>
              Priority
              <select
                onChange={(event) => setPriority(event.target.value as 'standard' | 'important')}
                value={priority}
              >
                <option value="standard">Standard</option>
                <option value="important">Important · show first</option>
              </select>
            </label>
            <label>
              Keep visible
              <select
                onChange={(event) =>
                  setExpiry(event.target.value as 'day' | 'tomorrow' | 'week' | 'none')
                }
                value={expiry}
              >
                <option value="day">For 8 hours</option>
                <option value="tomorrow">Until tomorrow</option>
                <option value="week">For one week</option>
                <option value="none">Until an adult removes it</option>
              </select>
            </label>
          </div>
          <div className="notice-form__actions">
            {editing === null ? null : (
              <button
                className="button button--quiet"
                onClick={() => {
                  setEditing(null);
                  setMessage('');
                  setPriority('standard');
                  setExpiry('tomorrow');
                }}
                type="button"
              >
                Cancel
              </button>
            )}
            <button
              className="button button--primary"
              disabled={saveNotice.isPending}
              type="submit"
            >
              {saveNotice.isPending
                ? 'Saving…'
                : editing === null
                  ? 'Publish notice'
                  : 'Save notice'}
            </button>
          </div>
        </form>
      </section>

      <section className="today-admin-section">
        <div className="today-admin-section__heading">
          <div>
            <p className="admin-kicker">Notice queue</p>
            <h2>Current and scheduled</h2>
          </div>
          <span>{sortedNotices.length}</span>
        </div>
        {sortedNotices.length === 0 ? (
          <p className="notice-empty">No notices yet. Today will simply omit the notice text.</p>
        ) : (
          <div className="notice-list">
            {sortedNotices.map((notice) => (
              <article
                className={`notice-card${notice.id === configuration.activeNoticeId ? ' notice-card--active' : ''}`}
                key={notice.id}
              >
                <div>
                  <span className={`notice-priority notice-priority--${notice.priority}`}>
                    {notice.priority === 'important' ? 'Important' : 'Standard'}
                  </span>
                  {notice.id === configuration.activeNoticeId ? (
                    <span>Showing on Today</span>
                  ) : null}
                  <p>{notice.message}</p>
                  <small>{noticeWindowLabel(notice)}</small>
                </div>
                <div className="notice-card__actions">
                  <button
                    className="button button--quiet"
                    onClick={() => {
                      setEditing(notice);
                      setMessage(notice.message);
                      setPriority(notice.priority);
                      setExpiry(notice.expiresAt === null ? 'none' : 'tomorrow');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    className="button button--danger"
                    disabled={archiveNotice.isPending}
                    onClick={() => archiveNotice.mutate(notice.id)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {error === null ? null : (
        <p className="admin-inline-error" role="alert">
          {error.message}
        </p>
      )}
    </AdminPage>
  );
}

function expiryTimestamp(
  startsAt: string,
  expiry: 'day' | 'tomorrow' | 'week' | 'none',
): string | null {
  if (expiry === 'none') return null;
  const hours = expiry === 'day' ? 8 : expiry === 'tomorrow' ? 24 : 24 * 7;
  return new Date(Date.parse(startsAt) + hours * 60 * 60 * 1000).toISOString();
}

function noticeWindowLabel(notice: HouseholdNotice): string {
  if (notice.expiresAt === null) return 'Stays visible until removed';
  return `Ends ${new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(notice.expiresAt))}`;
}
