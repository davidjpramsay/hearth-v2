import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { phoneApi } from '../api/phoneConnections';
import type { PasskeyAuthStatus } from '@hearth/shared';
import './PhoneAccess.css';
import { connectionNavigation } from './connectionNavigation';
import { phoneInvitationFromHash } from './phoneInvitation';
import { signOutAndClear } from './signOut';

export function PhoneAccess({
  auth,
  onComplete,
  timezone = 'Australia/Perth',
  onSharedScreen,
  invitationSecret,
}: {
  auth: PasskeyAuthStatus;
  onComplete: () => Promise<void>;
  timezone?: string;
  onSharedScreen?: () => void;
  invitationSecret?: string;
}) {
  const frame = useRef<HTMLElement>(null);
  const [secret, setSecret] = useState(
    () => invitationSecret ?? phoneInvitationFromHash(window.location.hash),
  );
  const client = useQueryClient();
  const disconnect = useMutation({ mutationFn: () => signOutAndClear(client) });
  const [owner, setOwner] = useState(auth.requiresSetup);
  const pending = useQuery({
    queryKey: ['phone-pending'],
    queryFn: phoneApi.pending,
    enabled: !auth.authenticated && !auth.requiresSetup && !owner && !secret,
    refetchInterval: (query) =>
      ['waiting', 'scanned', 'approved'].includes(query.state.data?.state ?? '') ? 1500 : false,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const claim = useMutation({
    mutationFn: ({ name }: { name: string }) => phoneApi.claim(secret!, name),
    onSuccess: async () => {
      setSecret(null);
      await pending.refetch();
    },
  });
  const setup = useMutation({ mutationFn: phoneApi.ownerClaim, onSuccess: onComplete });
  const exchange = useMutation({ mutationFn: phoneApi.exchange, onSuccess: onComplete });
  useEffect(() => {
    Array.from(
      frame.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not(:disabled),summary',
      ) ?? [],
    )
      .find((node) => node.getClientRects().length > 0)
      ?.focus();
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.target instanceof Node && frame.current?.contains(event.target))
        connectionNavigation(event);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [owner, secret, pending.data?.state]);
  useLayoutEffect(() => {
    if (window.location.hash.startsWith('#connect-phone='))
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
  const error = claim.error ?? setup.error ?? exchange.error ?? pending.error;
  const state = pending.data;
  function submitOwner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setup.mutate({
      ownerKey: String(form.get('ownerKey') ?? ''),
      phoneName: String(form.get('phoneName') ?? ''),
      ...(auth.requiresSetup
        ? {
            householdName: String(form.get('householdName') ?? ''),
            adultName: String(form.get('adultName') ?? ''),
            timezone: String(form.get('timezone') ?? ''),
          }
        : {}),
    });
    (event.currentTarget.elements.namedItem('ownerKey') as HTMLInputElement).value = '';
  }

  if (auth.authenticated)
    return (
      <main ref={frame} className="runtime-gate runtime-gate--setup phone-access">
        <img alt="" src="/brand/hearth-mark.png" />
        <h1>Already connected as {auth.actor?.displayName}</h1>
        <p>
          {auth.ownerPhone
            ? 'This is the protected owner phone. Replace it only with a fresh key from the protected server file.'
            : 'A QR cannot change this phone’s account silently. Keep this connection, or disconnect only this browser and scan the QR again.'}
        </p>
        <button className="button button--primary" type="button" onClick={() => void onComplete()}>
          Keep current connection
        </button>
        {auth.ownerPhone ? null : (
          <button
            className="button button--quiet"
            type="button"
            disabled={disconnect.isPending}
            onClick={() => disconnect.mutate()}
          >
            Disconnect this phone and rescan
          </button>
        )}
        {disconnect.error ? <p role="alert">{disconnect.error.message}</p> : null}
      </main>
    );
  return (
    <main ref={frame} className="runtime-gate runtime-gate--setup phone-access">
      <img alt="" src="/brand/hearth-mark.png" />
      <h1>
        {auth.requiresSetup
          ? 'Set up Hearth'
          : secret
            ? 'Connect this phone'
            : state
              ? 'Phone connection'
              : 'Connect to Hearth'}
      </h1>
      {!auth.secureOrigin ? (
        <p role="alert">Open the trusted private HTTPS Hearth address.</p>
      ) : null}
      {secret ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            claim.mutate({
              name: String(new FormData(event.currentTarget).get('phoneName') ?? ''),
            });
          }}
        >
          <p>Request approval from the phone that showed this QR.</p>
          <label>
            Phone name
            <input name="phoneName" placeholder="Rachael’s iPhone" maxLength={80} required />
          </label>
          <button
            className="button button--primary"
            disabled={claim.isPending || !auth.secureOrigin}
            type="submit"
          >
            {claim.isPending ? 'Requesting…' : 'Request connection'}
          </button>
        </form>
      ) : owner ? (
        <form onSubmit={submitOwner}>
          <p>Use the one-time key from the private owner file. No password or passkey needed.</p>
          {!auth.requiresSetup ? (
            <p>This replaces the owner phone. Other phones and screens stay connected.</p>
          ) : null}
          {auth.requiresSetup ? (
            <>
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
                <input name="timezone" defaultValue={timezone} maxLength={80} required />
              </label>
            </>
          ) : null}
          <label>
            Phone name
            <input name="phoneName" placeholder="David’s iPhone" maxLength={80} required />
          </label>
          <label>
            Owner setup key
            <input
              name="ownerKey"
              type="password"
              autoComplete="off"
              minLength={32}
              maxLength={160}
              required
            />
          </label>
          <button
            className="button button--primary"
            disabled={setup.isPending || !auth.secureOrigin}
            type="submit"
          >
            {setup.isPending
              ? 'Connecting…'
              : auth.requiresSetup
                ? 'Create household and connect'
                : 'Connect as owner phone'}
          </button>
          {!auth.requiresSetup ? (
            <button className="button button--quiet" type="button" onClick={() => setOwner(false)}>
              Back
            </button>
          ) : null}
        </form>
      ) : state ? (
        <section aria-live="polite">
          <h2>
            {state.adultName} · {state.phoneName}
          </h2>
          {state.state === 'scanned' || state.state === 'waiting' ? (
            <p>Waiting for approval on the inviting phone.</p>
          ) : state.state === 'approved' ? (
            <>
              <p>Approved. This phone will connect as {state.adultName}.</p>
              <button
                className="button button--primary"
                disabled={exchange.isPending}
                onClick={() => exchange.mutate()}
                type="button"
              >
                {exchange.isPending ? 'Connecting…' : `Connect as ${state.adultName}`}
              </button>
            </>
          ) : state.state === 'connected' ? (
            <>
              <p>Approved connection. Finish connecting this browser.</p>
              <button
                className="button button--primary"
                onClick={() => exchange.mutate()}
                disabled={exchange.isPending}
                type="button"
              >
                Finish connecting
              </button>
            </>
          ) : (
            <p>This QR is no longer available. Ask the adult for a new QR.</p>
          )}
        </section>
      ) : (
        <>
          <p>
            On a connected adult phone, open <strong>Phones &amp; screens → Add phone</strong>. Scan
            its QR with this phone’s camera.
          </p>
          <details>
            <summary>Owner phone setup or replacement</summary>
            <p>
              The NAS owner issues a private one-time key for the first owner phone or its
              replacement. Other phones and screens stay connected.
            </p>
            <button className="button button--quiet" onClick={() => setOwner(true)} type="button">
              Use owner setup key
            </button>
          </details>
        </>
      )}
      {onSharedScreen && !secret && !state && !owner ? (
        <button className="button button--quiet" type="button" onClick={onSharedScreen}>
          Connect a shared screen instead
        </button>
      ) : null}
      {error ? (
        <p className="form-message form-message--error" role="alert">
          {error.message}
        </p>
      ) : null}
    </main>
  );
}
