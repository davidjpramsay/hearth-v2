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
  const pending = mutation.pendingOccurrenceId === occurrence.id;
  const failed = mutation.failedOccurrenceId === occurrence.id;
  const action = completed ? 'undo' : 'complete';
  const activate = () => {
    if (pending || skipped) return;
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
              : completed
                ? `${occurrence.title}, done. Undo`
                : `Complete ${occurrence.title}`
        }
        aria-disabled={pending || skipped}
        className={`chore-row focusable${completed ? ' chore-row--complete' : ''}${skipped ? ' chore-row--skipped' : ''}${pending ? ' chore-row--pending' : ''}`}
        onClick={activate}
        type="button"
        {...focus}
      >
        {showAssignee ? <Avatar member={occurrence.assignee} /> : null}
        <span className="chore-row__copy">
          <strong>{occurrence.title}</strong>
          <span>{occurrence.routineLabel}</span>
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

interface FocusProps {
  'data-focus-id': string;
  'data-focus-up'?: string | undefined;
  'data-focus-down'?: string | undefined;
  'data-focus-left'?: string | undefined;
  'data-focus-right'?: string | undefined;
}
