import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import type { Payday } from '@hearth/shared';

import { createRequestId, DEMO_DATE, hearthApi, queryKeys } from '../api/client';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { usePocketMoneyQuery } from '../hooks/useHearthQueries';

const PAYDAYS: Array<{ value: Payday; label: string }> = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

export function PocketMoneySettingsScreen() {
  const pocketMoney = usePocketMoneyQuery();
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.pocketMoney });
  const update = useMutation({
    mutationFn: ({
      memberId,
      weeklyAmountCents,
      payday,
    }: {
      memberId: string;
      weeklyAmountCents: number;
      payday: Payday;
    }) =>
      hearthApi.updatePocketMoneySettings(memberId, {
        requestId: createRequestId('pocket_money_settings'),
        weeklyAmountCents,
        payday,
        weekStart: DEMO_DATE,
        asOfDate: DEMO_DATE,
      }),
    onSuccess: async (result) => {
      setConfirmation(`${result.child.member.displayName}’s weekly amount is saved.`);
      await refresh();
    },
  });
  const pay = useMutation({
    mutationFn: (memberId: string) =>
      hearthApi.recordPocketMoneyPayment({
        requestId: createRequestId('pocket_money_payment'),
        memberId,
        weekStart: DEMO_DATE,
        asOfDate: DEMO_DATE,
      }),
    onSuccess: async (result) => {
      setConfirmation(
        `${formatMoney(result.payment.amountCents)} recorded as paid for ${result.child.member.displayName}.`,
      );
      await refresh();
    },
  });

  if (pocketMoney.isPending) return <AdminLoading />;
  if (pocketMoney.isError) return <AdminError message={pocketMoney.error.message} />;

  return (
    <AdminPage
      backLabel="Back to Family planning"
      backTo="/admin/planning"
      title="Pocket money"
      subtitle={`Weekly progress and payments · ${pocketMoney.data.displayRange}`}
    >
      <div className="pocket-money-intro">
        <Icon name="wallet" />
        <div>
          <strong>Chores decide the amount due</strong>
          <p>
            Hearth calculates each child’s share from chores due so far this week. Excused and
            cancelled chores do not count against them.
          </p>
        </div>
      </div>
      {confirmation === null ? null : (
        <p className="save-confirmation" role="status">
          {confirmation}
        </p>
      )}
      {update.isError || pay.isError ? (
        <AdminError
          message={
            (update.error ?? pay.error)?.message ?? 'That pocket-money change was not saved.'
          }
        />
      ) : null}
      <div className="pocket-money-admin-list">
        {pocketMoney.data.children.map((child) => (
          <article className="pocket-money-admin-card" key={child.member.id}>
            <header>
              <Avatar member={child.member} />
              <div>
                <h2>{child.member.displayName}</h2>
                <span>{statusLabel(child.status, child.payday)}</span>
              </div>
              <strong>{child.completionPercentage}%</strong>
            </header>
            <div
              aria-label={`${child.completedCount} of ${child.scheduledCount} chores complete this week`}
              aria-valuemax={child.scheduledCount}
              aria-valuemin={0}
              aria-valuenow={child.completedCount}
              className="pocket-progress"
              role="progressbar"
            >
              <span style={{ width: `${child.completionPercentage}%` }} />
            </div>
            <div className="pocket-money-summary">
              <span>
                <b>{child.completedCount}</b> of {child.scheduledCount} chores
              </span>
              <span>
                Due now
                <b>{formatMoney(child.earnedAmountCents)}</b>
              </span>
              <span>
                Weekly amount
                <b>{formatMoney(child.weeklyAmountCents)}</b>
              </span>
            </div>
            <form
              className="pocket-money-settings-form"
              onSubmit={(event) => submitSettings(event, child.member.id, update.mutate)}
            >
              <label>
                Weekly pocket money
                <span className="money-input">
                  <span>$</span>
                  <input
                    data-focus-id={`pocket-amount-${child.member.id}`}
                    defaultValue={
                      child.weeklyAmountCents === null
                        ? ''
                        : (child.weeklyAmountCents / 100).toFixed(2)
                    }
                    inputMode="decimal"
                    min="1"
                    name="weeklyAmount"
                    placeholder="12.00"
                    required
                    step="0.50"
                    type="number"
                  />
                </span>
              </label>
              <label>
                Payday
                <select defaultValue={child.payday ?? 'friday'} name="payday" required>
                  {PAYDAYS.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </label>
              <button className="admin-secondary" disabled={update.isPending} type="submit">
                {update.isPending ? 'Saving…' : 'Save weekly settings'}
              </button>
            </form>
            <div className="pocket-payment">
              <div>
                <strong>This week’s payment</strong>
                <span>
                  {child.payment === null
                    ? `${formatMoney(child.earnedAmountCents)} currently due`
                    : `${formatMoney(child.payment.amountCents)} paid · ${child.payment.completionPercentage}% complete`}
                </span>
              </div>
              <button
                className="admin-submit"
                disabled={
                  pay.isPending || child.payment !== null || child.weeklyAmountCents === null
                }
                onClick={() => pay.mutate(child.member.id)}
                type="button"
              >
                {child.payment === null ? 'Record paid' : 'Paid'}
              </button>
            </div>
          </article>
        ))}
      </div>
      {pocketMoney.data.children.length === 0 ? (
        <div className="pocket-money-empty">
          Add a child in People before setting up pocket money.
        </div>
      ) : null}
    </AdminPage>
  );
}

function submitSettings(
  event: FormEvent<HTMLFormElement>,
  memberId: string,
  mutate: (input: { memberId: string; weeklyAmountCents: number; payday: Payday }) => void,
) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const weeklyAmount = Number(data.get('weeklyAmount'));
  mutate({
    memberId,
    weeklyAmountCents: Math.round(weeklyAmount * 100),
    payday: String(data.get('payday')) as Payday,
  });
}

function formatMoney(cents: number | null): string {
  if (cents === null) return 'Not set';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function statusLabel(
  status: 'not-configured' | 'building' | 'ready' | 'paid',
  payday: Payday | null,
): string {
  if (status === 'not-configured') return 'Weekly amount required';
  if (status === 'paid') return 'Paid this week';
  if (status === 'ready') return 'Ready to pay';
  const label = PAYDAYS.find((day) => day.value === payday)?.label ?? 'payday';
  return `Building towards ${label}`;
}
