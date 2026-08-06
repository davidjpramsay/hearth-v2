import type { ChoreList, ChoreOccurrence, PowerSafetyDecision, TodaySummary } from '@hearth/shared';

export interface AutomaticScreenOffContext {
  hearthForeground: boolean;
  occupied: boolean;
  protectedMediaActive: boolean;
}

export class HomeDomainError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'AMBIGUOUS_TARGET',
    message: string,
  ) {
    super(message);
    this.name = 'HomeDomainError';
  }
}

export function evaluateAutomaticScreenOff(
  context: AutomaticScreenOffContext,
): PowerSafetyDecision {
  if (context.protectedMediaActive) {
    return { automaticScreenOffAllowed: false, reason: 'protected-media-active' };
  }
  if (context.occupied) {
    return { automaticScreenOffAllowed: false, reason: 'presence-detected' };
  }
  if (!context.hearthForeground) {
    return { automaticScreenOffAllowed: false, reason: 'hearth-not-foreground' };
  }
  return { automaticScreenOffAllowed: true, reason: 'clear' };
}

export function resolveAssistChore(
  chores: ChoreList,
  memberName: string,
  choreTitle: string,
): ChoreOccurrence {
  const normalizedMember = normalizeSpokenLabel(memberName);
  const normalizedTitle = normalizeSpokenLabel(choreTitle);
  const matches = chores.groups
    .filter((group) => normalizeSpokenLabel(group.member.displayName) === normalizedMember)
    .flatMap((group) => group.occurrences)
    .filter((occurrence) => normalizeSpokenLabel(occurrence.title) === normalizedTitle);

  if (matches.length === 0) {
    throw new HomeDomainError(
      'NOT_FOUND',
      `I couldn’t find ${memberName.trim()}'s ${choreTitle.trim()} chore for that day.`,
    );
  }
  if (matches.length > 1) {
    throw new HomeDomainError(
      'AMBIGUOUS_TARGET',
      `More than one ${choreTitle.trim()} chore matches ${memberName.trim()}.`,
    );
  }
  const match = matches[0];
  if (match === undefined) throw new HomeDomainError('NOT_FOUND', 'That chore was not found.');
  return match;
}

export function buildAssistDaySummary(today: TodaySummary): string {
  const eventCount = today.events.length;
  const pendingChores = today.chores.filter((chore) => chore.state === 'pending').length;
  const firstEvent = today.events[0];
  const eventSummary =
    firstEvent === undefined
      ? 'There are no calendar events.'
      : `The first event is ${firstEvent.title} at ${formatSpokenTime(firstEvent.start)}.`;
  const choreSummary =
    pendingChores === 0
      ? 'There are no chores waiting.'
      : `There ${pendingChores === 1 ? 'is' : 'are'} ${pendingChores} ${pendingChores === 1 ? 'chore' : 'chores'} still to do.`;
  const dinnerSummary =
    today.dinner === null ? 'Dinner is not planned yet.' : `Dinner is ${today.dinner}.`;
  return `Today has ${eventCount} ${eventCount === 1 ? 'event' : 'events'}. ${eventSummary} ${choreSummary} ${dinnerSummary}`;
}

export function normalizeSpokenLabel(value: string): string {
  return value
    .normalize('NFKD')
    .toLocaleLowerCase('en-AU')
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim();
}

function formatSpokenTime(timestamp: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(timestamp);
  if (match === null) return 'an unknown time';
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour < 12 ? 'am' : 'pm';
  const displayHour = hour % 12 || 12;
  return minute === '00' ? `${displayHour} ${suffix}` : `${displayHour}:${minute} ${suffix}`;
}
