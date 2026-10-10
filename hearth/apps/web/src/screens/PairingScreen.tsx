import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { createRequestId } from '../api/core';
import { pairingApi as hearthApi } from '../api/pairing';
import { Icon } from '../components/Icon';
import { ScreenConnectionSteps } from '../components/ScreenConnectionSteps';
import { useHearthRuntime } from '../runtime/context';
import { useSharedScreen } from '../runtime/sharedScreen';

export function PairingScreen() {
  const runtime = useHearthRuntime();
  const sharedScreen = useSharedScreen();
  const [requestId, setRequestId] = useState(() => createRequestId('tv_pair'));
  const request = useQuery({
    queryKey: ['pairing-create', requestId],
    queryFn: () => hearthApi.createPairing('Living room TV', requestId),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
    enabled: runtime.mode === 'demo' && !sharedScreen,
  });
  const status = useQuery({
    queryKey: ['pairing-status', request.data?.id],
    queryFn: () => hearthApi.getPairing(request.data?.id ?? 'pairing_missing'),
    enabled: runtime.mode === 'demo' && !sharedScreen && request.data !== undefined,
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 1_000 : false),
  });
  const pairing = status.data ?? request.data;
  if (sharedScreen) return <Navigate replace to="/today" />;

  if (runtime.mode !== 'demo') {
    return (
      <section className="pairing-screen">
        <div className="pairing-card">
          <h1>Connect a shared screen</h1>
          <p>Open Hearth on that screen while signed out, then choose Connect shared screen.</p>
          <Link
            className="pairing-primary focusable"
            data-focus-entry="true"
            data-focus-id="pair-continue"
            to="/admin/televisions"
          >
            Phones &amp; screens
          </Link>
        </div>
      </section>
    );
  }

  if (request.isPending) {
    return (
      <div className="pairing-loading" role="status">
        Preparing a private pairing code…
      </div>
    );
  }
  if (request.isError || pairing === undefined) {
    return (
      <div className="pairing-loading pairing-loading--error" role="alert">
        Hearth couldn’t create a pairing code.
      </div>
    );
  }
  const approved = pairing.status === 'approved';
  return (
    <section className="pairing-screen">
      <header className="pairing-brand">
        <img alt="" src="/brand/hearth-mark.png" />
        <strong>Hearth</strong>
      </header>
      <div className={`pairing-card${approved ? ' pairing-card--approved' : ''}`}>
        {approved ? <Icon name="check" /> : null}
        <h1>{approved ? 'Television connected' : 'Connect this television'}</h1>
        {approved ? <p>This demo screen is approved.</p> : <ScreenConnectionSteps />}
        {approved ? null : (
          <div aria-label={`Pairing code ${pairing.code}`} className="pairing-code">
            {pairing.code.split('').map((character, index) => (
              <span key={`${character}-${index}`}>{character}</span>
            ))}
          </div>
        )}
        {approved ? (
          <Link
            className="pairing-primary focusable"
            data-focus-entry="true"
            data-focus-id="pair-continue"
            to="/today"
          >
            Continue to Hearth
          </Link>
        ) : (
          <>
            <p className="pairing-expiry">Expires in under 10 minutes</p>
            <button
              className="pairing-primary focusable"
              data-focus-entry="true"
              data-focus-id="pair-new-code"
              onClick={() => setRequestId(createRequestId('tv_pair'))}
              type="button"
            >
              Get a new code
            </button>
          </>
        )}
      </div>
      <footer className="pairing-footer">
        <span className={`pairing-pulse${approved ? ' pairing-pulse--approved' : ''}`} />
        <strong>{approved ? 'Ready' : 'Waiting for approval…'}</strong>
        <Link to="/today">
          <Icon name="chevron-left" /> Cancel
        </Link>
      </footer>
    </section>
  );
}
