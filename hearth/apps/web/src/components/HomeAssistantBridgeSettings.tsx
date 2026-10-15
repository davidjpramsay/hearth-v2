import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BridgeConnection, BridgeGrantRequest } from '@hearth/shared';

import { createRequestId } from '../api/core';
import { homeAssistantBridgeApi } from '../api/homeAssistantBridge';
import { queryKeys } from '../api/queryKeys';
import { useAdminQuery } from '../hooks/useAdminQueries';
import { AdminError, AdminLoading } from './AdminPage';

import './HomeAssistantBridgeSettings.css';

export function HomeAssistantBridgeSettings() {
  const admin = useAdminQuery();
  const queryClient = useQueryClient();
  const summaryKey = [...queryKeys.admin, 'home-assistant-bridge'];
  const [savedConnection, setSavedConnection] = useState<BridgeConnection | null | undefined>();
  const [screenIds, setScreenIds] = useState<string[]>([]);
  const [shareChores, setShareChores] = useState(false);
  const [controlChores, setControlChores] = useState(false);
  const [shareCalendar, setShareCalendar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [uncertainIssue, setUncertainIssue] = useState(false);
  const summary = useQuery({
    queryKey: summaryKey,
    queryFn: ({ signal }) => homeAssistantBridgeApi.getConnection(signal),
    enabled: savedConnection === undefined && !busy && !uncertainIssue,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const connection = savedConnection === undefined ? (summary.data ?? null) : savedConnection;
  const loading = summary.isPending;
  const loadError = summary.isError;
  // Deliberately bypass Query mutations/caches: this request contains the one-time key.
  const issueRequest = useRef<BridgeGrantRequest | null>(null);
  const revokeRequestId = useRef<string | null>(null);
  const operation = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const busyRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current?.abort();
      issueRequest.current = null;
      revokeRequestId.current = null;
    };
  }, []);

  function setConnection(value: BridgeConnection | null) {
    setSavedConnection(value);
    queryClient.setQueryData(summaryKey, value);
  }

  const screens = (admin.data?.pairedDevices ?? []).filter(
    (device) =>
      device.type === 'television' && device.status !== 'revoked' && device.revokedAt === null,
  );

  function clearKey() {
    issueRequest.current = null;
    setSecret(null);
    setShowSecret(false);
    setUncertainIssue(false);
  }

  async function issue() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setConfirmation(null);
    const controller = new AbortController();
    operation.current = controller;
    try {
      await queryClient.cancelQueries({ queryKey: summaryKey, exact: true });
      if (!mounted.current || controller.signal.aborted) return;
      if (issueRequest.current === null) {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        try {
          const encoded = btoa(String.fromCharCode(...bytes))
            .replaceAll('+', '-')
            .replaceAll('/', '_')
            .replaceAll('=', '');
          issueRequest.current = {
            requestId: createRequestId('ha_bridge_issue'),
            secret: `ha_${encoded}`,
            screenIds: screenIds.filter((id) => screens.some((screen) => screen.id === id)),
            shareChores,
            shareCalendar,
            controlChores,
          };
        } finally {
          bytes.fill(0);
        }
      }
      const result = await homeAssistantBridgeApi.issue(issueRequest.current, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      if (result.connection.revokedAt !== null) {
        clearKey();
        setConnection(null);
        setConfirmation('This key has already been revoked. You can create a new connection.');
        return;
      }
      setConnection(result.connection);
      setSecret(issueRequest.current.secret);
      // The successful response never contains the secret. It comes only from this component.
      issueRequest.current = null;
      setUncertainIssue(false);
      setShowSecret(false);
    } catch {
      if (!mounted.current || controller.signal.aborted) return;
      setUncertainIssue(issueRequest.current !== null);
      setError(
        'The connection could not be confirmed. Try again with the same key, or revoke access before starting again.',
      );
    } finally {
      busyRef.current = false;
      if (mounted.current && !controller.signal.aborted) setBusy(false);
    }
  }

  async function revoke() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    operation.current = controller;
    revokeRequestId.current ??= createRequestId('ha_bridge_revoke');
    try {
      await queryClient.cancelQueries({ queryKey: summaryKey, exact: true });
      if (!mounted.current || controller.signal.aborted) return;
      await homeAssistantBridgeApi.revoke(revokeRequestId.current, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      clearKey();
      revokeRequestId.current = null;
      setConnection(null);
      setConfirmRevoke(false);
      setScreenIds([]);
      setShareChores(false);
      setControlChores(false);
      setShareCalendar(false);
      setConfirmation('Home Assistant access to Hearth has been revoked.');
    } catch {
      if (mounted.current && !controller.signal.aborted)
        setError('Revocation could not be confirmed. Try revoking again.');
    } finally {
      busyRef.current = false;
      if (mounted.current && !controller.signal.aborted) setBusy(false);
    }
  }

  const canCreate = !loading && !loadError && admin.isSuccess && secret === null;
  return (
    <section className="ha-bridge-settings" aria-labelledby="ha-bridge-title">
      <header>
        <h2 id="ha-bridge-title">Home Assistant controls Hearth</h2>
        <p>Choose screens, shared information and optional chore control.</p>
      </header>
      <p className="field-help">
        Only visible screens respond. Sharing information or changing chores does not need a screen.
      </p>
      <details className="ha-bridge-setup">
        <summary data-focus-entry="true" data-focus-id="home-assistant-bridge-setup">
          How to connect Home Assistant
        </summary>
        <ol>
          <li>Install Hearth’s custom integration in Home Assistant. It is not built in.</li>
          <li>Native TV control requires an updated Hearth TV APK with foreground reporting.</li>
          <li>
            Choose permissions here, create a key, then save it in the integration’s protected key
            field.
          </li>
        </ol>
      </details>

      {loading ? <AdminLoading /> : null}
      {loadError ? (
        <AdminError
          message="Could not load Home Assistant access."
          onRetry={() => void summary.refetch()}
        />
      ) : null}
      {error === null ? null : <AdminError message={error} />}
      {confirmation === null ? null : (
        <p className="save-confirmation" role="status">
          {confirmation}
        </p>
      )}

      {secret === null ? null : (
        <div className="ha-bridge-key" role="group" aria-label="One-time Home Assistant key">
          <strong>Save this key in Home Assistant now</strong>
          <p>
            It is shown only during this setup. After closing this panel, revoke and reconnect if
            you need a new key.
          </p>
          <label htmlFor="ha-bridge-key">One-time key</label>
          <input
            id="ha-bridge-key"
            type={showSecret ? 'text' : 'password'}
            value={secret}
            readOnly
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
            data-bwignore="true"
            aria-describedby="ha-bridge-key-help"
          />
          <p className="field-help" id="ha-bridge-key-help">
            Enter it only in Home Assistant’s protected key field.
          </p>
          <div className="ha-bridge-actions">
            <button
              type="button"
              className="admin-secondary"
              aria-pressed={showSecret}
              onClick={() => setShowSecret((current) => !current)}
            >
              {showSecret ? 'Hide key' : 'Show key'}
            </button>
            <button type="button" className="admin-submit" onClick={clearKey}>
              Done, key saved in Home Assistant
            </button>
          </div>
        </div>
      )}

      {!loading && !loadError && connection !== null ? (
        <div className="ha-bridge-summary">
          <h3>Home Assistant access is enabled</h3>
          <dl>
            <div>
              <dt>Allowed screens</dt>
              <dd>
                {connection.screenIds.length === 0
                  ? 'None'
                  : connection.screenIds
                      .map(
                        (id) =>
                          screens.find((screen) => screen.id === id)?.name ??
                          'Previously selected screen',
                      )
                      .join(', ')}
              </dd>
            </div>
            <div>
              <dt>Chores</dt>
              <dd>
                {connection.controlChores
                  ? 'Complete and reopen today’s chores'
                  : connection.shareChores
                    ? 'Read only'
                    : 'Not shared'}
              </dd>
            </div>
            <div>
              <dt>Calendar</dt>
              <dd>{connection.shareCalendar ? 'Read only' : 'Not shared'}</dd>
            </div>
          </dl>
          <p className="field-help">
            Revoke this connection before creating a replacement key or changing its permissions.
          </p>
        </div>
      ) : null}

      {!loading && !loadError && connection === null && !uncertainIssue && secret === null ? (
        <form
          className="admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (canCreate) void issue();
          }}
        >
          {admin.isPending ? <AdminLoading /> : null}
          {admin.isError ? (
            <AdminError
              message="Could not load paired screens."
              onRetry={() => void admin.refetch()}
            />
          ) : null}
          <fieldset disabled={busy || !canCreate}>
            <legend>Allowed screens</legend>
            {screens.length === 0 ? (
              <p>No paired screens are available.</p>
            ) : (
              screens.map((screen) => (
                <label className="ha-bridge-choice" key={screen.id}>
                  <input
                    type="checkbox"
                    checked={screenIds.includes(screen.id)}
                    disabled={screenIds.length >= 20 && !screenIds.includes(screen.id)}
                    onChange={(event) =>
                      setScreenIds((current) =>
                        event.target.checked
                          ? [...current, screen.id]
                          : current.filter((id) => id !== screen.id),
                      )
                    }
                  />
                  <span>{screen.name}</span>
                </label>
              ))
            )}
          </fieldset>
          <fieldset disabled={busy || !canCreate}>
            <legend>Share information</legend>
            <label className="ha-bridge-choice">
              <input
                type="checkbox"
                checked={shareChores}
                onChange={(event) => {
                  setShareChores(event.target.checked);
                  if (!event.target.checked) setControlChores(false);
                }}
              />
              <span>Share chores (read only)</span>
            </label>
            <label className="ha-bridge-choice">
              <input
                type="checkbox"
                checked={shareCalendar}
                onChange={(event) => setShareCalendar(event.target.checked)}
              />
              <span>Share calendar (read only)</span>
            </label>
          </fieldset>
          <fieldset disabled={busy || !canCreate}>
            <legend>Chore control (optional)</legend>
            <label className="ha-bridge-choice">
              <input
                type="checkbox"
                checked={controlChores}
                disabled={!shareChores}
                aria-describedby="ha-bridge-chore-control-help"
                onChange={(event) => setControlChores(event.target.checked)}
              />
              <span>Allow completing and reopening today’s chores</span>
            </label>
            <p className="field-help" id="ha-bridge-chore-control-help">
              Share chores first. Completion changes affect earned pocket money as usual. This does
              not allow creating, deleting or reassigning chores, or opening admin.
            </p>
          </fieldset>
          <button className="admin-submit" type="submit" disabled={busy || !canCreate}>
            {busy ? 'Creating key…' : 'Create Home Assistant key'}
          </button>
        </form>
      ) : null}

      {uncertainIssue ? (
        <button
          className="admin-submit"
          type="button"
          disabled={busy || confirmRevoke}
          onClick={() => void issue()}
        >
          {busy ? 'Confirming…' : 'Retry same key'}
        </button>
      ) : null}
      {connection !== null || uncertainIssue ? (
        confirmRevoke ? (
          <div
            className="calendar-remove-confirmation"
            role="group"
            aria-label="Revoke Home Assistant access"
          >
            <strong>Revoke Home Assistant access to Hearth?</strong>
            <span>This key will stop working and pending screen commands will be cancelled.</span>
            <button
              className="admin-danger"
              type="button"
              disabled={busy}
              onClick={() => void revoke()}
            >
              {busy ? 'Revoking…' : 'Yes, revoke access'}
            </button>
            <button
              className="admin-secondary"
              type="button"
              disabled={busy}
              onClick={() => setConfirmRevoke(false)}
            >
              Keep access
            </button>
          </div>
        ) : (
          <button
            className="admin-danger"
            type="button"
            disabled={busy}
            onClick={() => setConfirmRevoke(true)}
          >
            Revoke Home Assistant access
          </button>
        )
      ) : null}
    </section>
  );
}
