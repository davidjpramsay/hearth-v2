import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type {
  ChoreList,
  ChoreOccurrence,
  ChoreOccurrenceChangeResult,
  Member,
} from '@hearth/shared';

import { choresApi as hearthApi } from '../api/chores';
import { createRequestId, HearthApiError } from '../api/core';
import { queryKeys } from '../api/queryKeys';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { InlineError } from '../components/Status';
import { useAdminQuery } from '../hooks/useAdminQueries';
import { useChoreMutation } from '../hooks/useChoreMutation';
import {
  useChoreOccurrenceDetailQuery,
  useChoresForDatesQueries,
  useChoresQuery,
} from '../hooks/useChoreQueries';
import { useHearthRuntime } from '../runtime/context';
import { formatChoreTiming } from '../utils/choreTiming';
import { earlierWeekDates } from '../utils/choreWeek';

type ManagementAction = 'skip' | 'excuse' | 'reassign';

interface ManagementVariables {
  action: ManagementAction;
  occurrence: ChoreOccurrence;
  reason: string;
  assigneeId: string;
  requestId: string;
}

export function ChoreDaySettingsScreen() {
  const runtime = useHearthRuntime();
  const chores = useChoresQuery();
  const admin = useAdminQuery();
  const pastDates = earlierWeekDates(runtime.weekStart, runtime.localDate);
  const pastChores = useChoresForDatesQueries(pastDates);
  const completion = useChoreMutation({ asAdmin: true });
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const mutation = useMutation<ChoreOccurrenceChangeResult, Error, ManagementVariables>({
    mutationFn: ({ action, occurrence, reason, assigneeId, requestId }) => {
      if (action === 'skip') return hearthApi.skipChore(occurrence.id, requestId, reason);
      if (action === 'excuse') return hearthApi.excuseChore(occurrence.id, requestId, reason);
      return hearthApi.reassignChore(occurrence.id, requestId, assigneeId, reason);
    },
    onSuccess: async (result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.chores }),
        queryClient.invalidateQueries({ queryKey: queryKeys.today }),
        queryClient.invalidateQueries({ queryKey: queryKeys.pocketMoneyRoot }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.choreOccurrence(result.occurrence.id),
        }),
      ]);
      const actionMessage =
        variables.action === 'skip'
          ? 'was skipped and still counts in this week’s pocket money.'
          : variables.action === 'excuse'
            ? 'was excused and no longer counts against pocket money.'
            : `now belongs to ${result.occurrence.assignee.displayName}.`;
      setConfirmation(`${result.occurrence.title} ${actionMessage}`);
    },
  });

  if (chores.isPending || admin.isPending) return <AdminLoading />;
  if (chores.isError) return <AdminError message={chores.error.message} />;
  if (admin.isError) return <AdminError message={admin.error.message} />;

  const occurrences = chores.data.groups.flatMap((group) => group.occurrences);
  return (
    <AdminPage
      backLabel="Back to Family planning"
      backTo="/admin/planning"
      title="Chores this week"
    >
      <h2 className="chore-week-heading">Today</h2>
      <div className="chore-management-note">
        <Icon name="shield" />
        <div>
          <strong>Skip or excuse?</strong>
          <p>Skipped jobs remain incomplete. Excused jobs do not reduce pocket money.</p>
        </div>
      </div>
      {confirmation === null ? null : (
        <p className="save-confirmation" role="status">
          {confirmation}
        </p>
      )}
      {mutation.isError ? (
        <div className="admin-feedback admin-feedback--error chore-management-error" role="alert">
          <span>
            {mutation.error instanceof HearthApiError
              ? mutation.error.payload.error.message
              : 'That chore could not be updated.'}
          </span>
          <button
            className="admin-secondary"
            onClick={() => {
              if (mutation.variables !== undefined) mutation.mutate(mutation.variables);
            }}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}
      {occurrences.length === 0 ? (
        <div className="admin-feedback">No chores are due today.</div>
      ) : (
        <div className="chore-management-list">
          {occurrences.map((occurrence, index) => (
            <ChoreOccurrenceManager
              key={occurrence.id}
              members={admin.data.household.members}
              mutation={mutation}
              occurrence={occurrence}
              primary={index === 0}
            />
          ))}
        </div>
      )}
      <PastChoresSection completion={completion} dates={pastDates} queries={pastChores} />
    </AdminPage>
  );
}

