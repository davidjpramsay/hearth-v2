import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import './TelevisionsSettingsScreen.css';

import { adminApi as hearthApi } from '../api/admin';
import { queryKeys } from '../api/queryKeys';
import { AdminError, AdminPage, AdminQueryState } from '../components/AdminPage';
import { Icon } from '../components/Icon';
import { useAdminQuery } from '../hooks/useAdminQueries';
import { useCommandMutation } from '../hooks/useCommandMutation';
import { useHearthRuntime } from '../runtime/context';

export function TelevisionsSettingsScreen() {
  const runtime = useHearthRuntime();
  const admin = useAdminQuery();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [confirmRemoval, setConfirmRemoval] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const refresh = async () => queryClient.invalidateQueries({ queryKey: queryKeys.admin });
  const approve = useCommandMutation('pair_approve', {
    mutationFn: (code: string, requestId) => hearthApi.approvePairing(code, requestId),
    onSuccess: refresh,
  });
  const revoke = useCommandMutation('device_revoke', {
    mutationFn: (deviceId: string, requestId) => hearthApi.revokeDevice(deviceId, requestId),
    onSuccess: async () => {
      setConfirmRemoval(null);
      await refresh();
    },
  });
  if (admin.isPending) return <AdminQueryState title="Phones & screens" />;
  if (admin.data === undefined)
    return (
      <AdminQueryState
        title="Phones & screens"
        error={admin.error ?? new Error('Couldn’t load these settings.')}
        onRetry={() => void admin.refetch()}
      />
    );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    approve.mutate(code);
  }

  return (
    <AdminPage title="Phones & screens">
      <div className="device-setup-options">
        <section className="device-setup-card" aria-labelledby="screen-setup-title">
          <header>
            <Icon name="television" />
            <h2 id="screen-setup-title">Shared screen</h2>
          </header>
          <p>A TV or wall tablet. Family access, without settings.</p>
          <form className="pair-code-form" onSubmit={submit}>
            <label htmlFor="pair-code">Code from the screen</label>
            <div>
              <input
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                disabled={approve.isPending}
                id="pair-code"
                maxLength={16}
                name="code"
                pattern="[A-Z0-9]{6}"
                placeholder="ABC123"
                required
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.replaceAll(/[\s-]/g, '').toUpperCase().slice(0, 6));
                  approve.reset();
                }}
              />
              <button disabled={approve.isPending || code.length !== 6} type="submit">
                {approve.isPending ? 'Connecting…' : 'Connect screen'}
              </button>
            </div>
          </form>
          <details className="device-setup-help">
            <summary>Where do I get the code?</summary>
            <ol className="device-setup-steps">
              <li>Open Hearth on the screen and choose Connect shared screen.</li>
              <li>Enter its six-character code here.</li>
              <li>The screen opens Hearth automatically.</li>
            </ol>
          </details>
          {approve.isSuccess ? (
            <p className="save-confirmation" role="status">
              {approve.data.name} connected. You can use it now.
            </p>
          ) : null}
          {approve.isError ? (
            <AdminError message={approve.error.message} onRetry={approve.retryCommand} />
          ) : null}
          {runtime.mode === 'demo' ? (
            <Link className="tv-demo-link" to="/pair">
              Preview shared-screen setup
            </Link>
          ) : null}
        </section>
        <section className="device-setup-card" aria-labelledby="phone-setup-title">
          <header>
            <Icon name="shield" />
            <h2 id="phone-setup-title">Phone or computer</h2>
          </header>
          <p>Open this address on the device and sign in with an adult passkey.</p>
          <div className="device-home-address">
            <input aria-label="Hearth address" readOnly value={window.location.origin} />
            <button
              className="admin-secondary"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.origin);
                  setCopyState('copied');
                } catch {
                  setCopyState('failed');
                }
              }}
            >
              {copyState === 'copied' ? 'Copied' : 'Copy address'}
            </button>
          </div>
          {copyState === 'failed' ? <p role="status">Select and copy the address above.</p> : null}
          <p>Need a new passkey? An adult can help you save one on that device.</p>
          <Link className="admin-secondary device-setup-link" to="/admin/access">
            Manage adult sign-in <Icon name="chevron-right" />
          </Link>
        </section>
      </div>
      <section className="device-list" aria-labelledby="connected-tvs">
        <h2 id="connected-tvs">Connected screens</h2>
        {admin.data.pairedDevices.some((device) => device.status === 'connected') ? null : (
          <p className="device-setup-empty">No screens connected. Add one above.</p>
        )}
        {admin.data.pairedDevices.map((device) => (
          <article className="device-row" key={device.id}>
            <span className="admin-setting-row__icon">
              <Icon name="television" />
            </span>
            <div>
              <strong>{device.name}</strong>
              <span>{device.status === 'connected' ? 'Connected' : 'Disconnected'}</span>
            </div>
            {device.status !== 'connected' ? null : confirmRemoval === device.id ? (
              <div
                className="device-disconnect-confirm"
                role="group"
                aria-label={'Disconnect ' + device.name}
              >
                <span>It will need a new code to reconnect.</span>
                <button
                  disabled={revoke.isPending}
                  onClick={() => setConfirmRemoval(null)}
                  type="button"
                >
                  Keep connected
                </button>
                <button
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(device.id)}
                  type="button"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                disabled={revoke.isPending}
                onClick={() => setConfirmRemoval(device.id)}
                type="button"
              >
                Disconnect
              </button>
            )}
          </article>
        ))}
      </section>
      {revoke.isError ? (
        <AdminError message={revoke.error.message} onRetry={revoke.retryCommand} />
      ) : null}
    </AdminPage>
  );
}
