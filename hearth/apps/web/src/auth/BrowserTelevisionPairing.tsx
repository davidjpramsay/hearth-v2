import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { createRequestId } from '../api/core';
import { pairingApi as hearthApi } from '../api/pairing';

export function BrowserTelevisionPairing({ onComplete }: { onComplete: () => Promise<void> }) {
  const pairingSecret = useRef<string | null>(null);
  const completed = useRef(false);
  const backButton = useRef<HTMLButtonElement | null>(null);
  const [active, setActive] = useState(false);
  const start = useMutation({
    mutationFn: async () => {
      const secret = createPairingSecret();
      pairingSecret.current = secret;
      const session = await hearthApi.createBrowserTelevisionSession(
        browserDeviceName(),
        createRequestId('browser_tv_pair'),
        secret,
      );
      return {
        pairing: session.pairing,
        exchangeRequestId: createRequestId('browser_tv_exchange'),
      };
    },
    onError: () => {
      pairingSecret.current = null;
    },
  });

  const status = useQuery({
    queryKey: ['browser-television-pairing', start.data?.pairing.id],
    queryFn: async () => {
      if (start.data === undefined) throw new Error('The pairing session has not started.');
      const pairing = await hearthApi.getPairing(start.data.pairing.id);
      if (pairing.status !== 'approved') return { pairing, device: null };
      const secret = pairingSecret.current;
      if (secret === null) throw new Error('The private pairing session was interrupted.');
      const device = await hearthApi.exchangeBrowserTelevisionCredential(
        pairing.id,
        start.data.exchangeRequestId,
        secret,
      );
      pairingSecret.current = null;
      return { pairing, device };
    },
    enabled: start.data !== undefined,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.pairing.status === 'pending' || query.state.data === undefined
        ? 1_000
        : false,
  });

  useEffect(() => {
    if (status.data?.device === null || status.data?.device === undefined || completed.current) {
      return;
    }
    completed.current = true;
    void onComplete();
  }, [onComplete, status.data?.device]);

  useEffect(() => {
    if (active) backButton.current?.focus();
  }, [active]);

  const retry = () => {
    pairingSecret.current = null;
    completed.current = false;
    start.reset();
    start.mutate();
  };
  const begin = () => {
    setActive(true);
    start.mutate();
  };
  const cancel = () => {
    pairingSecret.current = null;
    completed.current = false;
    start.reset();
    setActive(false);
  };
  const pairing = status.data?.pairing ?? start.data?.pairing;
  const error = start.error ?? status.error;

  if (!active) {
    return (
      <div className="browser-tv-pairing-entry">
        <strong>Television browser</strong>
        <span>Pair without giving the screen admin access.</span>
        <button className="button button--secondary" onClick={begin} type="button">
          Pair this screen as a television
        </button>
      </div>
    );
  }

  return createPortal(
    <main className="runtime-gate runtime-gate--setup browser-tv-pairing-overlay">
      <img alt="" src="/brand/hearth-mark.png" />
      <h1>Connect this screen</h1>
      {pairing === undefined && error === null ? (
        <p role="status">Creating a private television pairing code…</p>
      ) : null}
      {error === null && pairing !== undefined ? (
        <section className="browser-tv-pairing" aria-labelledby="browser-tv-pairing-instructions">
          <p id="browser-tv-pairing-instructions">
            On your phone, open <strong>More → Televisions</strong> and approve this code.
          </p>
          <div aria-label={`Pairing code ${pairing.code}`} className="browser-tv-pairing__code">
            {pairing.code.split('').map((character, index) => (
              <span key={`${character}-${index}`}>{character}</span>
            ))}
          </div>
          <p className="browser-tv-pairing__status" role="status">
            {pairing.status === 'approved'
              ? 'Approved. Opening Hearth…'
              : pairing.status === 'expired'
                ? 'This code has expired.'
                : 'Waiting for approval…'}
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
        <button
          ref={backButton}
          className="button button--quiet"
          type="button"
          onClick={cancel}
          onKeyDown={(event) => {
            if (['Escape', 'BrowserBack', 'GoBack'].includes(event.key)) {
              event.preventDefault();
              cancel();
            }
          }}
        >
          Back to sign in
        </button>
      </div>
    </main>,
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
  return /Tizen|SMART-TV|SamsungBrowser/i.test(globalThis.navigator.userAgent)
    ? 'Samsung television browser'
    : 'Browser television';
}
