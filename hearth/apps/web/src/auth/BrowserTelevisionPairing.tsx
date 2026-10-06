import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { createRequestId } from '../api/core';
import { pairingApi as hearthApi } from '../api/pairing';
import { Icon } from '../components/Icon';
import { ScreenConnectionSteps } from '../components/ScreenConnectionSteps';
import { connectionNavigation } from './connectionNavigation';

export function BrowserTelevisionPairing({ onComplete }: { onComplete: () => Promise<void> }) {
  const pairingSecret = useRef<string | null>(null);
  const completed = useRef(false);
  const backButton = useRef<HTMLButtonElement | null>(null);
  const entryButton = useRef<HTMLButtonElement | null>(null);
  const generation = useRef(0);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [active, setActive] = useState(false);
  useEffect(
    () => () => {
      generation.current++;
      pairingSecret.current = null;
    },
    [],
  );
  const start = useMutation({
    mutationFn: async (attempt: number) => {
      const secret = createPairingSecret();
      pairingSecret.current = secret;
      const session = await hearthApi.createBrowserTelevisionSession(
        browserDeviceName(),
        createRequestId('browser_tv_pair'),
        secret,
      );
      return {
        attempt,
        pairing: session.pairing,
        exchangeRequestId: createRequestId('browser_tv_exchange'),
      };
    },
    onError: (_error, attempt) => {
      if (attempt === generation.current) pairingSecret.current = null;
    },
  });
  const session = start.data?.attempt === attempt ? start.data : undefined;

  const status = useQuery({
    queryKey: ['browser-television-pairing', session?.pairing.id],
    queryFn: async () => {
      if (session === undefined) throw new Error('The pairing session has not started.');
      const pairing = await hearthApi.getPairing(session.pairing.id);
      if (session.attempt !== generation.current) throw new Error('This connection was cancelled.');
      if (pairing.status !== 'approved') return { pairing, device: null };
      const secret = pairingSecret.current;
      if (secret === null) throw new Error('The private pairing session was interrupted.');
      const device = await hearthApi.exchangeBrowserTelevisionCredential(
        pairing.id,
        session.exchangeRequestId,
        secret,
      );
      if (session.attempt !== generation.current) throw new Error('This connection was cancelled.');
      pairingSecret.current = null;
      return { pairing, device };
    },
    enabled: active && session !== undefined,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      query.state.status !== 'error' &&
      (query.state.data?.pairing.status === 'pending' || query.state.data === undefined)
        ? 1_000
        : false,
  });

  useEffect(() => {
    if (!active || session === undefined || status.data?.device == null || completed.current) {
      return;
    }
    completed.current = true;
    void onComplete();
  }, [active, onComplete, session, status.data?.device]);

  useEffect(() => {
    if (!active) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    backButton.current?.focus();
    return () => dialog?.close();
  }, [active]);

  const retry = () => {
    pairingSecret.current = null;
    completed.current = false;
    start.reset();
    const next = ++generation.current;
    setAttempt(next);
    start.mutate(next);
  };
  const begin = () => {
    setActive(true);
    const next = ++generation.current;
    setAttempt(next);
    start.mutate(next);
  };
  const cancel = () => {
    setAttempt(++generation.current);
    pairingSecret.current = null;
    completed.current = false;
    start.reset();
    setActive(false);
    requestAnimationFrame(() => entryButton.current?.focus());
  };
  const pairing = session === undefined ? undefined : (status.data?.pairing ?? session.pairing);
  const error = start.error ?? (session === undefined ? null : status.error);

  if (!active) {
    return (
      <section className="connection-choice" aria-labelledby="shared-device-title">
        <Icon name="television" />
        <h2 id="shared-device-title">Shared screen</h2>
        <p>A TV or wall tablet. An adult approves it from their phone. No settings access.</p>
        <button
          ref={entryButton}
          className="button button--secondary"
          onClick={begin}
          type="button"
        >
          Connect shared screen
        </button>
      </section>
    );
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby="screen-connect-title"
      className="runtime-gate runtime-gate--setup browser-tv-pairing-overlay"
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
      onKeyDown={(event) => {
        if (['Escape', 'BrowserBack', 'GoBack'].includes(event.key)) {
          event.preventDefault();
          cancel();
        } else connectionNavigation(event);
      }}
    >
      <img alt="" src="/brand/hearth-mark.png" />
      <h1 id="screen-connect-title">Connect this screen</h1>
      {pairing === undefined && error === null ? (
        <p role="status">Getting a connection code…</p>
      ) : null}
      {error === null && pairing !== undefined ? (
        <section className="browser-tv-pairing" aria-label="Screen connection">
          <ScreenConnectionSteps />
          <code className="screen-connection-address">{window.location.origin}</code>
          {pairing.status === 'pending' ? (
            <div aria-label={`Pairing code ${pairing.code}`} className="browser-tv-pairing__code">
              {pairing.code.split('').map((character, index) => (
                <span key={`${character}-${index}`}>{character}</span>
              ))}
            </div>
          ) : null}
          <p className="browser-tv-pairing__status" role="status">
            {pairing.status === 'approved'
              ? 'Connected. Opening Hearth…'
              : pairing.status === 'expired'
                ? 'Code expired. Get a new code to try again.'
                : 'Waiting for your phone…'}
          </p>
        </section>
      ) : null}
      {error === null ? null : (
        <p className="form-message form-message--error" role="alert">
          {error.message}
        </p>
      )}
      <div className="browser-tv-pairing__actions">
        {error !== null || pairing?.status === 'expired' ? (
          <button className="button button--primary" type="button" onClick={retry}>
            Get a new code
          </button>
        ) : null}
        <button ref={backButton} className="button button--quiet" type="button" onClick={cancel}>
          Cancel connection
        </button>
      </div>
    </dialog>,
    globalThis.document.body,
  );
}

function createPairingSecret(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function browserDeviceName(): string {
  return /Tizen|SMART-TV/i.test(globalThis.navigator.userAgent)
    ? 'Samsung television browser'
    : 'Shared screen';
}
