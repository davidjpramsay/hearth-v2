import { describe, expect, it } from 'vitest';

import type { HouseholdList, ListItem, RewardLedgerEntry } from '@hearth/shared';

import {
  assertNoActiveListDuplicate,
  choreRecurrenceRule,
  choreRepeatFromRule,
  normaliseListItemText,
  PlanningDomainError,
  resolveHouseholdListTarget,
  reverseRewardEntry,
  rewardBalances,
} from './planning.js';

describe('planning domain', () => {
  it('normalises voice-style whitespace and catches only active exact duplicates', () => {
    const milk = item('item_milk', 'Full cream milk', false);
    expect(normaliseListItemText('  FULL   cream milk ')).toBe('full cream milk');
    expect(() => assertNoActiveListDuplicate([milk], 'Full  cream milk')).toThrowError(
      PlanningDomainError,
    );
    expect(() =>
      assertNoActiveListDuplicate([{ ...milk, checked: true }], 'Full cream milk'),
    ).not.toThrow();
  });

  it('resolves an exact voice list target and refuses ambiguous partial names', () => {
    const lists = [list('list_school', 'School packing'), list('list_weekend', 'Weekend packing')];
    expect(resolveHouseholdListTarget(lists, 'school packing list').id).toBe('list_school');
    expect(() => resolveHouseholdListTarget(lists, 'packing')).toThrowError(
      expect.objectContaining({ code: 'AMBIGUOUS_TARGET' }),
    );
  });

  it('computes balances from history and creates a linked reversal', () => {
    const original = ledger('entry_award', 12);
    expect(rewardBalances([original, ledger('entry_spend', -3)]).get('member_ezra')).toBe(9);
    const reversed = reverseRewardEntry(original, {
      entryId: 'entry_reversal',
      auditId: 'audit_reversal',
      actorId: 'member_maya',
      actorType: 'member',
      source: 'companion',
      occurredAt: '2026-08-03T08:00:00+08:00',
    });
    expect(reversed.entry).toMatchObject({ delta: -12, reversalOfEntryId: 'entry_award' });
    expect(reversed.audit).toMatchObject({ action: 'reward.reverse', result: 'reversed' });
  });

  it('round-trips the supported recurring chore patterns', () => {
    expect(choreRecurrenceRule('weekdays', ['MO'])).toBe('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
    expect(choreRepeatFromRule('FREQ=WEEKLY;BYDAY=MO,TH')).toEqual({
      repeat: 'weekly',
      repeatDays: ['MO', 'TH'],
    });
  });
});

function item(id: string, text: string, checked: boolean): ListItem {
  return {
    id,
    text,
    quantity: null,
    checked,
    checkedAt: checked ? '2026-08-03T07:00:00+08:00' : null,
    checkedByActorId: checked ? 'member_maya' : null,
  };
}

function list(id: string, name: string): HouseholdList {
  return {
    id,
    name,
    type: 'packing',
    color: '#718778',
    remainingCount: 0,
    totalCount: 0,
    items: [],
  };
}

function ledger(id: string, delta: number): RewardLedgerEntry {
  return {
    id,
    member: {
      id: 'member_ezra',
      displayName: 'Ezra',
      color: '#1668b7',
      avatarUrl: '/demo/ezra.png',
      role: 'child',
      capabilities: ['household.view'],
    },
    delta,
    reason: 'Demo entry',
    rewardId: null,
    relatedChoreOccurrenceId: null,
    reversalOfEntryId: null,
    occurredAt: '2026-08-03T07:00:00+08:00',
    actorId: 'member_maya',
    source: 'companion',
  };
}
