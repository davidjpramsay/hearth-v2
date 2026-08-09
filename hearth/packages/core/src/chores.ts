import type { AuditSummary, ChoreOccurrence, Member } from '@hearth/shared';

export interface ChoreCommandContext {
  actorId: string;
  actorType: AuditSummary['actorType'];
  source: AuditSummary['source'];
  requestId: string;
  occurredAt: string;
  completionId: string;
  auditId: string;
}

export class ChoreDomainError extends Error {
  constructor(
    readonly code: 'CONFLICT' | 'FORBIDDEN',
    message: string,
  ) {
    super(message);
    this.name = 'ChoreDomainError';
  }
}

export function completeChore(
  occurrence: ChoreOccurrence,
  context: ChoreCommandContext,
): { occurrence: ChoreOccurrence; audit: AuditSummary } {
  if (occurrence.locked) {
    throw new ChoreDomainError('FORBIDDEN', 'Ask an adult to change this.');
  }
  if (occurrence.state !== 'pending') {
    throw new ChoreDomainError('CONFLICT', 'This chore is no longer waiting to be done.');
  }

  return {
    occurrence: {
      ...occurrence,
      state: 'completed',
      completionId: context.completionId,
      completedAt: context.occurredAt,
      completedLabel: formatPerthTime(context.occurredAt),
    },
    audit: createAudit(context, occurrence.id, 'chore.complete', 'succeeded'),
  };
}

export function undoChore(
  occurrence: ChoreOccurrence,
  expectedCompletionId: string,
  context: ChoreCommandContext,
): { occurrence: ChoreOccurrence; audit: AuditSummary } {
  if (occurrence.locked) {
    throw new ChoreDomainError('FORBIDDEN', 'Ask an adult to change this.');
  }
  if (
    occurrence.state !== 'completed' ||
    occurrence.completionId === null ||
    occurrence.completionId !== expectedCompletionId
  ) {
    throw new ChoreDomainError('CONFLICT', 'This completion can no longer be undone.');
  }

  return {
    occurrence: {
      ...occurrence,
      state: 'pending',
      completionId: null,
      completedAt: null,
      completedLabel: null,
    },
    audit: createAudit(context, occurrence.id, 'chore.undo', 'reversed'),
  };
}

export function skipChore(
  occurrence: ChoreOccurrence,
  reason: string,
  context: ChoreCommandContext,
): { occurrence: ChoreOccurrence; audit: AuditSummary } {
  assertReason(reason);
  if (occurrence.locked) {
    throw new ChoreDomainError('FORBIDDEN', 'Ask an adult to change this.');
  }
  if (occurrence.state !== 'pending') {
    throw new ChoreDomainError('CONFLICT', 'This chore can no longer be skipped.');
  }

  return {
    occurrence: {
      ...occurrence,
      state: 'skipped',
      completionId: null,
      completedAt: null,
      completedLabel: null,
    },
    audit: createAudit(context, occurrence.id, 'chore.skip', 'succeeded'),
  };
}

export function excuseChore(
  occurrence: ChoreOccurrence,
  reason: string,
  context: ChoreCommandContext,
): { occurrence: ChoreOccurrence; audit: AuditSummary } {
  assertReason(reason);
  if (occurrence.locked) {
    throw new ChoreDomainError('FORBIDDEN', 'Ask an adult to change this.');
  }
  if (occurrence.state !== 'pending' && occurrence.state !== 'skipped') {
    throw new ChoreDomainError('CONFLICT', 'This chore can no longer be excused.');
  }

  return {
    occurrence: {
      ...occurrence,
      state: 'excused',
      completionId: null,
      completedAt: null,
      completedLabel: null,
    },
    audit: createAudit(context, occurrence.id, 'chore.excuse', 'succeeded'),
  };
}

export function reassignChore(
  occurrence: ChoreOccurrence,
  assignee: Member,
  reason: string,
  context: ChoreCommandContext,
): { occurrence: ChoreOccurrence; audit: AuditSummary } {
  assertReason(reason);
  if (occurrence.locked) {
    throw new ChoreDomainError('FORBIDDEN', 'Ask an adult to change this.');
  }
  if (occurrence.state !== 'pending' && occurrence.state !== 'skipped') {
    throw new ChoreDomainError('CONFLICT', 'This chore can no longer be reassigned.');
  }
  if (occurrence.assignee.id === assignee.id) {
    throw new ChoreDomainError('CONFLICT', `${assignee.displayName} already has this chore.`);
  }

  return {
    occurrence: {
      ...occurrence,
      assignee,
      state: 'pending',
      completionId: null,
      completedAt: null,
      completedLabel: null,
    },
    audit: createAudit(context, occurrence.id, 'chore.reassign', 'succeeded'),
  };
}

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

export function isChoreDueOnDate(
  recurrenceRule: string,
  localDate: string,
  activeFrom: string,
  activeUntil: string | null,
): boolean {
  if (localDate < activeFrom || (activeUntil !== null && localDate > activeUntil)) return false;
  const fields = new Map(
    recurrenceRule.split(';').map((entry) => {
      const [key = '', value = ''] = entry.split('=', 2);
      return [key.toUpperCase(), value.toUpperCase()] as const;
    }),
  );
  const frequency = fields.get('FREQ');
  if (frequency === 'ONCE') return localDate === activeFrom;
  if (frequency === 'DAILY') return true;
  if (frequency !== 'WEEKLY') return false;
  const date = new Date(`${localDate}T12:00:00Z`);
  const weekday = WEEKDAYS[date.getUTCDay()];
  return weekday !== undefined && (fields.get('BYDAY') ?? '').split(',').includes(weekday);
}

export function sortByStart<T extends { start: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) => left.start.localeCompare(right.start));
}

function createAudit(
  context: ChoreCommandContext,
  targetId: string,
  action: AuditSummary['action'],
  result: AuditSummary['result'],
): AuditSummary {
  return {
    id: context.auditId,
    actorType: context.actorType,
    actorId: context.actorId,
    source: context.source,
    action,
    targetId,
    occurredAt: context.occurredAt,
    result,
  };
}

function assertReason(reason: string): void {
  if (reason.trim().length < 2) {
    throw new ChoreDomainError('CONFLICT', 'Add a short reason for this change.');
  }
}

function formatPerthTime(timestamp: string): string {
  const formatted = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Perth',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
  return `Done ${formatted}`;
}
