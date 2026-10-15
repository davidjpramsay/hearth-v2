import {
  SCREEN_TAB_PATHS,
  ScreenCommandSchema,
  screenTabForPath,
  type ScreenCommand,
} from '@hearth/shared';
import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { createRequestId } from '../api/core';
import { homeAssistantBridgeApi, HomeAssistantBridgeApiError } from '../api/homeAssistantBridge';
import { readNativePresentation, subscribeNativePresentation } from '../native/presentation';
import { useHearthRuntime } from '../runtime/context';

export const SCREEN_PRESENTATION_INTERVAL_MS = 2_000;
const MAX_BACKOFF_MS = 30_000;
const monotonicNow = () => performance.now();

type PendingPresentation = { command: ScreenCommand; confirmed: boolean; deadline: number };

/** Mount once above Routes. Call the returned callback from a committed route effect. */
export function useScreenPresentation(now: () => number = monotonicNow) {
  const runtime = useHearthRuntime();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  const observedPath = useRef<string | null>(null);
  const pending = useRef<PendingPresentation | null>(null);
  const enabled = runtime.mode === 'private' && runtime.sharedScreen === true;
  const householdId = runtime.household?.id;

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  const confirmPresentedPath = useCallback(
    (path: string) => {
      observedPath.current = path;
      const current = pending.current;
      if (
        current !== null &&
        path === SCREEN_TAB_PATHS[current.command.tab] &&
        now() < current.deadline
      ) {
        current.confirmed = true;
      }
    },
    [now],
  );

  useEffect(() => {
    if (!enabled || householdId === undefined) return;
    let disposed = false;
    let authStopped = false;
    let pageHidden = false;
    let inFlight = false;
    let epoch = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let backoff = SCREEN_PRESENTATION_INTERVAL_MS;
    let session: { instanceId: string; verified: boolean } | null = null;
    let cancellationInstanceId: string | null = null;
    const native =
      window.hearthNative !== undefined ||
      document.documentElement.dataset.hearthTvNative === 'true';
    let nativeStatus: Awaited<ReturnType<typeof readNativePresentation>> = null;
    const handled = new Set<string>();

    const windowVisible = () =>
      !disposed && !authStopped && !pageHidden && document.visibilityState === 'visible';
    const visible = () => windowVisible() && (!native || nativeStatus?.active === true);
    const resetSession = () => {
      epoch += 1;
      session = null;
      pending.current = null;
      handled.clear();
    };
    const cancelSession = () => {
      if (session?.verified === true) cancellationInstanceId = session.instanceId;
      resetSession();
      controller?.abort();
    };
    const schedule = (delay: number) => {
      clearTimeout(timer);
      if (!disposed && !authStopped && (windowVisible() || cancellationInstanceId !== null))
        timer = setTimeout(() => void poll(), delay);
    };
    const poll = async () => {
      if (
        disposed ||
        authStopped ||
        inFlight ||
        (!windowVisible() && cancellationInstanceId === null)
      )
        return;
      const cancelInstanceId = cancellationInstanceId;
      cancellationInstanceId = null;
      inFlight = true;
      const currentEpoch = epoch;
      controller = new AbortController();
      const signal = controller.signal;
      const current = () => windowVisible() && currentEpoch === epoch && !signal.aborted;
      const active = () => visible() && currentEpoch === epoch && !signal.aborted;
      const checkNative = async () => {
        if (!native) return current();
        const status = await readNativePresentation();
        if (!current()) return false;
        const previous = nativeStatus;
        nativeStatus = status;
        if (
          previous !== null &&
          (status === null ||
            previous.generation !== status.generation ||
            previous.active !== status.active)
        ) {
          cancelSession();
          return false;
        }
        return active();
      };
      let nextDelay = SCREEN_PRESENTATION_INTERVAL_MS;
      try {
        if (cancelInstanceId !== null) {
          // Best effort, serial, and never interpret commands returned to a hidden screen.
          await homeAssistantBridgeApi.present(
            { instanceId: cancelInstanceId, tab: null, acknowledgedCommandId: null },
            signal,
          );
          return;
        }
        if (!(await checkNative()) || !active()) return;
        session ??= {
          instanceId: createRequestId('screen_presentation'),
          verified: false,
        };
        const currentSession = session;
        if (!currentSession.verified) {
          const device = await homeAssistantBridgeApi.getCurrentDevice(signal);
          if (!active()) return;
          if (device.householdId !== householdId) {
            authStopped = true;
            resetSession();
            return;
          }
          currentSession.verified = true;
        }
        if (!(await checkNative()) || !active()) return;
        const tab = observedPath.current === null ? null : screenTabForPath(observedPath.current);
        const acknowledgement = pending.current;
        const acknowledgedCommandId =
          acknowledgement?.confirmed === true &&
          acknowledgement.command.tab === tab &&
          now() < acknowledgement.deadline
            ? acknowledgement.command.id
            : null;
        const requestStarted = now();
        const result = await homeAssistantBridgeApi.present(
          { instanceId: currentSession.instanceId, tab, acknowledgedCommandId },
          signal,
        );
        if (!active()) return;
        backoff = SCREEN_PRESENTATION_INTERVAL_MS;
        if (tab === null || screenTabForPath(observedPath.current ?? '') === null) {
          pending.current = null;
          return;
        }
        const parsed = ScreenCommandSchema.safeParse(result.command);
        if (!parsed.success || parsed.data.status !== 'pending') {
          pending.current = null;
          return;
        }
        const command = parsed.data;
        const createdAt = Date.parse(command.createdAt);
        const expiresAt = Date.parse(command.expiresAt);
        const serverTime = Date.parse(result.serverTime);
        const remaining = expiresAt - serverTime;
        if (
          !Number.isFinite(serverTime) ||
          createdAt > serverTime ||
          remaining <= 0 ||
          expiresAt <= createdAt ||
          expiresAt - createdAt > 30_000
        ) {
          pending.current = null;
          return;
        }
        // The NAS owns wall time; translate its remaining lifetime once into a monotonic budget.
        // Anchor before the request to conservatively subtract the complete round trip.
        const deadline = requestStarted + remaining;
        if (now() >= deadline) {
          pending.current = null;
          return;
        }
        if (handled.has(command.id)) return;
        // Re-read the Activity generation after the network wait, immediately before navigation.
        if (
          !(await checkNative()) ||
          !active() ||
          screenTabForPath(observedPath.current ?? '') === null ||
          now() >= deadline
        )
          return;
        // A pending command is attempted once. Only the route observer can confirm it afterwards.
        handled.add(command.id);
        if (handled.size > 64) handled.delete(handled.values().next().value!);
        pending.current = { command, confirmed: false, deadline };
        void navigateRef.current(SCREEN_TAB_PATHS[command.tab]);
      } catch (error) {
        if (cancelInstanceId !== null) {
          if (
            !disposed &&
            error instanceof HomeAssistantBridgeApiError &&
            (error.status === 401 || error.status === 403)
          )
            authStopped = true;
          return;
        }
        if (!active()) return;
        pending.current = null;
        if (
          error instanceof HomeAssistantBridgeApiError &&
          (error.status === 401 || error.status === 403)
        ) {
          authStopped = true;
          resetSession();
          return;
        }
        // 409 means another fresh browser instance owns the lease. Keep our identity and wait.
        if (!(error instanceof HomeAssistantBridgeApiError && error.status === 409)) resetSession();
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
        nextDelay = backoff;
      } finally {
        inFlight = false;
        // Even a fake/old transport that ignores abort cannot overlap the next request.
        schedule(cancellationInstanceId === null ? nextDelay : 0);
      }
    };
    const visibilityChanged = () => {
      clearTimeout(timer);
      if (!visible()) {
        cancelSession();
      }
      if (!inFlight) void poll();
    };
    const pageHide = () => {
      pageHidden = true;
      visibilityChanged();
    };
    const pageShow = () => {
      pageHidden = false;
      visibilityChanged();
    };
    const unsubscribeNative = native
      ? subscribeNativePresentation((snapshot) => {
          const previous = nativeStatus;
          nativeStatus = snapshot;
          if (previous?.generation === snapshot.generation && previous.active === snapshot.active)
            return;
          // Push invalidates the old generation synchronously, even while a status read is pending.
          clearTimeout(timer);
          if (session !== null || previous !== null) cancelSession();
          if (!inFlight) void poll();
        })
      : () => undefined;
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('pagehide', pageHide);
    window.addEventListener('pageshow', pageShow);
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
      resetSession();
      controller?.abort();
      unsubscribeNative();
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('pagehide', pageHide);
      window.removeEventListener('pageshow', pageShow);
    };
  }, [enabled, householdId, now]);

  return confirmPresentedPath;
}
