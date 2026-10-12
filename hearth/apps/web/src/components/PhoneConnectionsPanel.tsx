import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { PhoneInvitationReveal } from '@hearth/shared';
import { phoneApi } from '../api/phoneConnections';
import { createRequestId, HearthApiError } from '../api/core';
import { clearIdentityAndReload } from '../auth/signOut';
import { AdminError, AdminLoading } from './AdminPage';
import './PhoneConnectionsPanel.css';
import { PhoneRecoveryPanel } from './PhoneRecoveryPanel';

export function PhoneConnectionsPanel() {
  const qrPanel = useRef<HTMLElement>(null);
  const recoveryView = useRef(0);
  useEffect(
    () => () => {
      recoveryView.current++;
    },
    [],
  );
  const client = useQueryClient();
  const phones = useQuery({ queryKey: ['phone-connections'], queryFn: phoneApi.list });
  const [invite, setInvite] = useState<PhoneInvitationReveal | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const status = useQuery({
    queryKey: ['phone-invitation', invite?.id],
    queryFn: () => phoneApi.invitation(invite!.id),
    enabled: invite !== null,
    refetchInterval: (q) =>
      ['waiting', 'scanned', 'approved'].includes(q.state.data?.state ?? 'waiting') ? 1500 : false,
    refetchIntervalInBackground: false,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ['phone-connections'] });
  const create = useMutation({
    mutationFn: (memberId: string) =>
      phoneApi.createInvitation(memberId, createRequestId('phone_invite')),
    onSuccess: async (result) => {
      setInvite(result);
      setQrError(null);
      setQr(null);
      try {
        const encoder = await import('qrcode');
        setQr(
          await encoder.toDataURL(result.qrUrl, {
            width: 280,
            margin: 3,
            errorCorrectionLevel: 'M',
          }),
        );
        requestAnimationFrame(() =>
          qrPanel.current?.scrollIntoView({ block: 'center', behavior: 'auto' }),
        );
      } catch {
        setQrError('Could not draw this QR. Cancel it and try again.');
      }
    },
  });
  async function recoverOwner() {
    const view = ++recoveryView.current;
    await phoneApi.confirm();
    const result = await phoneApi.createRecoveryInvitation(createRequestId('phone_owner_recover'));
    if (view !== recoveryView.current) {
      await phoneApi.cancel(result.id);
      return;
    }
    setInvite(result);
    setQrError(null);
    setQr(null);
    const encoder = await import('qrcode');
    const image = await encoder.toDataURL(result.qrUrl, {
      width: 280,
      margin: 3,
      errorCorrectionLevel: 'M',
    });
    if (view !== recoveryView.current) return;
    setQr(image);
    requestAnimationFrame(() =>
      qrPanel.current?.scrollIntoView({ block: 'center', behavior: 'auto' }),
    );
  }
  const approve = useMutation({
    mutationFn: () => phoneApi.approve(invite!.id),
    onSuccess: async (result) => {
      client.setQueryData(['phone-invitation', invite!.id], result);
      await refresh();
    },
  });
  const cancel = useMutation({
    mutationFn: () => phoneApi.cancel(invite!.id),
    onSuccess: () => {
      setInvite(null);
      setQr(null);
      setAdding(false);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => phoneApi.remove(id, createRequestId('phone_remove')),
    onSuccess: async (result) => {
      setRemoving(null);
      if (result.current) await clearIdentityAndReload(client, '/');
      else await refresh();
    },
    onError: async (error) => {
      if (error instanceof HearthApiError && error.payload.error.code === 'UNAUTHENTICATED')
        await clearIdentityAndReload(client, '/');
    },
  });
  if (phones.isPending) return <AdminLoading />;
  if (phones.isError)
    return <AdminError message={phones.error.message} onRetry={() => void phones.refetch()} />;
  const state = status.data ?? invite;
  const error = create.error ?? approve.error ?? cancel.error ?? remove.error ?? status.error;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate(String(new FormData(event.currentTarget).get('adult') ?? ''));
  }
  return (
    <section className="phone-connections" aria-labelledby="connected-phones-title">
      <header>
        <h2 id="connected-phones-title">Adult phones</h2>
        <button
          className="admin-primary"
          disabled={adding || invite !== null}
          onClick={() => setAdding(true)}
          type="button"
        >
          Add phone
        </button>
      </header>
      <div className="phone-connections__list">
        {phones.data.connections.map((phone) => (
          <article className="phone-connection" key={phone.id}>
            <div>
              <strong>
                {phone.phoneName}
                {phone.current ? ' · this phone' : ''}
              </strong>
              <span>
                {phone.adultName} · {phone.source === 'owner' ? 'owner phone' : 'adult controller'}
              </span>
              <small>
                {phone.source === 'legacy' ? 'Earlier browser · ' : ''}Last contact{' '}
                {new Date(phone.lastSeenAt).toLocaleString('en-AU')}
              </small>
            </div>
            {phone.source === 'owner' ? (
              <small className="phone-connection__protected">Protected owner phone</small>
            ) : removing === phone.id ? (
              <div className="phone-connection__confirm">
                <p>Remove {phone.phoneName}? Other phones and screens stay connected.</p>
                <button type="button" onClick={() => setRemoving(null)}>
                  Keep
                </button>
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(phone.id)}
                >
                  Remove phone
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="admin-secondary"
                aria-label={`Remove ${phone.phoneName}`}
                onClick={() => setRemoving(phone.id)}
              >
                Remove
              </button>
            )}
          </article>
        ))}
      </div>
      <PhoneRecoveryPanel
        initiallyOpen={new URLSearchParams(window.location.search).get('recovery') === '1'}
        onRecoverOwner={recoverOwner}
        onDismiss={() => {
          recoveryView.current++;
          if (invite?.purpose === 'recover-owner') {
            void phoneApi.cancel(invite.id).catch(() => undefined);
            setInvite(null);
            setQr(null);
          }
        }}
      />
      {adding && !invite ? (
        <form className="phone-add" onSubmit={submit}>
          <label>
            Whose phone?
            <select name="adult" required defaultValue="">
              <option value="" disabled>
                Choose an adult
              </option>
              {phones.data.adults.map((adult) => (
                <option key={adult.id} value={adult.id}>
                  {adult.displayName}
                </option>
              ))}
            </select>
          </label>
          <p>Show the QR to that adult, then approve their phone here.</p>
          <button className="admin-primary" disabled={create.isPending} type="submit">
            {create.isPending ? 'Creating…' : 'Show connection QR'}
          </button>
          <button className="admin-secondary" type="button" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      ) : null}
      {invite && state ? (
        <section ref={qrPanel} className="phone-qr" aria-live="polite">
          <h3>{state.adultName}’s phone</h3>
          {state.purpose === 'recover-owner' ? (
            <p>
              Owner-phone replacement: the old owner phone will be disconnected after the new phone
              connects.
            </p>
          ) : null}
          {state.state === 'waiting' ? (
            <>
              <p>Scan with {state.adultName}’s phone camera.</p>
              {qr ? (
                <img
                  alt={`Connection QR for ${state.adultName}; expires in five minutes`}
                  src={qr}
                />
              ) : (
                <p>Preparing QR…</p>
              )}
            </>
          ) : state.state === 'scanned' ? (
            <>
              <p>
                <strong>{state.phoneName}</strong> wants to connect as{' '}
                <strong>{state.adultName}</strong>.
              </p>
              <button
                className="admin-primary"
                disabled={approve.isPending}
                onClick={() => approve.mutate()}
                type="button"
              >
                {approve.isPending ? 'Approving…' : `Approve ${state.adultName}’s phone`}
              </button>
            </>
          ) : state.state === 'approved' ? (
            <p>Approved. Tap Connect on {state.adultName}’s phone.</p>
          ) : state.state === 'connected' ? (
            <>
              <p>Phone connected.</p>
              <button
                className="admin-primary"
                type="button"
                onClick={() => {
                  setInvite(null);
                  setQr(null);
                  setAdding(false);
                  void refresh();
                }}
              >
                Done
              </button>
            </>
          ) : (
            <p>This QR expired or was cancelled. Create a new QR.</p>
          )}
          {state.state !== 'connected' ? (
            <button
              className="admin-secondary"
              disabled={cancel.isPending}
              type="button"
              onClick={() => cancel.mutate()}
            >
              Cancel QR
            </button>
          ) : null}
        </section>
      ) : null}
      {qrError ? <p role="alert">{qrError}</p> : null}
      {error ? <AdminError message={error.message} /> : null}
    </section>
  );
}
