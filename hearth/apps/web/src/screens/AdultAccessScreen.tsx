import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';

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
import { clearIdentityAndReload } from '../auth/signOut';

export function AdultAccessScreen() {
  const runtime = useHearthRuntime();
  const admin = useAdminQuery();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [revealedCode, setRevealedCode] = useState<{
    code: string;
    expiresAt: string;
  } | null>(null);
  const [confirmRemoval, setConfirmRemoval] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [selectedAdultId, setSelectedAdultId] = useState<string | null>(searchParams.get('adult'));
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
    onSuccess: (result) => {
      const controller = admin.data?.household.members
        .find((member) => member.id === result.credential.memberId)
        ?.capabilities.includes('household.admin');
      return clearIdentityAndReload(queryClient, controller ? '/admin/televisions' : '/');
    },
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
  const selectedAdult =
    data.adults.find((adult) => adult.member.id === selectedAdultId) ??
    data.adults.find((adult) => adult.member.id === data.actorMemberId);
  const savedAdult = data.adults.find(
    (adult) => adult.member.id === addPasskey.data?.credential.memberId,
  );

  function submitPasskey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    addPasskey.mutate({
      memberId: String(form.get('memberId') ?? ''),
      passkeyLabel: String(form.get('passkeyLabel') ?? ''),
      signInOnThisDevice: true,
    });
  }

  return (
    <AdminPage
      title="Adult access"
      backTo="/admin/televisions"
      backLabel="Back to Phones & screens"
    >
      <p className="device-access-summary">
        Signed in as <strong>{admin.data.actor.displayName}</strong>.
      </p>
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
          <h2 id="adult-passkeys-title">Adults</h2>
        </header>
        <div className="adult-access-accounts">
          {data.adults.map((adult) => (
            <article className="adult-access-account" key={adult.member.id}>
              <header>
                <img alt="" src={adult.member.avatarUrl} />
                <div>
                  <h3>{adult.member.displayName}</h3>
                  <p>
                    {admin.data.household.members
                      .find((member) => member.id === adult.member.id)
                      ?.capabilities.includes('household.admin')
                      ? 'Household controller'
                      : 'Family access · no household settings'}
                  </p>
                </div>
                <span className={adult.passkeys.length > 0 ? 'access-ready' : 'access-attention'}>
                  {adult.passkeys.length > 0 ? 'Sign-in set up' : 'Needs sign-in'}
                </span>
              </header>
            </article>
          ))}
        </div>
      </section>

      <form className="adult-access-add" onSubmit={submitPasskey}>
        <div>
          <h2>Set up this phone</h2>
          <p>
            On {selectedAdult?.member.displayName ?? 'this adult'}’s phone, save their passkey. This
            phone will then sign in as them.
          </p>
        </div>
        <label>
          Adult
          <select
            value={selectedAdult?.member.id ?? ''}
            disabled={!available || addPasskey.isPending}
            name="memberId"
            onChange={(event) => {
              setSelectedAdultId(event.target.value);
              addPasskey.reset();
            }}
          >
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
            key={selectedAdult?.member.id}
            defaultValue={`${selectedAdult?.member.displayName ?? 'My'}’s phone`}
            disabled={!available || addPasskey.isPending}
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
          {addPasskey.isPending ? 'Waiting for passkey…' : 'Set up this phone'}
        </button>
        {addPasskey.isSuccess ? (
          <p className="form-message form-message--success" role="status">
            Phone sign-in saved for {savedAdult?.member.displayName ?? 'the selected adult'}.
            Opening Hearth…
          </p>
        ) : null}
        {addPasskey.isError ? (
          <p className="form-message form-message--error" role="alert">
            {addPasskey.error.message}
          </p>
        ) : null}
      </form>

      <details className="adult-access-advanced">
        <summary>Advanced sign-in &amp; recovery</summary>
        <p className="device-setup-empty">
          Passkeys can sync between devices. These are sign-in keys, not a phone inventory.
        </p>
        {data.adults.map((adult) => (
          <section className="adult-access-section" key={adult.member.id}>
            <h2>{adult.member.displayName}’s sign-in keys</h2>
            {adult.passkeys.length === 0 ? (
              <p>No sign-in key yet.</p>
            ) : (
              adult.passkeys.map((passkey) => (
                <PasskeyRow
                  confirmRemoval={confirmRemoval === passkey.id}
                  disabled={runtime.mode !== 'private' || revoke.isPending}
                  finalWithoutRecovery={adult.passkeys.length === 1 && !adult.recovery.configured}
                  key={passkey.id}
                  onCancel={() => setConfirmRemoval(null)}
                  onConfirm={() => revoke.mutate(passkey.id)}
                  onRemove={() => setConfirmRemoval(passkey.id)}
                  passkey={passkey}
                />
              ))
            )}
          </section>
        ))}
        {revoke.isError ? (
          <p className="form-message form-message--error" role="alert">
            {revoke.error.message}
          </p>
        ) : null}
        {revoke.isSuccess ? (
          <p className="form-message form-message--success" role="status">
            Sign-in key removed.
          </p>
        ) : null}
        <section className="adult-recovery" aria-labelledby="adult-recovery-title">
          <div>
            <h2 id="adult-recovery-title">Your recovery code</h2>
            <p>
              Optional safety net for lost access—not a phone invitation. A new code replaces the
              old one.
            </p>
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
        <p className="device-setup-empty">
          Lost access on every phone? The NAS owner can issue a one-time recovery code without
          resetting the household or TV.
        </p>
      </details>
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
      {finalWithoutRecovery ? (
        <small className="adult-passkey-protected">
          Only sign-in key. Add another key or create recovery before removing it.
        </small>
      ) : confirmRemoval ? (
        <div className="adult-passkey-confirm" role="group" aria-label={`Remove ${passkey.label}`}>
          <button className="admin-secondary" disabled={disabled} onClick={onCancel} type="button">
            Keep
          </button>
          <button className="admin-danger" disabled={disabled} onClick={onConfirm} type="button">
            Remove
          </button>
        </div>
      ) : (
        <button className="admin-danger" disabled={disabled} onClick={onRemove} type="button">
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
