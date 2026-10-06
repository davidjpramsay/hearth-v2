import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

import { confirmDiscardChanges, hasUnsavedChanges } from './useUnsavedChanges';

/** Protect links, remote Back, and browser history with the same draft decision. */
export function useDraftNavigationGuard(): void {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges() &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (confirmDiscardChanges(true)) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
}
