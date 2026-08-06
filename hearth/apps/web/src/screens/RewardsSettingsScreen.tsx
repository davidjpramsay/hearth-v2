import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';

import { createRequestId, hearthApi, queryKeys } from '../api/client';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { useAdminQuery, useRewardsQuery } from '../hooks/useHearthQueries';

export function RewardsSettingsScreen() {
  const admin = useAdminQuery();
  const rewards = useRewardsQuery();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.rewards });
  const adjust = useMutation({ mutationFn: hearthApi.adjustReward, onSuccess: refresh });
  const reverse = useMutation({
    mutationFn: (entryId: string) =>
      hearthApi.reverseReward(entryId, createRequestId('reward_reverse')),
    onSuccess: refresh,
  });
  const create = useMutation({ mutationFn: hearthApi.createRewardDefinition, onSuccess: refresh });

  if (admin.isPending || rewards.isPending) return <AdminLoading />;
  if (admin.isError) return <AdminError message={admin.error.message} />;
  if (rewards.isError) return <AdminError message={rewards.error.message} />;

  function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    adjust.mutate({
      requestId: createRequestId('reward_adjust'),
      memberId: String(data.get('memberId') ?? ''),
      delta: Number(data.get('delta') ?? 0),
      reason: String(data.get('reason') ?? '').trim(),
      rewardId: null,
    });
  }

  function submitDefinition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    create.mutate({
      requestId: createRequestId('reward_definition'),
      name: String(data.get('name') ?? '').trim(),
      description: String(data.get('description') ?? '').trim() || null,
      cost: Number(data.get('cost') ?? 1),
      approvalRequired: data.get('approvalRequired') === 'on',
    });
    form.reset();
  }

  const reversedEntryIds = new Set(
    rewards.data.ledger.flatMap((entry) =>
      entry.reversalOfEntryId === null ? [] : [entry.reversalOfEntryId],
    ),
  );

  return (
    <AdminPage
      backLabel="Back to Family planning"
      backTo="/admin/planning"
      title="Rewards"
      subtitle="Stars are a transparent household ledger"
    >
      <div className="reward-balances">
        {rewards.data.balances.map((balance) => (
          <article className="reward-balance" key={balance.member.id}>
            <Avatar member={balance.member} />
            <div>
              <strong>{balance.member.displayName}</strong>
              <span>Available stars</span>
            </div>
            <b>
              {balance.balance}
              <Icon name="star" />
            </b>
          </article>
        ))}
      </div>
      {adjust.isError || reverse.isError || create.isError ? (
        <AdminError
          message={
            (adjust.error ?? reverse.error ?? create.error)?.message ??
            'That reward change could not be saved.'
          }
        />
      ) : null}
      <form className="admin-form reward-adjust-form" onSubmit={submitAdjustment}>
        <h2>Adjust a balance</h2>
        <p>Use this for a correction, bonus or approved redemption. It never edits an old entry.</p>
        <div className="admin-form__split reward-adjust-grid">
          <label>
            Person
            <select data-focus-id="reward-adjust-member_ezra" name="memberId">
              {admin.data.household.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </label>
          <label>
            Stars (+ or −)
            <input defaultValue={1} name="delta" required type="number" />
          </label>
        </div>
        <label>
          Reason
          <input maxLength={180} name="reason" placeholder="e.g. Helped with dinner" required />
        </label>
        <button className="admin-submit" disabled={adjust.isPending} type="submit">
          {adjust.isPending ? 'Saving…' : 'Record adjustment'}
        </button>
      </form>
      <section className="reward-section">
        <h2>Family choices</h2>
        <div className="reward-definition-list">
          {rewards.data.definitions
            .filter((definition) => !definition.archived)
            .map((definition) => (
              <article key={definition.id}>
                <Icon name="star" />
                <div>
                  <strong>{definition.name}</strong>
                  <span>{definition.description ?? 'Family reward'}</span>
                </div>
                <b>{definition.cost}</b>
              </article>
            ))}
        </div>
      </section>
      <form className="admin-form reward-create-form" onSubmit={submitDefinition}>
        <h2>Add a family choice</h2>
        <label>
          Name
          <input maxLength={140} name="name" required />
        </label>
        <label>
          Description
          <input maxLength={320} name="description" />
        </label>
        <label>
          Star cost
          <input defaultValue={10} min={1} name="cost" required type="number" />
        </label>
        <label className="checkbox-field">
          <input defaultChecked name="approvalRequired" type="checkbox" />
          Adult approval required
        </label>
        <button className="admin-submit" disabled={create.isPending} type="submit">
          {create.isPending ? 'Adding…' : 'Add choice'}
        </button>
      </form>
      <section className="reward-section reward-ledger">
        <h2>Recent history</h2>
        {rewards.data.ledger.map((entry) => {
          const reversible = entry.reversalOfEntryId === null && !reversedEntryIds.has(entry.id);
          return (
            <article key={entry.id}>
              <Avatar member={entry.member} />
              <div>
                <strong>{entry.reason}</strong>
                <span>
                  {entry.member.displayName} · {formatTime(entry.occurredAt)}
                </span>
              </div>
              <b className={entry.delta < 0 ? 'reward-negative' : ''}>
                {entry.delta > 0 ? '+' : ''}
                {entry.delta}
              </b>
              {reversible ? (
                <button
                  disabled={reverse.isPending}
                  onClick={() => reverse.mutate(entry.id)}
                  type="button"
                >
                  Reverse
                </button>
              ) : (
                <span className="reward-ledger__settled">Recorded</span>
              )}
            </article>
          );
        })}
      </section>
    </AdminPage>
  );
}

function formatTime(timestamp: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Australia/Perth',
  }).format(new Date(timestamp));
}
