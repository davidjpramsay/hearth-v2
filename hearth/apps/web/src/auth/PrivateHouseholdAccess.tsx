import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import './PrivateHouseholdAccess.css';

import type { PasskeyAuthStatus } from '@hearth/shared';

import { signOutAndClear } from './signOut';
import { BrowserTelevisionPairing } from './BrowserTelevisionPairing';
import { authenticateWithPasskey, passkeysAvailable, recoverWithCode } from './passkeys';
import { connectionNavigation } from './connectionNavigation';
import { Icon } from '../components/Icon';

export function PrivateHouseholdAccess({
  auth,
  onComplete,
}: {
  auth: PasskeyAuthStatus;
  onComplete: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const signIn = useMutation({ mutationFn: authenticateWithPasskey, onSuccess: onComplete });
  const signOut = useMutation({ mutationFn: () => signOutAndClear(queryClient) });
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
        <p>This household member does not have access.</p>
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
    <AccessFrame title="Connect to Hearth">
      <p>How will you use this device?</p>
      <div className="connection-choices">
        <section className="connection-choice" aria-labelledby="personal-device-title">
          <Icon name="shield" />
          <h2 id="personal-device-title">Phone or computer</h2>
          <p>
            Adult control. Sign in as yourself with your Hearth passkey. No TV connection code is
            needed.
          </p>
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
        </section>
        <BrowserTelevisionPairing onComplete={onComplete} />
      </div>
      <details className="connection-sign-in-help">
        <summary>Trouble signing in?</summary>
        <p>
          On a new device, choose your saved Hearth passkey. For another adult, an existing
          household controller can help save a new passkey on that adult’s phone from Phones &amp;
          screens → Manage adult sign-in. Do not connect a controller phone as a shared screen.
        </p>
        <button
          className="button button--quiet"
          disabled={!available}
          onClick={() => setShowRecovery(true)}
          type="button"
        >
          Use a recovery code
        </button>
        <p>
          Recovery is for lost access. It replaces that adult’s old passkeys and sessions, not a
          normal new-phone setup.
        </p>
      </details>
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
        Enter the saved one-time code. This removes this adult’s old passkeys and sessions, then
        creates a new passkey here.
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
            defaultValue="Replacement device"
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
  const frame = useRef<HTMLElement | null>(null);
  useEffect(() => {
    frame.current
      ?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled)')
      ?.focus();
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.target instanceof Node && frame.current?.contains(event.target)) {
        connectionNavigation(event);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);
  return (
    <main ref={frame} className="runtime-gate runtime-gate--setup connection-entry">
      <img alt="" src="/brand/hearth-mark.png" />
      <h1>{title}</h1>
      {children}
    </main>
  );
}
