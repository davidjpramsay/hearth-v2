import { useEffect, useRef, useState, type FormEvent } from 'react';

import './RemindersScreen.css';

import type { HearthReminder } from '@hearth/shared';

import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState, FailureState, LoadingState, StatusBanner } from '../components/Status';
import {
  useCreateReminder,
  useDeleteReminder,
  useRemindersQuery,
  useSetReminderCompletion,
  useUpdateReminder,
} from '../hooks/useReminderQueries';
import { useHearthRuntime } from '../runtime/context';

type ReminderFilter = 'open' | 'all';

export function RemindersScreen({ preparing }: { preparing: boolean }) {
  const [filter, setFilter] = useState<ReminderFilter>('open');
  const [title, setTitle] = useState('');
  const [dueLocalDate, setDueLocalDate] = useState('');
  const query = useRemindersQuery(filter === 'all', !preparing);
  const createReminder = useCreateReminder();
  const updateReminder = useUpdateReminder();
  const completion = useSetReminderCompletion();
  const deleteReminder = useDeleteReminder();
  const runtime = useHearthRuntime();

  if (preparing || query.isPending) return <LoadingState />;
  if (query.data === undefined) return <FailureState onRetry={() => void query.refetch()} />;

  const overview = query.data;
  const visibleLists = overview.lists.filter((list) =>
    overview.reminders.some((reminder) => reminder.listId === list.id),
  );
  const visibleReminderIds = overview.reminders.map((reminder) => reminder.id);
  const firstReminderFocusId =
    visibleReminderIds[0] === undefined
      ? 'reminder-create-title'
      : reminderFocusId(visibleReminderIds[0]);
  const openCount = overview.lists.reduce((total, list) => total + list.incompleteCount, 0);
  const commandError =
    createReminder.error ?? updateReminder.error ?? completion.error ?? deleteReminder.error;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (cleanTitle.length === 0) return;
    createReminder.mutate(
      { title: cleanTitle, dueLocalDate: dueLocalDate.length === 0 ? null : dueLocalDate },
      {
        onSuccess: () => {
          setTitle('');
          setDueLocalDate('');
        },
      },
    );
  }

  return (
    <div className="screen reminders-screen">
      <ScreenHeader
        title="Reminders"
        meta={`${openCount} open`}
        actions={
          <div aria-label="Reminder filter" className="reminders-filter" role="group">
            <button
              aria-pressed={filter === 'open'}
              className="focusable"
              data-focus-id="reminders-filter-open"
              data-focus-left="nav-reminders"
              data-focus-right="reminders-filter-all"
              data-focus-down="reminder-create-title"
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
              data-focus-down="reminder-create-submit"
              onClick={() => setFilter('all')}
              type="button"
            >
              All
            </button>
          </div>
        }
      />

      <form className="reminder-create" onSubmit={submit}>
        <label>
          <span>Reminder</span>
          <input
            autoComplete="off"
            className="focusable"
            data-focus-entry="true"
            data-focus-id="reminder-create-title"
            data-focus-left="nav-reminders"
            data-focus-right="reminder-create-date"
            data-focus-up="reminders-filter-open"
            data-focus-down={firstReminderFocusId}
            maxLength={240}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Add a reminder"
            value={title}
          />
        </label>
        <label>
          <span>Due date</span>
          <input
            className="focusable"
            data-focus-id="reminder-create-date"
            data-focus-left="reminder-create-title"
            data-focus-right="reminder-create-submit"
            data-focus-up="reminders-filter-open"
            data-focus-down={firstReminderFocusId}
            onChange={(event) => setDueLocalDate(event.target.value)}
            type="date"
            value={dueLocalDate}
          />
        </label>
        <button
          className="admin-primary focusable"
          data-focus-id="reminder-create-submit"
          data-focus-left="reminder-create-date"
          data-focus-right="reminder-create-submit"
          data-focus-up="reminders-filter-all"
          data-focus-down={firstReminderFocusId}
          disabled={createReminder.isPending || title.trim().length === 0}
          type="submit"
        >
          {createReminder.isPending ? 'Adding…' : 'Add'}
        </button>
      </form>

      {commandError === null ? null : (
        <StatusBanner kind="unavailable">{commandError.message}</StatusBanner>
      )}

      {visibleLists.length === 0 ? (
        <EmptyState
          title={filter === 'open' ? 'No open reminders' : 'No reminders'}
          description={filter === 'open' ? 'Everything is done.' : 'Add your first reminder above.'}
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
                  {reminders.map((reminder) => {
                    const reminderIndex = visibleReminderIds.indexOf(reminder.id);
                    const previousReminderId = visibleReminderIds[reminderIndex - 1];
                    const nextReminderId = visibleReminderIds[reminderIndex + 1];
                    return (
                      <ReminderRow
                        busy={
                          updateReminder.isPending ||
                          completion.isPending ||
                          deleteReminder.isPending
                        }
                        key={reminder.id}
                        locale={runtime.locale}
                        localDate={runtime.localDate}
                        nextFocusId={
                          nextReminderId === undefined
                            ? reminderFocusId(reminder.id)
                            : reminderFocusId(nextReminderId)
                        }
                        onDelete={() => deleteReminder.mutate(reminder.id)}
                        onSave={(details) =>
                          updateReminder.mutate({ reminderId: reminder.id, ...details })
                        }
                        onToggle={() =>
                          completion.mutate({
                            reminderId: reminder.id,
                            isCompleted: !reminder.isCompleted,
                          })
                        }
                        previousFocusId={
                          previousReminderId === undefined
                            ? 'reminder-create-title'
                            : reminderFocusId(previousReminderId)
                        }
                        reminder={reminder}
                        timezone={runtime.household?.timezone ?? 'Australia/Perth'}
                      />
                    );
                  })}
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
  busy,
  onToggle,
  onSave,
  onDelete,
  previousFocusId,
  nextFocusId,
}: {
  reminder: HearthReminder;
  localDate: string;
  locale: string;
  timezone: string;
  busy: boolean;
  onToggle: () => void;
  onSave: (details: { title: string; dueLocalDate: string | null }) => void;
  onDelete: () => void;
  previousFocusId: string;
  nextFocusId: string;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [title, setTitle] = useState(reminder.title);
  const [dueLocalDate, setDueLocalDate] = useState(reminder.dueLocalDate ?? '');
  const editTitleRef = useRef<HTMLInputElement>(null);
  const removeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (editing) editTitleRef.current?.focus();
    else if (confirmingDelete) removeButtonRef.current?.focus();
  }, [confirmingDelete, editing]);

  if (editing) {
    return (
      <form
        className="reminder-row reminder-row--editing"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim().length === 0) return;
          onSave({ title: title.trim(), dueLocalDate: dueLocalDate || null });
          setEditing(false);
        }}
      >
        <input
          aria-label="Reminder title"
          className="focusable"
          data-focus-id={`${reminderFocusId(reminder.id)}-edit-title`}
          data-focus-left="nav-reminders"
          data-focus-right={`${reminderFocusId(reminder.id)}-edit-date`}
          data-focus-up={previousFocusId}
          data-focus-down={nextFocusId}
          maxLength={240}
          onChange={(event) => setTitle(event.target.value)}
          ref={editTitleRef}
          value={title}
        />
        <input
          aria-label="Due date"
          className="focusable"
          data-focus-id={`${reminderFocusId(reminder.id)}-edit-date`}
          data-focus-left={`${reminderFocusId(reminder.id)}-edit-title`}
          data-focus-right={`${reminderFocusId(reminder.id)}-edit-save`}
          data-focus-up={previousFocusId}
          data-focus-down={nextFocusId}
          onChange={(event) => setDueLocalDate(event.target.value)}
          type="date"
          value={dueLocalDate}
        />
        <div className="reminder-row__actions">
          <button
            className="admin-primary focusable"
            data-focus-id={`${reminderFocusId(reminder.id)}-edit-save`}
            data-focus-left={`${reminderFocusId(reminder.id)}-edit-date`}
            data-focus-right={`${reminderFocusId(reminder.id)}-edit-cancel`}
            data-focus-up={previousFocusId}
            data-focus-down={nextFocusId}
            disabled={busy || title.trim().length === 0}
            type="submit"
          >
            Save
          </button>
          <button
            className="admin-secondary focusable"
            data-focus-id={`${reminderFocusId(reminder.id)}-edit-cancel`}
            data-focus-left={`${reminderFocusId(reminder.id)}-edit-save`}
            data-focus-right={`${reminderFocusId(reminder.id)}-edit-cancel`}
            data-focus-up={previousFocusId}
            data-focus-down={nextFocusId}
            onClick={() => setEditing(false)}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <article className={`reminder-row${reminder.isCompleted ? ' reminder-row--completed' : ''}`}>
      <button
        aria-label={
          reminder.isCompleted ? `Reopen ${reminder.title}` : `Complete ${reminder.title}`
        }
        className="reminder-row__state focusable"
        data-focus-id={reminderFocusId(reminder.id)}
        data-focus-left="nav-reminders"
        data-focus-right={`${reminderFocusId(reminder.id)}-edit`}
        data-focus-up={previousFocusId}
        data-focus-down={nextFocusId}
        disabled={busy}
        onClick={onToggle}
        type="button"
      >
        {reminder.isCompleted ? <Icon name="check" /> : null}
      </button>
      <div className="reminder-row__content">
        <h3>{reminder.title}</h3>
        <p>{formatDue(reminder, localDate, locale, timezone)}</p>
      </div>
      <div className="reminder-row__actions">
        {confirmingDelete ? (
          <>
            <button
              className="admin-danger focusable"
              data-focus-id={`${reminderFocusId(reminder.id)}-remove`}
              data-focus-left={reminderFocusId(reminder.id)}
              data-focus-right={`${reminderFocusId(reminder.id)}-keep`}
              data-focus-up={previousFocusId}
              data-focus-down={nextFocusId}
              disabled={busy}
              onClick={onDelete}
              ref={removeButtonRef}
              type="button"
            >
              Remove
            </button>
            <button
              className="admin-secondary focusable"
              data-focus-id={`${reminderFocusId(reminder.id)}-keep`}
              data-focus-left={`${reminderFocusId(reminder.id)}-remove`}
              data-focus-right={`${reminderFocusId(reminder.id)}-keep`}
              data-focus-up={previousFocusId}
              data-focus-down={nextFocusId}
              onClick={() => setConfirmingDelete(false)}
              type="button"
            >
              Keep
            </button>
          </>
        ) : (
          <>
            <button
              className="admin-secondary focusable"
              data-focus-id={`${reminderFocusId(reminder.id)}-edit`}
              data-focus-left={reminderFocusId(reminder.id)}
              data-focus-right={`${reminderFocusId(reminder.id)}-delete`}
              data-focus-up={previousFocusId}
              data-focus-down={nextFocusId}
              onClick={() => setEditing(true)}
              type="button"
            >
              Edit
            </button>
            <button
              className="admin-secondary focusable"
              data-focus-id={`${reminderFocusId(reminder.id)}-delete`}
              data-focus-left={`${reminderFocusId(reminder.id)}-edit`}
              data-focus-right={`${reminderFocusId(reminder.id)}-delete`}
              data-focus-up={previousFocusId}
              data-focus-down={nextFocusId}
              onClick={() => setConfirmingDelete(true)}
              type="button"
            >
              Delete
            </button>
          </>
        )}
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

function reminderFocusId(reminderId: string): string {
  return `reminder-${reminderId}-toggle`;
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
