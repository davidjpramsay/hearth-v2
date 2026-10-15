import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ConnectionCodeSchema,
  normalizeConnectionCode,
  type BridgePairingApproval,
} from '@hearth/shared';
import { createRequestId } from '../api/core';
import { HomeAssistantBridgeApiError, homeAssistantBridgeApi } from '../api/homeAssistantBridge';
import { queryKeys } from '../api/queryKeys';
import { useAdminQuery } from '../hooks/useAdminQueries';
import { AdminError, AdminLoading } from './AdminPage';
import './HomeAssistantBridgeSettings.css';

export function HomeAssistantBridgeSettings() {
  const admin = useAdminQuery();
  const queryClient = useQueryClient();
  const summaryKey = [...queryKeys.admin, 'home-assistant-bridge'];
  const [code, setCode] = useState('');
  const [screenIds, setScreenIds] = useState<string[]>([]);
  const [shareChores, setShareChores] = useState(false);
  const [shareCalendar, setShareCalendar] = useState(false);
  const [controlChores, setControlChores] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  // Only an expiring approval request. No automation credential enters browser state/cache.
  const approval = useRef<BridgePairingApproval | null>(null);
  const revokeId = useRef<string | null>(null);
  const operation = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const running = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current?.abort();
      approval.current = null;
    };
  }, []);
  const summary = useQuery({
    queryKey: summaryKey,
    queryFn: ({ signal }) => homeAssistantBridgeApi.getConnection(signal),
    retry: false,
    refetchInterval: (query) => (waiting && !timedOut && query.state.data === null ? 3000 : false),
    refetchIntervalInBackground: false,
  });
  const connection = summary.data ?? null;
  useEffect(() => {
    if (!waiting || connection !== null) return;
    const timeout = window.setTimeout(() => {
      setTimedOut(true);
      setConfirmation(
        'The connection was not confirmed in time. Check Home Assistant, or cancel this request and start again.',
      );
    }, 5 * 60_000);
    return () => window.clearTimeout(timeout);
  }, [waiting, connection]);
  const screens = (admin.data?.pairedDevices ?? []).filter(
    (device) =>
      device.type === 'television' && device.status !== 'revoked' && device.revokedAt === null,
  );
  const locked = busy || waiting || uncertain;
  async function approve() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    setConfirmation(null);
    const controller = new AbortController();
    operation.current = controller;
    approval.current ??= {
      requestId: createRequestId('ha_approval'),
      code,
      screenIds: screenIds.filter((id) => screens.some((screen) => screen.id === id)),
      shareChores,
      shareCalendar,
      controlChores,
    };
    try {
      await homeAssistantBridgeApi.approvePairing(approval.current, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      approval.current = null;
      setCode('');
      setWaiting(true);
      setTimedOut(false);
      setUncertain(false);
      setConfirmation(
        'Approved. Home Assistant will finish connecting automatically. Keep its setup window open.',
      );
      await summary.refetch();
    } catch (failure) {
      if (!mounted.current || controller.signal.aborted) return;
      const rejected =
        failure instanceof HomeAssistantBridgeApiError && [400, 403, 409].includes(failure.status);
      setUncertain(!rejected);
      if (rejected) approval.current = null;
      setError(
        rejected
          ? 'Check the six letters shown in Home Assistant. If they expired, start again there. Disconnect existing access before replacing it.'
          : 'Approval could not be confirmed. Retry the same request, or cancel access before starting again.',
      );
    } finally {
      running.current = false;
      if (mounted.current && !controller.signal.aborted) setBusy(false);
    }
  }
  async function revoke() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    const controller = new AbortController();
    operation.current = controller;
    revokeId.current ??= createRequestId('ha_bridge_revoke');
    try {
      await queryClient.cancelQueries({ queryKey: summaryKey, exact: true });
      await homeAssistantBridgeApi.revoke(revokeId.current, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      queryClient.setQueryData(summaryKey, null);
      approval.current = null;
      revokeId.current = null;
      setCode('');
      setWaiting(false);
      setTimedOut(false);
      setUncertain(false);
      setConfirmRevoke(false);
      setConfirmation('Home Assistant access and pending approvals have been cancelled.');
    } catch {
      if (mounted.current && !controller.signal.aborted)
        setError('Disconnection could not be confirmed. Try again.');
    } finally {
      running.current = false;
      if (mounted.current && !controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="ha-bridge-settings" aria-labelledby="ha-bridge-title">
      <header>
        <h2 id="ha-bridge-title">Home Assistant controls Hearth</h2>
        <p>Connect with six letters. No key to copy or type.</p>
      </header>
      <details className="ha-bridge-setup">
        <summary data-focus-entry="true" data-focus-id="home-assistant-bridge-setup">
          How to connect Home Assistant
        </summary>
        <ol>
          <li>Install the current Hearth custom integration in Home Assistant.</li>
          <li>In Home Assistant, add Hearth and enter your private Hearth address.</li>
          <li>Enter its six-letter code below, choose permissions, then approve.</li>
        </ol>
        <p>
          Only visible screens respond to tab changes. Native TVs need the updated Hearth APK.
          Sharing data or changing chores does not need a screen.
        </p>
      </details>
      {summary.isPending ? <AdminLoading /> : null}
      {summary.isError ? (
        <AdminError
          message="Could not load Home Assistant access."
          onRetry={() => void summary.refetch()}
        />
      ) : null}
      {error ? <AdminError message={error} /> : null}
      {confirmation && connection === null ? (
        <p className="save-confirmation" role="status">
          {confirmation}
        </p>
      ) : null}
      {connection ? (
        <div className="ha-bridge-summary">
          <h3>Home Assistant is connected</h3>
          <dl>
            <div>
              <dt>Allowed screens</dt>
              <dd>
                {connection.screenIds
                  .map(
                    (id) =>
                      screens.find((screen) => screen.id === id)?.name ??
                      'Previously selected screen',
                  )
                  .join(', ') || 'None'}
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
            Disconnect before replacing this connection or changing its permissions.
          </p>
        </div>
      ) : null}
      {summary.isSuccess && connection === null && !waiting && !uncertain ? (
        <form
          className="admin-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!locked && ConnectionCodeSchema.safeParse(code).success && admin.isSuccess)
              void approve();
          }}
        >
          <label htmlFor="ha-connection-code">Code shown in Home Assistant</label>
          <input
            id="ha-connection-code"
            value={code}
            onChange={(event) => setCode(normalizeConnectionCode(event.target.value))}
            disabled={locked}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={12}
            pattern="[A-HJ-NP-Z]{6}"
            placeholder="ABCDEF"
            required
            aria-describedby="ha-code-help"
          />
          <p className="field-help" id="ha-code-help">
            Six capital letters. Expires after five minutes. Approve only a setup you started.
          </p>
          {admin.isPending ? <AdminLoading /> : null}
          {admin.isError ? (
            <AdminError
              message="Could not load paired screens."
              onRetry={() => void admin.refetch()}
            />
          ) : null}
          <fieldset disabled={locked || !admin.isSuccess}>
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
          <fieldset disabled={locked}>
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
          <fieldset disabled={locked}>
            <legend>Chore control (optional)</legend>
            <label className="ha-bridge-choice">
              <input
                type="checkbox"
                checked={controlChores}
                disabled={!shareChores}
                onChange={(event) => setControlChores(event.target.checked)}
              />
              <span>Allow completing and reopening today’s chores</span>
            </label>
            <p className="field-help">
              Share chores first. Completion changes affect earned pocket money as usual. This does
              not allow creating, deleting or reassigning chores, or opening admin.
            </p>
          </fieldset>
          <button
            className="admin-submit"
            type="submit"
            disabled={locked || !admin.isSuccess || !ConnectionCodeSchema.safeParse(code).success}
          >
            {busy ? 'Approving…' : 'Approve Home Assistant'}
          </button>
        </form>
      ) : null}
      {uncertain && !connection ? (
        <button
          className="admin-submit"
          type="button"
          disabled={busy || confirmRevoke}
          onClick={() => void approve()}
        >
          Retry same approval
        </button>
      ) : null}
      {connection || waiting || uncertain ? (
        confirmRevoke ? (
          <div
            className="calendar-remove-confirmation"
            role="group"
            aria-label="Disconnect Home Assistant"
          >
            <strong>Disconnect Home Assistant?</strong>
            <span>This cancels pending approvals and stops its access to Hearth.</span>
            <button
              className="admin-danger"
              type="button"
              disabled={busy}
              onClick={() => void revoke()}
            >
              Yes, disconnect
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
            {connection ? 'Disconnect Home Assistant' : 'Cancel pending connection'}
          </button>
        )
      ) : null}
    </section>
  );
}
