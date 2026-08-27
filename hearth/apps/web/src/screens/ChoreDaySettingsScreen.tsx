import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { ChoreOccurrence, ChoreOccurrenceChangeResult, Member } from '@hearth/shared';

import { choresApi as hearthApi } from '../api/chores';
import { createRequestId, HearthApiError } from '../api/core';
import { queryKeys } from '../api/queryKeys';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { useAdminQuery } from '../hooks/useAdminQueries';
import { useChoreOccurrenceDetailQuery, useChoresQuery } from '../hooks/useChoreQueries';
import { formatChoreTiming } from '../utils/choreTiming';

type ManagementAction = 'skip' | 'excuse' | 'reassign';

interface ManagementVariables {
  action: ManagementAction;
  occurrence: ChoreOccurrence;
  reason: string;
  assigneeId: string;
  requestId: string;
}

export function ChoreDaySettingsScreen() {
  const chores = useChoresQuery();
  const admin = useAdminQuery();
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
      title="Today’s chores"
      subtitle={chores.data.displayDate}
    >
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
    </AdminPage>
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
