import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { createRequestId } from '../api/core';
import { pairingApi as hearthApi } from '../api/pairing';
import { Icon } from '../components/Icon';

export function PairingScreen() {
  const [requestId, setRequestId] = useState(() => createRequestId('tv_pair'));
  const request = useQuery({
    queryKey: ['pairing-create', requestId],
    queryFn: () => hearthApi.createPairing('Living room TV', requestId),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const status = useQuery({
    queryKey: ['pairing-status', request.data?.id],
    queryFn: () => hearthApi.getPairing(request.data?.id ?? 'pairing_missing'),
    enabled: request.data !== undefined,
    refetchInterval: (query) => (query.state.data?.status === 'pending' ? 1_000 : false),
  });
  const pairing = status.data ?? request.data;

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
        <p>
          {approved
            ? 'Maya approved this screen for the Hearth Demo Home.'
            : 'On your phone, open Hearth → More → Pair a television'}
        </p>
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
            <p className="pairing-expiry">This code expires in under 10 minutes</p>
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
        <strong>{approved ? 'Approved and ready' : 'Waiting for an adult’s approval…'}</strong>
        <Link to="/today">
          <Icon name="chevron-left" /> Back · Cancel
        </Link>
      </footer>
    </section>
  );
}
