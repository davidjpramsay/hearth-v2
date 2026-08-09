import { useMutation } from '@tanstack/react-query';
import { type FormEvent, type ReactNode } from 'react';

import type { PasskeyAuthStatus, RuntimeContext } from '@hearth/shared';

import { createFirstUsePasskey, passkeysAvailable } from './passkeys';

export function FirstUseSetup({
  runtime,
  auth,
  onComplete,
}: {
  runtime: RuntimeContext;
  auth: PasskeyAuthStatus;
  onComplete: () => Promise<void>;
}) {
  const setup = useMutation({
    mutationFn: createFirstUsePasskey,
    onSuccess: onComplete,
  });

  if (!auth.configured) {
    return (
      <SetupFrame title="Finish private access first">
        <p>
          Choose Hearth’s permanent private HTTPS name, then configure the relying-party name,
          matching origin and local first-use code file on the server.
        </p>
        <p className="runtime-gate__detail">
          No household or passkey has been created. This avoids tying your passkey to a temporary
          address.
        </p>
      </SetupFrame>
    );
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setup.mutate({
      setupCode: stringValue(data, 'setupCode'),
      householdName: stringValue(data, 'householdName'),
      adultName: stringValue(data, 'adultName'),
      timezone: stringValue(data, 'timezone'),
      passkeyLabel: stringValue(data, 'passkeyLabel'),
    });
  };
  const unavailable = !auth.secureOrigin || !passkeysAvailable();

  return (
    <SetupFrame title="Set up this Hearth">
      <p>
        Create the real household and its first adult administrator. Demo family data stays out.
      </p>
      <div className="first-use-tv-guidance">
        <strong>Finish setup on your iPhone</strong>
        <span>
          Open this same private Hearth address on your phone, then create the household and its
          first passkey there.
        </span>
      </div>
      <form className="first-use-form" onSubmit={submit}>
        <label>
          Household name
          <input name="householdName" defaultValue="Our home" maxLength={100} required />
        </label>
        <label>
          Your name
          <input name="adultName" autoComplete="name" maxLength={80} required />
        </label>
        <label>
          Timezone
          <input name="timezone" defaultValue={runtime.timezone} maxLength={80} required />
        </label>
        <label>
          Passkey name
          <input name="passkeyLabel" defaultValue="My iPhone" maxLength={80} required />
        </label>
        <label>
          Local first-use code
          <input
            name="setupCode"
            type="password"
            autoComplete="off"
            minLength={12}
            maxLength={160}
            required
          />
        </label>
        {unavailable ? (
          <p className="form-message form-message--error" role="alert">
            Open Hearth from its configured private HTTPS address on a passkey-capable device.
          </p>
        ) : null}
        {setup.error?.message ? (
          <p className="form-message form-message--error" role="alert">
            {setup.error.message}
          </p>
        ) : null}
        <button
          className="button button--primary"
          type="submit"
          disabled={unavailable || setup.isPending}
        >
          {setup.isPending ? 'Creating passkey…' : 'Create household and passkey'}
        </button>
      </form>
    </SetupFrame>
  );
}

function SetupFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="runtime-gate runtime-gate--setup">
      <img alt="" src="/brand/hearth-mark.png" />
      <h1>{title}</h1>
      {children}
    </main>
  );
}

function stringValue(data: FormData, name: string): string {
  const value = data.get(name);
  if (typeof value !== 'string') {
    throw new Error(`Missing ${name}`);
  }
  return value;
}
