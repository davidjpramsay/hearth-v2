import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { phoneApi } from '../api/phoneConnections';
import { createRequestId } from '../api/core';
import { AdminError, AdminLoading } from './AdminPage';

type CardPreview = { id: string; image: string; expiresAt: string };

export function PhoneRecoveryPanel({
  onRecoverOwner,
  onDismiss,
  initiallyOpen = false,
}: {
  onRecoverOwner: () => Promise<void>;
  onDismiss?: () => void;
  initiallyOpen?: boolean;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(initiallyOpen);
  const generation = useRef(0);
  const cardHeading = useRef<HTMLHeadingElement>(null);
  const [selection, setSelection] = useState<string[] | null>(null);
  const [card, setCard] = useState<CardPreview | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const summary = useQuery({
    queryKey: ['phone-recovery'],
    queryFn: () => phoneApi.recovery(),
    enabled: open,
    staleTime: 15_000,
    retry: false,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ['phone-recovery'] });
  const create = useMutation({
    mutationFn: async ({ requestId, view }: { requestId: string; view: number }) => {
      await phoneApi.confirm();
      const result = await phoneApi.createRecoveryCard(requestId);
      const encoder = await import('qrcode');
      const image = await encoder.toDataURL(result.qrUrl, {
        width: 512,
        margin: 4,
        errorCorrectionLevel: 'M',
      });
      return { id: result.id, expiresAt: result.expiresAt, image, view };
    },
    onSuccess: (result) => {
      if (result.view !== generation.current) {
        create.reset();
        return;
      }
      setCard({ id: result.id, expiresAt: result.expiresAt, image: result.image });
      setSaved(false);
      requestAnimationFrame(() => cardHeading.current?.focus());
    },
  });
  const activate = useMutation({
    mutationFn: ({ id, requestId }: { id: string; requestId: string }) =>
      phoneApi.activateRecoveryCard(id, requestId),
    onSuccess: async () => {
      setCard(null);
      setSaved(false);
      create.reset();
      await refresh();
    },
  });
  const trust = useMutation({
    mutationFn: async ({ ids, requestId }: { ids: string[]; requestId: string }) => {
      await phoneApi.confirm();
      return phoneApi.updateRecovery(ids, requestId);
    },
    onSuccess: async () => {
      await refresh();
      setSelection(null);
    },
  });
  const replace = useMutation({ mutationFn: onRecoverOwner });
  const error = create.error ?? activate.error ?? trust.error ?? replace.error;
  const selected =
    selection ??
    summary.data?.adults.flatMap((adult) =>
      adult.phones.filter((phone) => phone.trusted).map((phone) => phone.connectionId),
    ) ??
    [];

  return (
    <details
      open={open}
      className="phone-recovery"
      onToggle={(event) => {
        const next = event.currentTarget.open;
        setOpen(next);
        if (!next) {
          onDismiss?.();
          generation.current++;
          setCard(null);
          setSaved(false);
          create.reset();
          activate.reset();
        }
      }}
    >
      <summary>Recovery &amp; lost phones</summary>
      {open ? (
        <div className="phone-recovery__body">
          {summary.isPending ? (
            <AdminLoading />
          ) : summary.isError ? (
            <AdminError message={summary.error.message} onRetry={() => void summary.refetch()} />
          ) : !summary.data.available ? (
            <p>Connect the owner phone using the private setup card first.</p>
          ) : (
            <>
              <p>
                {summary.data.hasRecoveryCard
                  ? 'Recovery card saved.'
                  : 'No saved recovery card yet.'}
              </p>
              {summary.data.canManage ? (
                <>
                  <p>
                    Keep a recovery card somewhere other than this phone. It can replace a lost
                    owner phone without resetting Hearth.
                  </p>
                  {!card ? (
                    <button
                      className="admin-secondary"
                      type="button"
                      disabled={create.isPending}
                      onClick={() => {
                        const view = ++generation.current;
                        create.mutate({ requestId: createRequestId('phone_card'), view });
                      }}
                    >
                      {create.isPending
                        ? 'Preparing private card…'
                        : summary.data.hasRecoveryCard
                          ? 'Replace recovery card'
                          : 'Create recovery card'}
                    </button>
                  ) : (
                    <section
                      className="phone-qr phone-recovery__card"
                      aria-labelledby="recovery-card-title"
                    >
                      <h3 id="recovery-card-title" ref={cardHeading} tabIndex={-1}>
                        Your private recovery card
                      </h3>
                      <img
                        src={card.image}
                        alt="Private Hearth recovery QR. Keep this away from people you do not trust."
                      />
                      <a
                        className="admin-secondary"
                        href={card.image}
                        download="Hearth-recovery-card.png"
                      >
                        Save recovery card
                      </a>
                      <p>
                        Anyone with this card can replace the owner phone. Save it privately, then
                        confirm below within five minutes. Your previous card stays valid until this
                        one is activated.
                      </p>
                      <label className="phone-recovery__choice">
                        <input
                          type="checkbox"
                          checked={saved}
                          disabled={activate.isPending}
                          onChange={(event) => setSaved(event.target.checked)}
                        />
                        I saved this somewhere other than this phone
                      </label>
                      <button
                        className="admin-primary"
                        type="button"
                        disabled={!saved || activate.isPending}
                        onClick={() =>
                          activate.mutate(
                            activate.variables?.id === card.id
                              ? activate.variables
                              : { id: card.id, requestId: createRequestId('phone_card_activate') },
                          )
                        }
                      >
                        {activate.isPending ? 'Activating…' : 'Activate saved card'}
                      </button>
                      <button
                        className="admin-secondary"
                        type="button"
                        disabled={activate.isPending}
                        onClick={() => {
                          generation.current++;
                          setCard(null);
                          setSaved(false);
                          create.reset();
                          activate.reset();
                        }}
                      >
                        Discard this preview
                      </button>
                    </section>
                  )}
                  <form
                    className="phone-recovery__trust"
                    onSubmit={(event) => {
                      event.preventDefault();
                      trust.mutate(
                        trust.variables &&
                          JSON.stringify(trust.variables.ids) === JSON.stringify(selected)
                          ? trust.variables
                          : { ids: selected, requestId: createRequestId('phone_recovery_trust') },
                      );
                    }}
                  >
                    <fieldset disabled={trust.isPending}>
                      <legend>Phones trusted for recovery</legend>
                      {summary.data.adults.length ? (
                        summary.data.adults.flatMap((adult) =>
                          adult.phones.length
                            ? adult.phones.map((phone) => (
                                <label className="phone-recovery__choice" key={phone.connectionId}>
                                  <input
                                    type="checkbox"
                                    checked={selected.includes(phone.connectionId)}
                                    onChange={(event) =>
                                      setSelection(
                                        event.target.checked
                                          ? [...selected, phone.connectionId]
                                          : selected.filter((id) => id !== phone.connectionId),
                                      )
                                    }
                                  />
                                  <span>
                                    {phone.phoneName} · {adult.displayName}
                                  </span>
                                </label>
                              ))
                            : [
                                <p key={adult.memberId}>
                                  Connect {adult.displayName}’s own phone first
                                </p>,
                              ],
                        )
                      ) : (
                        <p>Add another adult and connect their phone first.</p>
                      )}
                    </fieldset>
                    {summary.data.adults.length ? (
                      <button
                        className="admin-secondary"
                        type="submit"
                        disabled={selection === null || trust.isPending}
                      >
                        {trust.isPending ? 'Saving…' : 'Save trusted phones'}
                      </button>
                    ) : null}
                  </form>
                </>
              ) : (
                <p>The owner phone chooses recovery adults and saves the private recovery card.</p>
              )}
              {summary.data.canRecoverOwner ? (
                <div className="phone-recovery__replace">
                  <p>
                    Only use this if {summary.data.ownerName}’s owner phone is lost or being
                    replaced. The old owner connection will be disconnected; your phone stays
                    connected as you.
                  </p>
                  <button
                    className="admin-secondary"
                    disabled={replace.isPending}
                    type="button"
                    onClick={() => replace.mutate()}
                  >
                    {replace.isPending
                      ? 'Preparing…'
                      : `Replace ${summary.data.ownerName}’s lost phone`}
                  </button>
                </div>
              ) : null}
            </>
          )}
          {error ? <AdminError message={error.message} /> : null}
        </div>
      ) : null}
    </details>
  );
}
