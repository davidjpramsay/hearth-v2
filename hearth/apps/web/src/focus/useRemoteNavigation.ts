import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { FocusMemory, focusById, nextFocusId, type FocusDirection } from './focusGraph';
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
  const focusMemory = useRef(new FocusMemory());
  const previousPath = useRef(location.pathname);
  const remoteMoved = useRef(false);

  useEffect(() => {
    const rememberFocusedControl = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && event.target.dataset.focusId !== undefined) {
        focusMemory.current.remember(location.pathname, event.target.dataset.focusId);
      }
    };
    document.addEventListener('focusin', rememberFocusedControl);
    return () => document.removeEventListener('focusin', rememberFocusedControl);
  }, [location.pathname]);

  useEffect(() => {
    const priorPath = previousPath.current;
    const routeChanged = priorPath !== location.pathname;
    if (routeChanged) {
      remoteMoved.current = false;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.dataset.focusId !== undefined) {
        focusMemory.current.remember(priorPath, active.dataset.focusId);
      }
      previousPath.current = location.pathname;
    }
    const fallbackId = `nav-${location.pathname.slice(1) || 'today'}`;
    const target = focusMemory.current.recall(location.pathname, defaultFocusId);
    const animationFrame = requestAnimationFrame(() => {
      const activeFocusId =
        document.activeElement instanceof HTMLElement
          ? document.activeElement.dataset.focusId
          : undefined;
      // A remote key can arrive before this first animation frame on a fast TV.
      // Never steal that explicit focus move during initial screen entry.
      if (remoteMoved.current || (!routeChanged && activeFocusId !== undefined)) return;
      if (!focusById(target) && !focusById(defaultFocusId)) {
        focusById(fallbackId);
      }
    });
    const observer = new MutationObserver(() => {
      if (remoteMoved.current) {
        observer.disconnect();
        return;
      }
      const activeFocusId =
        document.activeElement instanceof HTMLElement
          ? document.activeElement.dataset.focusId
          : undefined;
      if (
        (activeFocusId === undefined || activeFocusId === fallbackId) &&
        (focusById(target) || focusById(defaultFocusId))
      ) {
        observer.disconnect();
      }
    });
    const content = document.querySelector('#main-content');
    if (content !== null) observer.observe(content, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [defaultFocusId, location.pathname]);

  useEffect(() => {
    const handleBack = (fromNativeShell: boolean) => {
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
      const active = document.activeElement;
      const direction = arrowDirection[event.key];
      if (direction !== undefined) {
        if (!(active instanceof HTMLElement)) return;
        const nextId = nextFocusId(active, direction);
        if (focusById(nextId)) {
          remoteMoved.current = true;
          event.preventDefault();
        }
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
    window.addEventListener('keydown', handler);
    window.addEventListener('message', nativeMessageHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('message', nativeMessageHandler);
    };
  }, [defaultFocusId, location.pathname, navigate]);
}
