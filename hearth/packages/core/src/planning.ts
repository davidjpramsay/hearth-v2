import type {
  AuditSummary,
  ChoreRepeat,
  HouseholdList,
  ListItem,
  RewardLedgerEntry,
} from '@hearth/shared';

const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR'] as const;

export class PlanningDomainError extends Error {
  constructor(
    readonly code: 'CONFLICT' | 'DUPLICATE_ITEM' | 'AMBIGUOUS_TARGET' | 'NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'PlanningDomainError';
  }
}

export function resolveHouseholdListTarget(
  lists: readonly HouseholdList[],
  spokenName: string,
): HouseholdList {
  const target = canonicalListName(spokenName);
  const named = lists.map((list) => ({
    list,
    name: canonicalListName(list.name),
  }));
  const exact = named.filter((candidate) => candidate.name === target);
  if (exact.length === 1 && exact[0] !== undefined) return exact[0].list;
  if (exact.length > 1) {
    throw new PlanningDomainError(
      'AMBIGUOUS_TARGET',
      `More than one list is called ${spokenName.trim()}. Please choose one.`,
    );
  }
  const partial = named.filter(
    (candidate) => candidate.name.includes(target) || target.includes(candidate.name),
  );
  if (partial.length === 1 && partial[0] !== undefined) return partial[0].list;
  if (partial.length > 1) {
    throw new PlanningDomainError(
      'AMBIGUOUS_TARGET',
      `${spokenName.trim()} could mean ${partial.map((candidate) => candidate.list.name).join(' or ')}. Please choose one.`,
    );
  }
  throw new PlanningDomainError(
    'NOT_FOUND',
    `I could not find a list called ${spokenName.trim()}.`,
  );
}

function canonicalListName(value: string): string {
  return normaliseListItemText(value)
    .replace(/\blist\b/g, '')
    .replace(/\bgroceries\b/g, 'grocery')
    .trim();
}

export function normaliseListItemText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-AU');
}

export function assertNoActiveListDuplicate(items: readonly ListItem[], candidate: string): void {
  const normalised = normaliseListItemText(candidate);
  if (items.some((item) => !item.checked && normaliseListItemText(item.text) === normalised)) {
    throw new PlanningDomainError(
      'DUPLICATE_ITEM',
      `${candidate.trim()} is already waiting on this list.`,
    );
  }
}

export function rewardBalances(
  entries: readonly Pick<RewardLedgerEntry, 'member' | 'delta'>[],
): Map<string, number> {
  const balances = new Map<string, number>();
  for (const entry of entries) {
    balances.set(entry.member.id, (balances.get(entry.member.id) ?? 0) + entry.delta);
  }
  return balances;
}

export interface RewardReversalContext {
  entryId: string;
  auditId: string;
  actorId: string;
  actorType: AuditSummary['actorType'];
  source: RewardLedgerEntry['source'];
  occurredAt: string;
}

export function reverseRewardEntry(
  original: RewardLedgerEntry,
  context: RewardReversalContext,
): { entry: RewardLedgerEntry; audit: AuditSummary } {
  if (original.reversalOfEntryId !== null) {
    throw new PlanningDomainError('CONFLICT', 'A reversal cannot be reversed again.');
  }
  const entry: RewardLedgerEntry = {
    id: context.entryId,
    member: original.member,
    delta: -original.delta,
    reason: `${original.reason} · reversed`,
    rewardId: original.rewardId,
    relatedChoreOccurrenceId: null,
    reversalOfEntryId: original.id,
    occurredAt: context.occurredAt,
    actorId: context.actorId,
    source: context.source,
  };
  return {
    entry,
    audit: {
      id: context.auditId,
      actorType: context.actorType,
      actorId: context.actorId,
      source: context.source,
      action: 'reward.reverse',
      targetId: original.id,
      occurredAt: context.occurredAt,
      result: 'reversed',
    },
  };
}

export function choreRecurrenceRule(repeat: ChoreRepeat, repeatDays: readonly string[]): string {
  if (repeat === 'daily') return 'FREQ=DAILY';
  const days = repeat === 'weekdays' ? WEEKDAYS : repeatDays;
  if (days.length === 0) {
    throw new PlanningDomainError('CONFLICT', 'Choose at least one day for this chore.');
  }
  return `FREQ=WEEKLY;BYDAY=${days.join(',')}`;
}

export function choreRepeatFromRule(rule: string): {
  repeat: ChoreRepeat;
  repeatDays: string[];
} {
  if (rule === 'FREQ=DAILY') return { repeat: 'daily', repeatDays: [...WEEKDAYS] };
  const days = rule
    .split(';')
    .find((part) => part.startsWith('BYDAY='))
    ?.slice('BYDAY='.length)
    .split(',') ?? ['MO'];
  const weekdays = days.length === 5 && WEEKDAYS.every((day) => days.includes(day));
  return { repeat: weekdays ? 'weekdays' : 'weekly', repeatDays: days };
}
