import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import './AdultAccessScreen.css';

import type { AdultAccessSummary, PasskeyCredentialSummary } from '@hearth/shared';

import { adultAccessApi } from '../api/adultAccess';
import { createRequestId } from '../api/core';
import { queryKeys } from '../api/queryKeys';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Icon } from '../components/Icon';
import { useAdminQuery } from '../hooks/useAdminQueries';
import { useHearthRuntime } from '../runtime/context';
import {
  createAdditionalPasskey,
  createConfirmedRecoveryCode,
  passkeysAvailable,
} from '../auth/passkeys';

export function AdultAccessScreen() {
  const runtime = useHearthRuntime();
  const admin = useAdminQuery();
  const queryClient = useQueryClient();
  const [revealedCode, setRevealedCode] = useState<{
    code: string;
    expiresAt: string;
  } | null>(null);
  const [confirmRemoval, setConfirmRemoval] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const access = useQuery({
    queryKey: queryKeys.adultAccess,
    queryFn: adultAccessApi.getAdultAccess,
    enabled: runtime.mode === 'private',
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.adultAccess }),
      queryClient.invalidateQueries({ queryKey: queryKeys.activity }),
    ]);
  };
  const addPasskey = useMutation({
    mutationFn: createAdditionalPasskey,
    onSuccess: refresh,
  });
  const createRecovery = useMutation({
    mutationFn: createConfirmedRecoveryCode,
    onSuccess: async (result) => {
      setRevealedCode(result);
      setCopyState('idle');
      await refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (passkeyId: string) =>
      adultAccessApi.revokePasskey(passkeyId, createRequestId('passkey_revoke')),
    onSuccess: async () => {
      setConfirmRemoval(null);
      await refresh();
    },
  });

  if (admin.isPending) return <AdminLoading />;
  if (admin.isError) return <AdminError message={admin.error.message} />;
  if (runtime.mode === 'private' && access.isPending) return <AdminLoading />;
  if (runtime.mode === 'private' && access.isError) {
    return <AdminError message={access.error.message} />;
  }
  if (runtime.mode === 'private' && access.data === undefined) return <AdminLoading />;

  const data: AdultAccessSummary =
    runtime.mode === 'private'
      ? access.data!
      : demoAdultAccess(admin.data.household.id, admin.data.actor.id, admin.data.household.members);
  const available = runtime.mode === 'private' && passkeysAvailable();

  function submitPasskey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    addPasskey.mutate({
      memberId: String(form.get('memberId') ?? ''),
      passkeyLabel: String(form.get('passkeyLabel') ?? ''),
    });
  }

  return (
    <AdminPage title="Adult access">
      {runtime.mode === 'private' ? null : (
        <div className="admin-demo-note">
          Demo preview: real passkeys and recovery codes are available only on the private HTTPS
          Hearth.
        </div>
      )}
      {!available && runtime.mode === 'private' ? (
        <p className="form-message form-message--error" role="alert">
          Open Hearth from its private HTTPS address on a passkey-capable phone.
        </p>
      ) : null}

      <section className="adult-access-section" aria-labelledby="adult-passkeys-title">
        <header>
          <h2 id="adult-passkeys-title">Adult passkeys</h2>
        </header>
        <div className="adult-access-accounts">
          {data.adults.map((adult) => (
            <article className="adult-access-account" key={adult.member.id}>
              <header>
                <img alt="" src={adult.member.avatarUrl} />
                <div>
                  <h3>{adult.member.displayName}</h3>
                  <p>
                    {adult.passkeys.length === 0
                      ? 'No passkey enrolled'
                      : `${adult.passkeys.length} ${adult.passkeys.length === 1 ? 'passkey' : 'passkeys'}`}
                  </p>
                </div>
                <span className={adult.recovery.configured ? 'access-ready' : 'access-attention'}>
                  {adult.recovery.configured ? 'Recovery ready' : 'Recovery needed'}
                </span>
              </header>
              {adult.passkeys.length === 0 ? (
                <p className="adult-access-empty">Add a passkey from this adult’s phone.</p>
              ) : (
                <div className="adult-passkey-list">
                  {adult.passkeys.map((passkey) => {
                    const finalWithoutRecovery =
                      adult.passkeys.length === 1 && !adult.recovery.configured;
                    return (
                      <PasskeyRow
                        confirmRemoval={confirmRemoval === passkey.id}
                        disabled={runtime.mode !== 'private' || revoke.isPending}
                        finalWithoutRecovery={finalWithoutRecovery}
                        key={passkey.id}
                        onCancel={() => setConfirmRemoval(null)}
                        onConfirm={() => revoke.mutate(passkey.id)}
                        onRemove={() => setConfirmRemoval(passkey.id)}
                        passkey={passkey}
                      />
                    );
                  })}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <form className="adult-access-add" onSubmit={submitPasskey}>
        <div>
          <h2>Add a passkey</h2>
          <p>Use the adult’s device.</p>
        </div>
        <label>
          Adult
          <select defaultValue={data.actorMemberId} disabled={!available} name="memberId">
            {data.adults.map((adult) => (
              <option key={adult.member.id} value={adult.member.id}>
                {adult.member.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Passkey name
          <input
            defaultValue="My iPhone"
            disabled={!available}
            maxLength={80}
            name="passkeyLabel"
            required
          />
        </label>
        <button
          className="admin-submit"
          disabled={!available || addPasskey.isPending}
          type="submit"
        >
          {addPasskey.isPending ? 'Waiting for passkey…' : 'Add passkey'}
        </button>
        {addPasskey.isSuccess ? (
          <p className="form-message form-message--success" role="status">
            {addPasskey.data.credential.label} is ready.
          </p>
        ) : null}
        {addPasskey.isError ? (
          <p className="form-message form-message--error" role="alert">
            {addPasskey.error.message}
          </p>
        ) : null}
      </form>

      <section className="adult-recovery" aria-labelledby="adult-recovery-title">
        <div>
          <h2 id="adult-recovery-title">Your recovery code</h2>
          <p>A new code replaces the old one and is shown once.</p>
        </div>
        {revealedCode === null ? null : (
          <div className="adult-recovery-reveal" role="status">
            <strong>Write this down now</strong>
            <code>{revealedCode.code}</code>
            <span>Valid until {formatDate(revealedCode.expiresAt)} · one use only</span>
            <button
              className="admin-secondary"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(revealedCode.code);
                  setCopyState('copied');
                } catch {
                  setCopyState('failed');
                }
              }}
            >
              {copyState === 'copied' ? 'Copied' : 'Copy code'}
            </button>
            {copyState === 'failed' ? (
              <span className="adult-recovery-copy-error" role="alert">
                Copy was unavailable. Select and copy the code above.
              </span>
            ) : null}
          </div>
        )}
        <button
          className="admin-secondary adult-recovery-create"
          disabled={!available || createRecovery.isPending}
          onClick={() => createRecovery.mutate()}
          type="button"
        >
          <Icon name="shield" />
          {createRecovery.isPending
            ? 'Confirming passkey…'
            : ownRecoveryReady(data)
              ? 'Replace recovery code'
              : 'Create recovery code'}
        </button>
        {createRecovery.isError ? (
          <p className="form-message form-message--error" role="alert">
            {createRecovery.error.message}
          </p>
        ) : null}
      </section>
    </AdminPage>
  );
}

function PasskeyRow({
  passkey,
  confirmRemoval,
  finalWithoutRecovery,
  disabled,
  onRemove,
  onCancel,
  onConfirm,
}: {
  passkey: PasskeyCredentialSummary;
  confirmRemoval: boolean;
  finalWithoutRecovery: boolean;
  disabled: boolean;
  onRemove: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="adult-passkey-row">
      <span className="adult-passkey-row__icon">
        <Icon name="shield" />
      </span>
      <div>
        <strong>{passkey.label}</strong>
        <small>
          {passkey.backedUp ? 'Synced passkey' : 'This device only'} · added{' '}
          {formatDate(passkey.createdAt)}
        </small>
      </div>
      {confirmRemoval ? (
        <div className="adult-passkey-confirm" role="group" aria-label={`Remove ${passkey.label}`}>
          <button className="admin-secondary" disabled={disabled} onClick={onCancel} type="button">
            Keep
          </button>
          <button className="admin-danger" disabled={disabled} onClick={onConfirm} type="button">
            Remove
          </button>
        </div>
      ) : (
        <button
          className="admin-danger"
          disabled={disabled || finalWithoutRecovery}
          onClick={onRemove}
          title={
            finalWithoutRecovery
              ? 'Create a recovery code before removing the final passkey'
              : undefined
          }
          type="button"
        >
          Remove
        </button>
      )}
    </div>
  );
}

function ownRecoveryReady(access: AdultAccessSummary): boolean {
  return (
    access.adults.find((adult) => adult.member.id === access.actorMemberId)?.recovery.configured ??
    false
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function demoAdultAccess(
  householdId: string,
  actorMemberId: string,
  members: Array<{
    id: string;
    displayName: string;
    avatarUrl: string;
    role: 'adult' | 'child';
  }>,
): AdultAccessSummary {
  return {
    householdId,
    actorMemberId,
    adults: members
      .filter((member) => member.role === 'adult')
      .map((member) => ({
        member: {
          id: member.id,
          displayName: member.displayName,
          avatarUrl: member.avatarUrl,
        },
        passkeys: [],
        recovery: { configured: false, createdAt: null, expiresAt: null },
      })),
  };
}
