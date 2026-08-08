import type { ChoreOccurrence, Payday, PocketMoneyPayment } from '@hearth/shared';

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
  status: 'not-configured' | 'building' | 'ready' | 'paid';
}

export function calculatePocketMoneyProgress(
  occurrences: readonly Pick<ChoreOccurrence, 'state'>[],
  weeklyAmountCents: number | null,
  payday: Payday | null,
  asOfOffset: number,
  payment: PocketMoneyPayment | null,
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

  return {
    scheduledCount,
    completedCount,
    completionPercentage,
    earnedAmountCents,
    status:
      weeklyAmountCents === null || payday === null
        ? 'not-configured'
        : payment !== null
          ? 'paid'
          : asOfOffset >= PAYDAY_OFFSET[payday]
            ? 'ready'
            : 'building',
  };
}

export function localDateOffset(start: string, end: string): number {
  const startDate = new Date(`${start}T12:00:00Z`);
  const endDate = new Date(`${end}T12:00:00Z`);
  return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
}
