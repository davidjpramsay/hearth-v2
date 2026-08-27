import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

import { addLocalDays, localDateOffset } from '@hearth/core';
import type { Payday, PocketMoneyChildSummary, PocketMoneyPayment } from '@hearth/shared';

import { createRequestId } from '../api/core';
import { pocketMoneyApi as hearthApi } from '../api/pocketMoney';
import { queryKeys } from '../api/queryKeys';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { usePocketMoneyQuery } from '../hooks/usePocketMoneyQuery';
import { useHearthRuntime } from '../runtime/context';

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
  const runtime = useHearthRuntime();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedWeek = searchParams.get('week');
  const weekStart =
    validMonday(requestedWeek) && requestedWeek <= runtime.weekStart
      ? requestedWeek
      : runtime.weekStart;
  const isCurrentWeek = weekStart === runtime.weekStart;
  const asOfDate = asOfForWeek(weekStart, runtime.localDate);
  const reviewWeeks = buildReviewWeeks(runtime.weekStart, weekStart);
  const pocketMoney = usePocketMoneyQuery(weekStart, asOfDate);
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [voidingPaymentId, setVoidingPaymentId] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.pocketMoneyRoot });
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
        weekStart: runtime.weekStart,
        asOfDate: runtime.localDate,
      }),
    onSuccess: async (result) => {
      setConfirmation(
        `${result.child.member.displayName}’s settings are saved for every week until you change them.`,
      );
      await refresh();
    },
  });
  const pay = useMutation({
    mutationFn: ({
      memberId,
      amountCents,
      note,
    }: {
      memberId: string;
      amountCents: number;
      note: string | null;
    }) =>
      hearthApi.recordPocketMoneyPayment({
        requestId: createRequestId('pocket_money_payment'),
        memberId,
        weekStart,
        asOfDate,
        amountCents,
        note,
      }),
    onSuccess: async (result) => {
      setConfirmation(
        `${formatMoney(result.payment.amountCents)} recorded for ${result.child.member.displayName}.`,
      );
      await refresh();
    },
  });
  const voidPayment = useMutation({
    mutationFn: ({
      paymentId,
      paymentWeekStart,
      reason,
    }: {
      paymentId: string;
      paymentWeekStart: string;
      reason: string;
    }) =>
      hearthApi.voidPocketMoneyPayment(paymentId, {
        requestId: createRequestId('pocket_money_payment_void'),
        asOfDate: asOfForWeek(paymentWeekStart, runtime.localDate),
        reason,
      }),
    onSuccess: async (result) => {
      setConfirmation(
        `${formatMoney(result.payment.amountCents)} payment voided. The record remains in history.`,
      );
      setVoidingPaymentId(null);
      await refresh();
    },
  });

  if (pocketMoney.isPending) return <AdminLoading />;
  if (pocketMoney.isError) return <AdminError message={pocketMoney.error.message} />;

  const missingSettings = pocketMoney.data.children.filter(
    (child) => child.weeklyAmountCents === null || child.payday === null,
  );

  return (
    <AdminPage backLabel="Back to Family planning" backTo="/admin/planning" title="Pocket money">
      {missingSettings.length === 0 ? null : (
        <div className="pocket-money-setup-warning" role="alert">
          <Icon name="warning" />
          <div>
            <strong>Weekly amount required</strong>
            <span>
              Set pocket money and payday for{' '}
              {missingSettings.map((child) => child.member.displayName).join(' and ')}.
            </span>
          </div>
        </div>
      )}
      <section className="pocket-money-rules" aria-labelledby="pocket-money-rules-title">
        <header>
          <div>
            <h2 id="pocket-money-rules-title">Weekly settings</h2>
            <p>Repeats weekly until changed.</p>
          </div>
          <Icon name="wallet" />
        </header>
        {pocketMoney.data.children.length === 0 ? (
          <div className="pocket-money-empty">
            Add a child in People before setting up pocket money.
          </div>
        ) : (
          <div className="pocket-money-rule-list">
            {pocketMoney.data.children.map((child, childIndex) => (
              <PocketMoneyRuleForm
                child={child}
                childIndex={childIndex}
                key={`${child.member.id}:${child.weeklyAmountCents}:${child.payday ?? 'unset'}`}
                onUpdate={update.mutate}
                pending={update.isPending}
              />
            ))}
          </div>
        )}
      </section>
      {confirmation === null ? null : (
        <p className="save-confirmation" role="status">
          {confirmation}
        </p>
      )}
      {update.isError || pay.isError || voidPayment.isError ? (
        <AdminError
          message={
            (update.error ?? pay.error ?? voidPayment.error)?.message ??
            'That pocket-money change was not saved.'
          }
        />
      ) : null}
      <section className="pocket-money-review" aria-labelledby="pocket-money-review-title">
        <header className="pocket-money-review__header">
          <div>
            <h2 id="pocket-money-review-title">Weekly progress</h2>
            <p>{shortWeek(weekStart)}</p>
          </div>
          <label>
            Week to review
            <select
              onChange={(event) => selectReviewWeek(event.currentTarget.value)}
              value={weekStart}
            >
              {reviewWeeks.map((week, index) => (
                <option key={week} value={week}>
                  {index === 0
                    ? `This week · ${shortWeek(week)}`
                    : index === 1
                      ? `Last week · ${shortWeek(week)}`
                      : shortWeek(week)}
                </option>
              ))}
            </select>
          </label>
        </header>
        <div className="pocket-money-intro">
          <Icon name="wallet" />
          <div>
            <strong>Based on the full week</strong>
            <p>Excused and cancelled chores do not count. Skipped chores remain incomplete.</p>
          </div>
        </div>
        {isCurrentWeek ? null : (
          <div className="pocket-money-week-context" role="note">
            <Icon name="calendar" />
            <div>
              <strong>Reviewing {shortWeek(weekStart)}</strong>
              <span>
                The settings above are your current standing rules. Past payments keep the amount
                and chore progress recorded at the time.
              </span>
            </div>
          </div>
        )}
      </section>
      <div className="pocket-money-admin-list">
        {pocketMoney.data.children.map((child) => (
          <PocketMoneyChildCard
            child={child}
            key={`${child.member.id}:${weekStart}`}
            onPay={pay.mutate}
            paymentPending={pay.isPending}
          />
        ))}
      </div>
      <PaymentHistory
        children={pocketMoney.data.children}
        onCancelVoid={() => setVoidingPaymentId(null)}
        onOpenWeek={openWeek}
        onStartVoid={setVoidingPaymentId}
        onVoid={(event, payment) => submitVoid(event, payment, voidPayment.mutate)}
        payments={pocketMoney.data.recentPayments}
        pending={voidPayment.isPending}
        voidingPaymentId={voidingPaymentId}
      />
    </AdminPage>
  );

  function selectReviewWeek(next: string): void {
    const params = new URLSearchParams(searchParams);
    if (next === runtime.weekStart) params.delete('week');
    else params.set('week', next);
    setSearchParams(params, { replace: true });
    setConfirmation(null);
  }

  function openWeek(paymentWeekStart: string): void {
    const params = new URLSearchParams(searchParams);
    if (paymentWeekStart === runtime.weekStart) params.delete('week');
    else params.set('week', paymentWeekStart);
    setSearchParams(params, { replace: true });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}

