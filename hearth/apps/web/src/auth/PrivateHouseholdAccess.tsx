import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';

import './PrivateHouseholdAccess.css';

import type { PasskeyAuthStatus } from '@hearth/shared';

import { runtimeApi as hearthApi } from '../api/runtime';
import { authenticateWithPasskey, passkeysAvailable, recoverWithCode } from './passkeys';

export function PrivateHouseholdAccess({
  auth,
  onComplete,
}: {
  auth: PasskeyAuthStatus;
  onComplete: () => Promise<void>;
}) {
  const signIn = useMutation({ mutationFn: authenticateWithPasskey, onSuccess: onComplete });
  const signOut = useMutation({ mutationFn: hearthApi.signOut, onSuccess: onComplete });
  const [showRecovery, setShowRecovery] = useState(false);

  if (!auth.configured) {
    return (
      <AccessFrame title="Private access is not configured">
        <p>
          Finish Hearth’s stable private HTTPS address and passkey settings on the server first.
        </p>
      </AccessFrame>
    );
  }

  if (auth.authenticated) {
    return (
      <AccessFrame title="This account cannot open this Hearth">
        <p>The signed-in household member does not have permission to view this home.</p>
        {signOut.isError ? (
          <p className="form-message form-message--error" role="alert">
            {signOut.error.message}
          </p>
        ) : null}
        <button
          className="button button--primary"
          type="button"
          disabled={signOut.isPending}
          onClick={() => signOut.mutate()}
        >
          {signOut.isPending ? 'Signing out…' : 'Sign out and use another passkey'}
        </button>
      </AccessFrame>
    );
  }

  const available = auth.secureOrigin && passkeysAvailable();
  if (showRecovery) {
    return (
      <RecoveryAccess
        available={available}
        onCancel={() => setShowRecovery(false)}
        onComplete={onComplete}
      />
    );
  }
  return (
    <AccessFrame title="Sign in to open Hearth">
      <p>Your passkey keeps this home’s calendar, photos and family information private.</p>
      {!available ? (
        <p className="form-message form-message--error" role="alert">
          Open Hearth from its private HTTPS address on a passkey-capable device.
        </p>
      ) : null}
      {signIn.isError ? (
        <p className="form-message form-message--error" role="alert">
          {signIn.error.message}
        </p>
      ) : null}
      <button
        className="button button--primary"
        type="button"
        disabled={!available || signIn.isPending}
        onClick={() => signIn.mutate()}
      >
        {signIn.isPending ? 'Waiting for passkey…' : 'Sign in with a passkey'}
      </button>
      <button
        className="button button--quiet"
        disabled={!available}
        onClick={() => setShowRecovery(true)}
        type="button"
      >
        Use a recovery code
      </button>
    </AccessFrame>
  );
}

function RecoveryAccess({
  available,
  onCancel,
  onComplete,
}: {
  available: boolean;
  onCancel: () => void;
  onComplete: () => Promise<void>;
}) {
  const recover = useMutation({ mutationFn: recoverWithCode, onSuccess: onComplete });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    recover.mutate({
      recoveryCode: String(form.get('recoveryCode') ?? ''),
      passkeyLabel: String(form.get('passkeyLabel') ?? ''),
    });
  }

  return (
    <AccessFrame title="Recover adult access">
      <p>
        Enter the one-time code saved outside Hearth. Recovery removes the old passkeys and
        signed-in sessions for this adult, then creates a replacement passkey on this device.
      </p>
      <form className="runtime-recovery-form" onSubmit={submit}>
        <label>
          Recovery code
          <input
            autoComplete="off"
            disabled={!available || recover.isPending}
            inputMode="text"
            maxLength={64}
            name="recoveryCode"
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            required
          />
        </label>
        <label>
          New passkey name
          <input
            defaultValue="Replacement iPhone"
            disabled={!available || recover.isPending}
            maxLength={80}
            name="passkeyLabel"
            required
          />
        </label>
        {recover.isError ? (
          <p className="form-message form-message--error" role="alert">
            {recover.error.message}
          </p>
        ) : null}
        <div className="runtime-recovery-form__actions">
          <button
            className="button button--quiet"
            disabled={recover.isPending}
            onClick={onCancel}
            type="button"
          >
            Back to sign in
          </button>
          <button
            className="button button--primary"
            disabled={!available || recover.isPending}
            type="submit"
          >
            {recover.isPending ? 'Creating replacement passkey…' : 'Recover with a new passkey'}
          </button>
        </div>
      </form>
    </AccessFrame>
  );
}

function AccessFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="runtime-gate runtime-gate--setup">
      <img alt="" src="/brand/hearth-mark.png" />
      <p className="eyebrow">PRIVATE HEARTH</p>
      <h1>{title}</h1>
      {children}
    </main>
  );
}
