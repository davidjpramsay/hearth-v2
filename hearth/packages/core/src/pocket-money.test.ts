import { describe, expect, it } from 'vitest';

import { calculatePocketMoneyProgress } from './pocket-money.js';

describe('pocket money progress', () => {
  it('uses completed chores as a proportion of chores due so far', () => {
    expect(
      calculatePocketMoneyProgress(
        [
          { state: 'completed' },
          { state: 'pending' },
          { state: 'completed' },
          { state: 'skipped' },
        ],
        1_200,
        'friday',
        2,
        null,
      ),
    ).toEqual({
      scheduledCount: 4,
      completedCount: 2,
      completionPercentage: 50,
      earnedAmountCents: 600,
      status: 'building',
    });
  });

  it('excludes excused and cancelled chores and rounds to the nearest cent', () => {
    expect(
      calculatePocketMoneyProgress(
        [
          { state: 'completed' },
          { state: 'pending' },
          { state: 'pending' },
          { state: 'excused' },
          { state: 'cancelled' },
        ],
        1_000,
        'wednesday',
        2,
        null,
      ),
    ).toMatchObject({
      scheduledCount: 3,
      completedCount: 1,
      completionPercentage: 33,
      earnedAmountCents: 333,
      status: 'ready',
    });
  });

  it('requires settings and preserves a paid snapshot status', () => {
    expect(calculatePocketMoneyProgress([], null, null, 0, null).status).toBe('not-configured');
    expect(
      calculatePocketMoneyProgress([], 1_200, 'friday', 0, {
        id: 'payment_test',
        memberId: 'member_test',
        weekStart: '2026-08-03',
        weekEnd: '2026-08-09',
        scheduledCount: 6,
        completedCount: 4,
        completionPercentage: 67,
        amountCents: 800,
        paidAt: '2026-08-07T10:00:00+08:00',
        paidByActorId: 'member_parent',
        source: 'companion',
      }).status,
    ).toBe('paid');
  });
});
