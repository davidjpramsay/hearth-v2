import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { adminApi as hearthApi } from '../api/admin';
import { createRequestId } from '../api/core';
import { queryKeys } from '../api/queryKeys';
import { AdminError, AdminLoading, AdminPage } from '../components/AdminPage';
import { Icon } from '../components/Icon';
import { useAdminQuery } from '../hooks/useAdminQueries';

export function TelevisionsSettingsScreen() {
  const admin = useAdminQuery();
  const queryClient = useQueryClient();
  const refresh = async () => queryClient.invalidateQueries({ queryKey: queryKeys.admin });
  const approve = useMutation({
    mutationFn: (code: string) => hearthApi.approvePairing(code, createRequestId('pair_approve')),
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: (deviceId: string) =>
      hearthApi.revokeDevice(deviceId, createRequestId('device_revoke')),
    onSuccess: refresh,
  });
  if (admin.isPending) return <AdminLoading />;
  if (admin.isError) return <AdminError message={admin.error.message} />;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('code') ?? '').toUpperCase();
    approve.mutate(code);
  }

  return (
    <AdminPage title="Paired televisions" subtitle="Only approved screens can open this home">
      <div className="pair-instructions">
        <Icon name="television" />
        <div>
          <strong>On the television</strong>
          <p>Open Hearth’s pairing screen, then enter its six-character code here.</p>
        </div>
      </div>
      <form className="pair-code-form" onSubmit={submit}>
        <label htmlFor="pair-code">Pairing code</label>
        <div>
          <input
            autoCapitalize="characters"
            autoComplete="off"
            id="pair-code"
            maxLength={6}
            name="code"
            pattern="[A-Za-z0-9]{6}"
            placeholder="HEARTH"
            required
          />
          <button disabled={approve.isPending} type="submit">
            {approve.isPending ? 'Approving…' : 'Approve'}
          </button>
        </div>
      </form>
      {approve.isSuccess ? (
        <p className="save-confirmation" role="status">
          Television approved. It can now open Hearth.
        </p>
      ) : null}
      {approve.isError ? <AdminError message={approve.error.message} /> : null}
      <Link className="tv-demo-link" to="/pair">
        Open the television pairing screen for this demo
      </Link>
      <section className="device-list" aria-labelledby="connected-tvs">
        <h2 id="connected-tvs">Televisions</h2>
        {admin.data.pairedDevices.map((device) => (
          <article className="device-row" key={device.id}>
            <span className="admin-setting-row__icon">
              <Icon name="television" />
            </span>
            <div>
              <strong>{device.name}</strong>
              <span>{device.status === 'connected' ? 'Connected' : 'Revoked'}</span>
            </div>
            {device.status === 'connected' ? (
              <button
                disabled={revoke.isPending}
                onClick={() => revoke.mutate(device.id)}
                type="button"
              >
                Revoke
              </button>
            ) : null}
          </article>
        ))}
      </section>
      {revoke.isError ? <AdminError message={revoke.error.message} /> : null}
    </AdminPage>
  );
}