function PastChoresSection({
  completion,
  dates,
  queries,
}: {
  completion: ReturnType<typeof useChoreMutation>;
  dates: string[];
  queries: ReturnType<typeof useChoresForDatesQueries>;
}) {
  const loading = queries.some((query) => query.isPending);
  const failed = queries.some((query) => query.isError);
  const days = queries.flatMap((query) =>
    query.data !== undefined && query.data.totalCount > 0 ? [query.data] : [],
  );

  return (
    <section className="chore-week-section" aria-labelledby="earlier-week-heading">
      <header>
        <h2 id="earlier-week-heading">Earlier this week</h2>
        <span>This week only</span>
      </header>
      {loading ? (
        <div className="admin-feedback" role="status">
          Loading earlier chores…
        </div>
      ) : null}
      {failed ? (
        <div className="admin-feedback admin-feedback--error chore-management-error" role="alert">
          <span>Earlier chores couldn’t be loaded.</span>
          <button
            className="admin-secondary"
            onClick={() => {
              for (const query of queries) {
                if (query.isError) void query.refetch();
              }
            }}
            type="button"
          >
            Try again
          </button>
        </div>
      ) : null}
      {!loading && !failed && (dates.length === 0 || days.length === 0) ? (
        <div className="admin-feedback">No earlier chores this week.</div>
      ) : null}
      {days.map((day) => (
        <PastChoreDay completion={completion} day={day} key={day.localDate} />
      ))}
    </section>
  );
}

function PastChoreDay({
  completion,
  day,
}: {
  completion: ReturnType<typeof useChoreMutation>;
  day: ChoreList;
}) {
  const occurrences = day.groups.flatMap((group) => group.occurrences);
  return (
    <section className="past-chore-day" aria-label={day.displayDate}>
      <header>
        <h3>{day.displayDate}</h3>
        <span>
          {day.completedCount} of {day.totalCount} done
        </span>
      </header>
      <div className="past-chore-list">
        {occurrences.map((occurrence) => (
          <PastChoreRow completion={completion} key={occurrence.id} occurrence={occurrence} />
        ))}
      </div>
    </section>
  );
}

function PastChoreRow({
  completion,
  occurrence,
}: {
  completion: ReturnType<typeof useChoreMutation>;
  occurrence: ChoreOccurrence;
}) {
  const completed = occurrence.state === 'completed';
  const changeable = occurrence.state === 'pending' || completed;
  const pending = completion.pendingOccurrenceId === occurrence.id;
  const failed = completion.failedOccurrenceId === occurrence.id;
  const timing = formatChoreTiming(occurrence.availableFromTime, occurrence.dueTime);
  const action = completed ? 'undo' : 'complete';
  const activate = () => {
    if (!changeable || pending) return;
    completion.clearError();
    completion.mutate({ action, occurrence });
  };

  return (
    <div className={`past-chore-row-wrap${failed ? ' past-chore-row-wrap--failed' : ''}`}>
      <div className={`past-chore-row past-chore-row--${occurrence.state}`}>
        <Avatar member={occurrence.assignee} />
        <span className="past-chore-row__copy">
          <strong>{occurrence.title}</strong>
          <small>
            {occurrence.assignee.displayName} · {occurrence.routineLabel}
            {timing === null ? '' : ` · ${timing}`}
          </small>
        </span>
        {changeable ? (
          <button
            aria-label={
              completed
                ? `${occurrence.title}, done. Mark not done`
                : `Mark ${occurrence.title} done`
            }
            aria-pressed={completed}
            className={`past-chore-action${completed ? ' past-chore-action--done' : ''}`}
            disabled={pending}
            onClick={activate}
            type="button"
          >
            <span aria-hidden="true">
              <Icon name="check" />
            </span>
            {pending ? 'Saving…' : completed ? 'Done' : 'Mark done'}
          </button>
        ) : (
          <span className={`chore-management-state chore-management-state--${occurrence.state}`}>
            {stateLabel(occurrence.state)}
          </span>
        )}
      </div>
      {failed && completion.errorMessage !== null ? (
        <InlineError message={completion.errorMessage} onRetry={activate} />
      ) : null}
    </div>
  );
}

