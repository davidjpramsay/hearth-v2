import { describe, expect, it } from 'vitest';

import type { ChoreOccurrence, Member } from '@hearth/shared';

import {
  ChoreDomainError,
  completeChore,
  isChoreDueOnDate,
  skipChore,
  sortByStart,
  undoChore,
} from './chores.js';

const ezra: Member = {
  id: 'member_ezra',
  displayName: 'Ezra',
  color: '#1668b7',
  avatarUrl: '/demo/ezra.png',
  role: 'child',
  capabilities: ['household.view', 'chores.complete'],
};

const pending: ChoreOccurrence = {
  id: 'occurrence_school_bag',
  title: 'Pack school bag',
  assignee: ezra,
  routineLabel: 'Morning',
  localDate: '2026-08-03',
  state: 'pending',
  completionId: null,
  completedAt: null,
  completedLabel: null,
  locked: false,
};

const context = {
  actorId: 'device_demo_tv',
  actorType: 'device' as const,
  source: 'tv' as const,
  requestId: 'request_complete_001',
  occurredAt: '2026-08-02T23:42:00.000Z',
  completionId: 'completion_001',
  auditId: 'audit_001',
};

describe('chore commands', () => {
  it('completes and reverses one occurrence without rewriting identity', () => {
    const completed = completeChore(pending, context);
    expect(completed.occurrence).toMatchObject({
      id: pending.id,
      state: 'completed',
      completionId: 'completion_001',
      completedLabel: 'Done 07:42',
    });
    expect(completed.audit.action).toBe('chore.complete');

    const undone = undoChore(completed.occurrence, 'completion_001', {
      ...context,
      requestId: 'request_undo_001',
      auditId: 'audit_002',
    });
    expect(undone.occurrence).toEqual(pending);
    expect(undone.audit.result).toBe('reversed');
  });

  it('rejects locked or already-completed occurrences', () => {
    expect(() => completeChore({ ...pending, locked: true }, context)).toThrowError(
      ChoreDomainError,
    );
    expect(() => completeChore({ ...pending, state: 'completed' }, context)).toThrow(
      'no longer waiting',
    );
  });

  it('skips a pending occurrence without manufacturing a completion', () => {
    const skipped = skipChore(pending, { ...context, auditId: 'audit_skip_001' });
    expect(skipped.occurrence).toMatchObject({ state: 'skipped', completionId: null });
    expect(skipped.audit).toMatchObject({ action: 'chore.skip', result: 'succeeded' });
    expect(() => skipChore(skipped.occurrence, context)).toThrow('can no longer be skipped');
  });

  it('evaluates supported daily and weekly recurrence rules within active dates', () => {
    expect(isChoreDueOnDate('FREQ=DAILY', '2026-08-03', '2026-08-01', null)).toBe(true);
    expect(isChoreDueOnDate('FREQ=WEEKLY;BYDAY=MO,WE,FR', '2026-08-03', '2026-08-01', null)).toBe(
      true,
    );
    expect(isChoreDueOnDate('FREQ=WEEKLY;BYDAY=TU,TH', '2026-08-03', '2026-08-01', null)).toBe(
      false,
    );
    expect(isChoreDueOnDate('FREQ=DAILY', '2026-08-03', '2026-08-04', null)).toBe(false);
    expect(isChoreDueOnDate('FREQ=MONTHLY', '2026-08-03', '2026-08-01', null)).toBe(false);
  });

  it('sorts projections without mutating provider data', () => {
    const events = [{ start: '2026-08-03T10:30:00+08:00' }, { start: '2026-08-03T08:15:00+08:00' }];
    expect(sortByStart(events).map((event) => event.start)).toEqual([
      '2026-08-03T08:15:00+08:00',
      '2026-08-03T10:30:00+08:00',
    ]);
    expect(events[0]?.start).toBe('2026-08-03T10:30:00+08:00');
  });
});