function PocketMoneyRuleForm({
  child,
  childIndex,
  onUpdate,
  pending,
}: {
  child: PocketMoneyChildSummary;
  childIndex: number;
  onUpdate: (input: { memberId: string; weeklyAmountCents: number; payday: Payday }) => void;
  pending: boolean;
}) {
  return (
    <article className="pocket-money-rule">
      <header>
        <Avatar member={child.member} />
        <div>
          <h3>{child.member.displayName}</h3>
        </div>
      </header>
      <form
        aria-label={`${child.member.displayName} pocket-money settings`}
        className="pocket-money-settings-form"
        onSubmit={(event) => submitSettings(event, child.member.id, onUpdate)}
      >
        <label>
          Weekly amount
          <span className="money-input">
            <span>$</span>
            <input
              aria-label={`${child.member.displayName} weekly amount`}
              data-focus-entry={childIndex === 0 ? 'true' : undefined}
              data-focus-id={`pocket-amount-${child.member.id}`}
              defaultValue={
                child.weeklyAmountCents === null ? '' : (child.weeklyAmountCents / 100).toFixed(2)
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
          <select
            aria-label={`${child.member.displayName} payday`}
            defaultValue={child.payday ?? 'friday'}
            name="payday"
            required
          >
            {PAYDAYS.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
        </label>
        <button className="admin-secondary" disabled={pending} type="submit">
          {pending ? 'Saving…' : `Save ${child.member.displayName}`}
        </button>
      </form>
    </article>
  );
}

function PocketMoneyChildCard({
  child,
  onPay,
  paymentPending,
}: {
  child: PocketMoneyChildSummary;
  onPay: (input: { memberId: string; amountCents: number; note: string | null }) => void;
  paymentPending: boolean;
}) {
  const canRecord =
    child.weeklyAmountCents !== null &&
    child.remainingAmountCents !== null &&
    child.remainingAmountCents > 0;
  const unconfigured = child.weeklyAmountCents === null || child.payday === null;
  const fullyPaid = child.status === 'paid';
  const nothingDue = child.remainingAmountCents === 0 && !fullyPaid;
  return (
    <article className="pocket-money-admin-card">
      <header>
        <Avatar member={child.member} />
        <div>
          <h3>{child.member.displayName}</h3>
          <span>{statusLabel(child)}</span>
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
          Chores
          <b>
            {child.completedCount} of {child.scheduledCount}
          </b>
        </span>
        <span>
          Earned
          <b>{formatMoney(child.earnedAmountCents)}</b>
        </span>
        <span>
          Paid
          <b>{formatMoney(child.paidAmountCents)}</b>
        </span>
        <span>
          Weekly amount
          <b>{formatMoney(child.weeklyAmountCents)}</b>
        </span>
      </div>
      <div className="pocket-payment">
        <div className="pocket-payment__summary">
          <strong>
            {fullyPaid
              ? 'Paid in full'
              : unconfigured
                ? 'Setup required'
                : nothingDue
                  ? 'Nothing due yet'
                  : `${formatMoney(child.remainingAmountCents)} remaining`}
          </strong>
          <span>
            {unconfigured
              ? 'Choose a weekly amount and payday before recording a payment.'
              : child.paydayReached
                ? `Payday is ${paydayLabel(child.payday)}.`
                : `Payday is ${paydayLabel(child.payday)}. Recording early is allowed.`}
          </span>
        </div>
        {!canRecord ? null : (
          <form
            className="pocket-payment-form"
            key={`${child.member.id}:${child.remainingAmountCents}`}
            onSubmit={(event) => submitPayment(event, child.member.id, onPay)}
          >
            <label>
              Payment amount
              <span className="money-input">
                <span>$</span>
                <input
                  defaultValue={((child.remainingAmountCents ?? 0) / 100).toFixed(2)}
                  inputMode="decimal"
                  max={((child.remainingAmountCents ?? 0) / 100).toFixed(2)}
                  min="0.01"
                  name="paymentAmount"
                  required
                  step="0.01"
                  type="number"
                />
              </span>
            </label>
            <label className="pocket-payment-note">
              <span className="pocket-payment-note__label">
                Note <small>optional</small>
              </span>
              <input maxLength={240} name="paymentNote" placeholder="Cash, transfer…" />
            </label>
            <button className="admin-submit" disabled={paymentPending} type="submit">
              {paymentPending ? 'Recording…' : 'Record payment'}
            </button>
          </form>
        )}
      </div>
    </article>
  );
}

function PaymentHistory({
  children,
  payments,
  voidingPaymentId,
  pending,
  onStartVoid,
  onCancelVoid,
  onOpenWeek,
  onVoid,
}: {
  children: PocketMoneyChildSummary[];
  payments: PocketMoneyPayment[];
  voidingPaymentId: string | null;
  pending: boolean;
  onStartVoid: (paymentId: string) => void;
  onCancelVoid: () => void;
  onOpenWeek: (weekStart: string) => void;
  onVoid: (event: FormEvent<HTMLFormElement>, payment: PocketMoneyPayment) => void;
}) {
  return (
    <section className="pocket-money-history" aria-labelledby="pocket-money-history-title">
      <header>
        <div>
          <h2 id="pocket-money-history-title">Payment history</h2>
          <p>Corrections remain visible.</p>
        </div>
        <Icon name="wallet" />
      </header>
      {payments.length === 0 ? (
        <p className="pocket-money-history__empty">No payments yet.</p>
      ) : (
        <div className="pocket-money-history__list">
          {payments.map((payment) => {
            const child = children.find((candidate) => candidate.member.id === payment.memberId);
            const isVoiding = voidingPaymentId === payment.id;
            return (
              <article
                className={`pocket-money-history-row${payment.void === null ? '' : ' pocket-money-history-row--voided'}`}
                key={payment.id}
              >
                <div className="pocket-money-history-row__person">
                  {child === undefined ? null : <Avatar member={child.member} />}
                  <div>
                    <strong>{child?.member.displayName ?? 'Former child'}</strong>
                    <button onClick={() => onOpenWeek(payment.weekStart)} type="button">
                      Week {shortWeek(payment.weekStart)}
                    </button>
                  </div>
                </div>
                <div className="pocket-money-history-row__amount">
                  <strong>{formatMoney(payment.amountCents)}</strong>
                  <span>{formatDate(payment.paidAt)}</span>
                </div>
                <div className="pocket-money-history-row__detail">
                  <span>{payment.completionPercentage}% of chores complete</span>
                  {payment.note === null ? null : <span>{payment.note}</span>}
                  {payment.void === null ? null : <strong>Voided · {payment.void.reason}</strong>}
                </div>
                {payment.void !== null ? null : isVoiding ? (
                  <form
                    className="pocket-money-void-form"
                    onSubmit={(event) => onVoid(event, payment)}
                  >
                    <label>
                      Correction reason
                      <input
                        maxLength={240}
                        minLength={3}
                        name="reason"
                        placeholder="Recorded twice…"
                        required
                      />
                    </label>
                    <div>
                      <button className="admin-secondary" onClick={onCancelVoid} type="button">
                        Cancel
                      </button>
                      <button className="admin-danger" disabled={pending} type="submit">
                        {pending ? 'Voiding…' : 'Void payment'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    className="pocket-money-history-row__void"
                    onClick={() => onStartVoid(payment.id)}
                    type="button"
                  >
                    Correct
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
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

function submitPayment(
  event: FormEvent<HTMLFormElement>,
  memberId: string,
  mutate: (input: { memberId: string; amountCents: number; note: string | null }) => void,
) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const note = String(data.get('paymentNote') ?? '').trim();
  mutate({
    memberId,
    amountCents: Math.round(Number(data.get('paymentAmount')) * 100),
    note: note === '' ? null : note,
  });
}

function submitVoid(
  event: FormEvent<HTMLFormElement>,
  payment: PocketMoneyPayment,
  mutate: (input: { paymentId: string; paymentWeekStart: string; reason: string }) => void,
) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  mutate({
    paymentId: payment.id,
    paymentWeekStart: payment.weekStart,
    reason: String(data.get('reason')).trim(),
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

function statusLabel(child: PocketMoneyChildSummary): string {
  if (child.status === 'not-configured') return 'Weekly amount required';
  if (child.status === 'paid') return 'Paid in full';
  if (child.status === 'partially-paid') {
    return `${formatMoney(child.remainingAmountCents)} still to pay`;
  }
  if (child.status === 'ready') return 'Ready to pay';
  return `Building towards ${paydayLabel(child.payday)}`;
}

function paydayLabel(payday: Payday | null): string {
  return PAYDAYS.find((day) => day.value === payday)?.label ?? 'payday';
}

function validMonday(value: string | null): value is string {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T12:00:00Z`).getUTCDay() === 1;
}

function buildReviewWeeks(currentWeek: string, selectedWeek: string): string[] {
  const weeks = Array.from({ length: 8 }, (_, index) => addLocalDays(currentWeek, index * -7));
  if (!weeks.includes(selectedWeek)) weeks.push(selectedWeek);
  return weeks.sort((left, right) => right.localeCompare(left));
}

function asOfForWeek(weekStart: string, today: string): string {
  const offset = localDateOffset(weekStart, today);
  if (offset < 0) return weekStart;
  if (offset > 6) return addLocalDays(weekStart, 6);
  return today;
}

function shortWeek(weekStart: string): string {
  const start = new Date(`${weekStart}T12:00:00Z`);
  const end = new Date(`${addLocalDays(weekStart, 6)}T12:00:00Z`);
  const day = (date: Date) =>
    new Intl.DateTimeFormat('en-AU', { day: 'numeric', timeZone: 'UTC' }).format(date);
  const month = (date: Date) =>
    new Intl.DateTimeFormat('en-AU', { month: 'short', timeZone: 'UTC' }).format(date);
  const year = (date: Date) =>
    new Intl.DateTimeFormat('en-AU', { year: 'numeric', timeZone: 'UTC' }).format(date);
  if (year(start) !== year(end)) {
    return `${day(start)} ${month(start)} ${year(start)}–${day(end)} ${month(end)} ${year(end)}`;
  }
  if (month(start) !== month(end)) {
    return `${day(start)} ${month(start)}–${day(end)} ${month(end)}`;
  }
  return `${day(start)}–${day(end)} ${month(end)}`;
}

function formatDate(timestamp: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(timestamp));
}
