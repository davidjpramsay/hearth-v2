import type { ChoreOccurrence } from '@hearth/shared';

import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { InlineError } from './Status';

export interface ChoreMutationView {
  mutate: (variables: { action: 'complete' | 'undo'; occurrence: ChoreOccurrence }) => void;
  pendingOccurrenceId: string | null;
  failedOccurrenceId: string | null;
  errorMessage: string | null;
  clearError: () => void;
}

export function ChoreRow({
  occurrence,
  mutation,
  focus,
  showAssignee = true,
}: {
  occurrence: ChoreOccurrence;
  mutation: ChoreMutationView;
  focus: FocusProps;
  showAssignee?: boolean;
}) {
  const completed = occurrence.state === 'completed';
  const skipped = occurrence.state === 'skipped';
  const excused = occurrence.state === 'excused';
  const cancelled = occurrence.state === 'cancelled';
  const unavailable = skipped || excused || cancelled;
  const pending = mutation.pendingOccurrenceId === occurrence.id;
  const failed = mutation.failedOccurrenceId === occurrence.id;
  const action = completed ? 'undo' : 'complete';
  const activate = () => {
    if (pending || unavailable) return;
    mutation.clearError();
    mutation.mutate({ action, occurrence });
  };
  return (
    <div className={`chore-row-wrap${failed ? ' chore-row-wrap--failed' : ''}`}>
      <button
        aria-label={
          occurrence.locked
            ? `${occurrence.title}, ask an adult to change this`
            : skipped
              ? `${occurrence.title}, skipped`
              : excused
                ? `${occurrence.title}, excused`
                : cancelled
                  ? `${occurrence.title}, cancelled`
                  : completed
                    ? `${occurrence.title}, done. Undo`
                    : `Complete ${occurrence.title}`
        }
        aria-disabled={pending || unavailable}
        className={`chore-row focusable${completed ? ' chore-row--complete' : ''}${skipped ? ' chore-row--skipped' : ''}${excused ? ' chore-row--excused' : ''}${cancelled ? ' chore-row--cancelled' : ''}${pending ? ' chore-row--pending' : ''}`}
        onClick={activate}
        type="button"
        {...focus}
      >
        {showAssignee ? <Avatar member={occurrence.assignee} /> : null}
        <span className="chore-row__copy">
          <strong>{occurrence.title}</strong>
          <span>
            {occurrence.routineLabel}
            {occurrence.dueTime === null ? '' : ` · Due ${formatDueTime(occurrence.dueTime)}`}
          </span>
        </span>
        <span className="chore-row__action">
          <span className="chore-check">
            <Icon name="check" />
          </span>
          <span>
            {pending
              ? 'Saving…'
              : occurrence.locked
                ? 'Ask an adult'
                : skipped
                  ? 'Skipped'
                  : excused
                    ? 'Excused'
                    : cancelled
                      ? 'Cancelled'
                      : completed
                        ? 'Done — Undo'
                        : 'Mark done'}
          </span>
        </span>
      </button>
      {failed && mutation.errorMessage !== null ? (
        <InlineError message={mutation.errorMessage} onRetry={activate} />
      ) : null}
    </div>
  );
}

function formatDueTime(localTime: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`2000-01-01T${localTime}:00.000Z`));
}

interface FocusProps {
  'data-focus-id': string;
  'data-focus-entry'?: 'true' | undefined;
  'data-focus-up'?: string | undefined;
  'data-focus-down'?: string | undefined;
  'data-focus-left'?: string | undefined;
  'data-focus-right'?: string | undefined;
}
