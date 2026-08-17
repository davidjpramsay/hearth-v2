import type { ChoreOccurrence, Payday } from '@hearth/shared';

const PAYDAY_OFFSET: Record<Payday, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

export interface PocketMoneyProgress {
  scheduledCount: number;
  completedCount: number;
  completionPercentage: number;
  earnedAmountCents: number | null;
  paidAmountCents: number;
  remainingAmountCents: number | null;
  paydayReached: boolean;
  status: 'not-configured' | 'building' | 'ready' | 'partially-paid' | 'paid';
}

export function calculatePocketMoneyProgress(
  occurrences: readonly Pick<ChoreOccurrence, 'state'>[],
  weeklyAmountCents: number | null,
  payday: Payday | null,
  asOfOffset: number,
  activePaidAmountCents: number,
  activePaymentCount: number,
): PocketMoneyProgress {
  const counted = occurrences.filter(
    (occurrence) => occurrence.state !== 'excused' && occurrence.state !== 'cancelled',
  );
  const completedCount = counted.filter((occurrence) => occurrence.state === 'completed').length;
  const scheduledCount = counted.length;
  const completionPercentage =
    scheduledCount === 0 ? 0 : Math.round((completedCount / scheduledCount) * 100);
  const earnedAmountCents =
    weeklyAmountCents === null
      ? null
      : scheduledCount === 0
        ? 0
        : Math.round((weeklyAmountCents * completedCount) / scheduledCount);
  const paydayReached = payday === null ? false : asOfOffset >= PAYDAY_OFFSET[payday];
  const remainingAmountCents =
    earnedAmountCents === null ? null : Math.max(0, earnedAmountCents - activePaidAmountCents);

  return {
    scheduledCount,
    completedCount,
    completionPercentage,
    earnedAmountCents,
    paidAmountCents: activePaidAmountCents,
    remainingAmountCents,
    paydayReached,
    status:
      weeklyAmountCents === null || payday === null
        ? 'not-configured'
        : activePaymentCount > 0 && remainingAmountCents === 0
          ? 'paid'
          : activePaidAmountCents > 0
            ? 'partially-paid'
            : paydayReached && remainingAmountCents !== null && remainingAmountCents > 0
              ? 'ready'
              : 'building',
  };
}

export function localDateOffset(start: string, end: string): number {
  const startDate = new Date(`${start}T12:00:00Z`);
  const endDate = new Date(`${end}T12:00:00Z`);
  return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
}