function ChoreOccurrenceManager({
  occurrence,
  members,
  mutation,
  primary,
}: {
  occurrence: ChoreOccurrence;
  members: Member[];
  mutation: UseMutationResult<ChoreOccurrenceChangeResult, Error, ManagementVariables>;
  primary: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [assigneeId, setAssigneeId] = useState(occurrence.assignee.id);
  const detail = useChoreOccurrenceDetailQuery(occurrence.id, open);
  const changeable = occurrence.state === 'pending' || occurrence.state === 'skipped';
  const busy = mutation.isPending && mutation.variables?.occurrence.id === occurrence.id;
  const reasonReady = reason.trim().length >= 2;
  const timing = formatChoreTiming(occurrence.availableFromTime, occurrence.dueTime);

  function change(action: ManagementAction) {
    mutation.reset();
    mutation.mutate({
      action,
      occurrence,
      reason: reason.trim(),
      assigneeId,
      requestId: createRequestId(`chore_${action}`),
    });
  }

  return (
    <details
      className={`chore-management-row chore-management-row--${occurrence.state}`}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary data-focus-entry={primary ? 'true' : undefined}>
        <Avatar member={occurrence.assignee} />
        <span className="chore-management-row__copy">
          <strong>{occurrence.title}</strong>
          <small>
            {occurrence.assignee.displayName} · {occurrence.routineLabel}
            {timing === null ? '' : ` · ${timing}`}
          </small>
        </span>
        <span className={`chore-management-state chore-management-state--${occurrence.state}`}>
          {stateLabel(occurrence.state)}
        </span>
        <Icon name="chevron-right" />
      </summary>
      <div className="chore-management-row__body">
        {detail.isPending ? <p className="chore-history-loading">Loading details…</p> : null}
        {detail.isError ? <AdminError message={detail.error.message} /> : null}
        {detail.data?.description === null || detail.data?.description === undefined ? null : (
          <p className="chore-management-description">{detail.data.description}</p>
        )}
        {changeable ? (
          <div className="chore-management-controls">
            <label>
              Reason for the change
              <input
                maxLength={240}
                onChange={(event) => setReason(event.currentTarget.value)}
                placeholder="e.g. school camp or swapped jobs"
                value={reason}
              />
            </label>
            <div className="chore-management-reassign">
              <label>
                Reassign to
                <select
                  onChange={(event) => setAssigneeId(event.currentTarget.value)}
                  value={assigneeId}
                >
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="admin-secondary"
                disabled={!reasonReady || assigneeId === occurrence.assignee.id || busy}
                onClick={() => change('reassign')}
                type="button"
              >
                Reassign
              </button>
            </div>
            <div className="chore-management-actions">
              {occurrence.state === 'pending' ? (
                <button
                  className="admin-secondary"
                  disabled={!reasonReady || busy}
                  onClick={() => change('skip')}
                  type="button"
                >
                  Skip today
                </button>
              ) : null}
              <button
                className="admin-secondary chore-management-excuse"
                disabled={!reasonReady || busy}
                onClick={() => change('excuse')}
                type="button"
              >
                Excuse this job
              </button>
            </div>
          </div>
        ) : (
          <p className="chore-management-locked">
            {occurrence.state === 'completed'
              ? 'Undo the completion from Chores before changing this job.'
              : 'This job is no longer awaiting an adult decision.'}
          </p>
        )}
        <section className="chore-history" aria-label={`History for ${occurrence.title}`}>
          <h3>History</h3>
          {detail.data?.history.length === 0 ? (
            <p>No changes.</p>
          ) : (
            <ol>
              {detail.data?.history.map((entry) => (
                <li key={entry.id}>
                  <span className="chore-history__marker" aria-hidden="true" />
                  <div>
                    <strong>{entry.label}</strong>
                    <span>
                      {entry.actorLabel} · {formatHistoryTime(entry.occurredAt)}
                    </span>
                    {entry.reason === null ? null : <p>{entry.reason}</p>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </details>
  );
}

function stateLabel(state: ChoreOccurrence['state']): string {
  if (state === 'completed') return 'Done';
  if (state === 'skipped') return 'Skipped';
  if (state === 'excused') return 'Excused';
  if (state === 'cancelled') return 'Cancelled';
  return 'Waiting';
}

function formatHistoryTime(timestamp: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Australia/Perth',
  }).format(new Date(timestamp));
}
