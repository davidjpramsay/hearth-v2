import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { PasskeyAuthStatus } from '@hearth/shared';

import { runtimeApi as hearthApi } from '../api/runtime';
import { authenticateWithPasskey, passkeysAvailable } from './passkeys';

export function PrivateHouseholdAccess({
  auth,
  onComplete,
}: {
  auth: PasskeyAuthStatus;
  onComplete: () => Promise<void>;
}) {
  const signIn = useMutation({ mutationFn: authenticateWithPasskey, onSuccess: onComplete });
  const signOut = useMutation({ mutationFn: hearthApi.signOut, onSuccess: onComplete });

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
