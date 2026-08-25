import { describe, expect, it } from 'vitest';

import { calculatePocketMoneyProgress } from './pocket-money.js';

describe('pocket money progress', () => {
  it('uses completed chores as a proportion of the supplied complete-week schedule', () => {
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
        0,
        0,
      ),
    ).toEqual({
      scheduledCount: 4,
      completedCount: 2,
      completionPercentage: 50,
      earnedAmountCents: 600,
      paidAmountCents: 0,
      remainingAmountCents: 600,
      paydayReached: false,
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
        0,
        0,
      ),
    ).toMatchObject({
      scheduledCount: 3,
      completedCount: 1,
      completionPercentage: 33,
      earnedAmountCents: 333,
      paidAmountCents: 0,
      remainingAmountCents: 333,
      paydayReached: true,
      status: 'ready',
    });
  });

  it('requires settings and preserves a paid snapshot status', () => {
    expect(calculatePocketMoneyProgress([], null, null, 0, 0, 0).status).toBe('not-configured');
    expect(calculatePocketMoneyProgress([], 1_200, 'monday', 0, 0, 0).status).toBe('building');
    expect(calculatePocketMoneyProgress([], 1_200, 'friday', 0, 0, 1).status).toBe('paid');
  });

  it('tracks partial payments without losing the weekly chore snapshot', () => {
    expect(
      calculatePocketMoneyProgress(
        [{ state: 'completed' }, { state: 'pending' }],
        1_200,
        'friday',
        4,
        300,
        1,
      ),
    ).toMatchObject({
      earnedAmountCents: 600,
      paidAmountCents: 300,
      remainingAmountCents: 300,
      status: 'partially-paid',
    });
  });
});
