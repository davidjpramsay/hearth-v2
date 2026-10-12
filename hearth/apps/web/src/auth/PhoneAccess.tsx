import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { phoneApi } from '../api/phoneConnections';
import type { PasskeyAuthStatus } from '@hearth/shared';
import './PhoneAccess.css';
import { connectionNavigation } from './connectionNavigation';
import {
  phoneInvitationFromHash,
  privatePhoneIntentFromHash,
  stripPhoneIntentFragment,
  type PrivatePhoneIntent,
} from './phoneInvitation';
import { createRequestId } from '../api/core';
import { signOutAndClear } from './signOut';

export function PhoneAccess({
  auth,
  onComplete,
  timezone = 'Australia/Perth',
  onSharedScreen,
  invitationSecret,
  privateIntent: suppliedPrivateIntent,
  onOwnerConnected,
}: {
  auth: PasskeyAuthStatus;
  onComplete: () => Promise<void>;
  timezone?: string;
  onSharedScreen?: () => void;
  invitationSecret?: string;
  privateIntent?: PrivatePhoneIntent;
  onOwnerConnected?: () => Promise<void>;
}) {
  const frame = useRef<HTMLElement>(null);
  const [secret, setSecret] = useState(
    () => invitationSecret ?? phoneInvitationFromHash(window.location.hash),
  );
  const [privateIntent, setPrivateIntent] = useState(
    () => suppliedPrivateIntent ?? privatePhoneIntentFromHash(window.location.hash),
  );
  const client = useQueryClient();
  const disconnect = useMutation({ mutationFn: () => signOutAndClear(client) });
  const [owner, setOwner] = useState(auth.requiresSetup);
  const pending = useQuery({
    queryKey: ['phone-pending'],
    queryFn: phoneApi.pending,
    enabled: !auth.authenticated && !auth.requiresSetup && !owner && !secret && !privateIntent,
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
  const setup = useMutation({
    mutationFn: phoneApi.ownerClaim,
    onSuccess: onOwnerConnected ?? onComplete,
  });
  const exchange = useMutation({
    mutationFn: phoneApi.exchange,
    onSuccess: async () => {
      if (pending.data?.purpose === 'recover-owner' && onOwnerConnected) await onOwnerConnected();
      else await onComplete();
    },
  });
  const recovery = useMutation({
    mutationFn: phoneApi.recoverWithCard,
    onSuccess: onOwnerConnected ?? onComplete,
  });
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
  }, [owner, secret, privateIntent?.purpose, pending.data?.state]);
  useLayoutEffect(() => {
    stripPhoneIntentFragment();
  }, []);
  const error = claim.error ?? setup.error ?? exchange.error ?? recovery.error ?? pending.error;
  const state = pending.data;
  function submitOwner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setup.mutate({
      ownerKey:
        privateIntent?.purpose === 'setup'
          ? privateIntent.secret
          : String(form.get('ownerKey') ?? ''),
      phoneName: String(form.get('phoneName') ?? ''),
      ...(auth.requiresSetup
        ? {
            householdName: String(form.get('householdName') ?? ''),
            adultName: String(form.get('adultName') ?? ''),
            timezone: String(form.get('timezone') ?? ''),
          }
        : {}),
    });
    const key = event.currentTarget.elements.namedItem('ownerKey');
    if (key instanceof HTMLInputElement) key.value = '';
  }

  if (auth.authenticated)
    return (
      <main ref={frame} className="runtime-gate runtime-gate--setup phone-access">
        <img alt="" src="/brand/hearth-mark.png" />
        <h1>Already connected as {auth.actor?.displayName}</h1>
        <p>
          {auth.ownerPhone
            ? 'This is the protected owner phone. Keep it connected. Lost-phone replacement is a separate recovery action.'
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
          : privateIntent?.purpose === 'recovery'
            ? 'Recover Hearth'
            : secret
              ? 'Connect this phone'
              : state
                ? 'Phone connection'
                : 'Connect to Hearth'}
      </h1>
      {!auth.secureOrigin ? (
        <p role="alert">Open the trusted private HTTPS Hearth address.</p>
      ) : null}
      {privateIntent?.purpose === 'setup' && !auth.requiresSetup ? (
        <section>
          <h2>This Hearth is already set up</h2>
          <p>
            A first-setup card cannot replace the owner phone. Use a saved recovery card or ask a
            trusted adult.
          </p>
          <button
            className="button button--quiet"
            type="button"
            onClick={() => {
              setPrivateIntent(null);
              setOwner(false);
            }}
          >
            Back to connection options
          </button>
        </section>
      ) : privateIntent?.purpose === 'recovery' && auth.requiresSetup ? (
        <section>
          <h2>This Hearth has no household to recover</h2>
          <p>
            A recovery card cannot create a fresh household. Scan its private setup card instead.
          </p>
        </section>
      ) : privateIntent?.purpose === 'recovery' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            recovery.mutate(
              recovery.variables ?? {
                requestId: createRequestId('phone_card_recovery'),
                recoverySecret: privateIntent.secret,
                phoneName: String(new FormData(event.currentTarget).get('phoneName') ?? ''),
              },
            );
          }}
        >
          <h2>Replace the lost owner phone</h2>
          <p>
            This connects your replacement phone and disconnects the old owner phone. Other phones,
            screens and household data stay.
          </p>
          <label>
            Replacement phone name
            <input
              name="phoneName"
              placeholder="David’s new iPhone"
              maxLength={80}
              required
              disabled={recovery.isPending || recovery.isError}
            />
          </label>
          <button
            className="button button--primary"
            type="submit"
            disabled={recovery.isPending || !auth.secureOrigin}
          >
            {recovery.isPending
              ? 'Recovering…'
              : recovery.isError
                ? 'Retry this recovery'
                : 'Replace lost owner phone'}
          </button>
          <button
            className="button button--quiet"
            type="button"
            disabled={recovery.isPending}
            onClick={() => {
              recovery.reset();
              setPrivateIntent(null);
              setOwner(false);
            }}
          >
            Back to connection options
          </button>
        </form>
      ) : secret ? (
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
          <p>
            {privateIntent?.purpose === 'setup'
              ? 'Setup card recognised. Name your home and connect this phone.'
              : 'Use the one-time key from the private owner file. No password or passkey needed.'}
          </p>
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
          {privateIntent?.purpose === 'setup' ? null : (
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
          )}
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
              {state.purpose === 'recover-owner' ? (
                <p>
                  The old owner phone will be disconnected. This is a replacement, not another
                  shared login.
                </p>
              ) : null}
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
          <details>
            <summary>Lost the owner phone?</summary>
            <p>
              Scan your saved Hearth recovery card on the replacement phone, or ask an adult you
              previously trusted for recovery to show a replacement QR.
            </p>
          </details>
        </>
      )}
      {onSharedScreen && !secret && !state && !owner && !privateIntent ? (
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
