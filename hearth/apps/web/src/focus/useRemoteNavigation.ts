import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';

import {
  FocusMemory,
  focusById,
  focusIsWithin,
  nextSpatialTarget,
  focusControl,
  modalTabTarget,
  type FocusDirection,
} from './focusGraph';
import { COMPANION_MAX_WIDTH } from '../layout/viewportQueries';
import { isNativeBackMessage, requestNativeExit } from '../native/nativeBridge';

const arrowDirection: Partial<Record<string, FocusDirection>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

export function useRemoteNavigation(defaultFocusId: string): void {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const focusMemory = useRef(new FocusMemory());
  const previousPath = useRef(location.pathname);
  const activePath = useRef(location.pathname);
  const remoteMoved = useRef(false);
  const pendingDirections = useRef<FocusDirection[]>([]);

  useLayoutEffect(() => {
    activePath.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    const rememberFocusedControl = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && event.target.dataset.focusId !== undefined) {
        focusMemory.current.remember(activePath.current, event.target.dataset.focusId);
      }
    };
    document.addEventListener('focusin', rememberFocusedControl);
    return () => document.removeEventListener('focusin', rememberFocusedControl);
  }, []);

  useLayoutEffect(() => {
    const priorPath = previousPath.current;
    const routeChanged = priorPath !== location.pathname;
    if (routeChanged) {
      remoteMoved.current = false;
      pendingDirections.current = [];
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.dataset.focusId !== undefined) {
        focusMemory.current.remember(priorPath, active.dataset.focusId);
      }
      const previousControl = focusMemory.current.recall(priorPath, '');
      if (
        navigationType === 'PUSH' &&
        /^\/calendar\/(week|month|agenda)$/.test(priorPath) &&
        /^\/calendar\/(week|month|agenda)$/.test(location.pathname) &&
        previousControl.startsWith('calendar-view-')
      ) {
        // React may keep the old view visible while a new lazy view loads. A
        // further tab direction is still explicit input, not new-route autofocus.
        focusMemory.current.remember(location.pathname, previousControl);
      }
      previousPath.current = location.pathname;
    }
    const fallbackId = `nav-${location.pathname.slice(1) || 'today'}`;
    const target = focusMemory.current.recall(location.pathname, defaultFocusId);
    const scrollOnEntry = routeChanged || window.innerWidth > COMPANION_MAX_WIDTH;
    let entered = false;
    const applyPendingDirections = () => {
      const directions = pendingDirections.current;
      pendingDirections.current = [];
      for (const direction of directions) {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) break;
        const next = nextSpatialTarget(active, direction);
        if (next !== null && focusControl(next)) remoteMoved.current = true;
      }
    };
    const enter = () => {
      const remembered = focusMemory.current.recall(location.pathname, target);
      const focused =
        focusById(remembered, { scroll: scrollOnEntry && !entered }) ||
        (remembered !== defaultFocusId &&
          focusById(defaultFocusId, { scroll: scrollOnEntry && !entered })) ||
        (defaultFocusId !== 'screen-entry' &&
          focusById('screen-entry', { scroll: scrollOnEntry && !entered }));
      if (focused) {
        entered = true;
        applyPendingDirections();
      }
      return focused;
    };
    // Move before paint when the committed route is ready; otherwise the observer
    // waits for its lazy content and restores any queued directional input.
    if (routeChanged) enter();
    const animationFrame = requestAnimationFrame(() => {
      const content = document.querySelector('#main-content');
      const activeFocusId =
        document.activeElement instanceof HTMLElement
          ? document.activeElement.dataset.focusId
          : undefined;
      // A remote key, tap or form-field focus can arrive before this first frame.
      // Never steal that explicit interaction during initial screen entry.
      if (
        remoteMoved.current ||
        focusIsWithin(content) ||
        (!routeChanged && activeFocusId !== undefined)
      ) {
        entered = true;
        return;
      }
      if (!enter() && target !== defaultFocusId) {
        focusById(fallbackId, { scroll: scrollOnEntry });
      }
    });
    const observer = new MutationObserver(() => {
      if (focusIsWithin(content)) {
        entered = true;
        const active = document.activeElement;
        if (
          active instanceof HTMLElement &&
          (active.matches('input, textarea, select') || active.isContentEditable)
        )
          pendingDirections.current = [];
        else applyPendingDirections();
        return;
      }
      const active = document.activeElement;
      // Do not take focus back from navigation/browser chrome. But if an error,
      // loading screen or removed row lost its focused node, restore the last
      // meaningful control (or the loaded screen entry) for the next remote key.
      if (
        entered &&
        active instanceof HTMLElement &&
        active !== document.body &&
        active !== document.documentElement &&
        active.getClientRects().length > 0
      )
        return;
      enter();
    });
    const content = document.querySelector('#main-content');
    if (content !== null) observer.observe(content, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [defaultFocusId, location.pathname, navigationType]);

  useEffect(() => {
    const handleBack = (fromNativeShell: boolean) => {
      pendingDirections.current = [];
      const dismiss = document.querySelector<HTMLElement>('[data-back-dismiss="true"]');
      if (dismiss !== null && dismiss.offsetParent !== null) {
        dismiss.click();
        return;
      }
      if (location.pathname === '/today') {
        if (fromNativeShell && requestNativeExit()) return;
        focusById(defaultFocusId);
      } else {
        navigate(-1);
      }
    };
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const active = document.activeElement;
      if (event.key === 'Tab' && active instanceof HTMLElement) {
        pendingDirections.current = [];
        const target = modalTabTarget(active, event.shiftKey);
        if (target !== null && focusControl(target)) event.preventDefault();
        return;
      }
      const direction = arrowDirection[event.key];
      if (direction !== undefined) {
        if (!(active instanceof HTMLElement)) return;
        if (active.matches('input, textarea, select') || active.isContentEditable) return;
        if (
          document.querySelector('#main-content [data-focus-loading="true"]') !== null &&
          (active === document.body || active.getClientRects().length === 0)
        ) {
          // Remember a short burst of movement through a lazy route transition;
          // never replay activation, which could open an event without confirmation.
          if (pendingDirections.current.length < 8) pendingDirections.current.push(direction);
          event.preventDefault();
          return;
        }
        // At a spatial edge, keep focus stable instead of scrolling the page
        // independently of the remote selection.
        if (active.matches('a[href], button, summary, [tabindex]')) event.preventDefault();
        const target = nextSpatialTarget(active, direction);
        if (target !== null && focusControl(target)) {
          remoteMoved.current = true;
          event.preventDefault();
        }
        return;
      }
      if (
        event.key === 'Enter' &&
        active instanceof HTMLElement &&
        (active === document.body || active.getClientRects().length === 0) &&
        document.querySelector('#main-content [data-focus-loading="true"]') !== null
      ) {
        event.preventDefault();
        return;
      }
      if (['Escape', 'BrowserBack', 'GoBack'].includes(event.key)) {
        event.preventDefault();
        handleBack(false);
      }
    };
    const nativeMessageHandler = (event: MessageEvent<unknown>) => {
      if (isNativeBackMessage(event.data)) handleBack(true);
    };
    const pointerInteraction = () => {
      pendingDirections.current = [];
    };
    window.addEventListener('keydown', handler);
    window.addEventListener('message', nativeMessageHandler);
    window.addEventListener('pointerdown', pointerInteraction);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('message', nativeMessageHandler);
      window.removeEventListener('pointerdown', pointerInteraction);
    };
  }, [defaultFocusId, location.pathname, navigate]);
}
