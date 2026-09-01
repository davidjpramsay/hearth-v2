import { useEffect } from 'react';

import { hostedReleaseMonitor } from '../runtime/hostedRelease';

export const HOSTED_RELEASE_CHECK_INTERVAL_MS = 60_000;

export function useHostedReleaseRefresh(): void {
  useEffect(() => {
    const checkWhileVisible = () => {
      if (document.visibilityState === 'visible') void hostedReleaseMonitor.check();
    };

    checkWhileVisible();
    const interval = window.setInterval(checkWhileVisible, HOSTED_RELEASE_CHECK_INTERVAL_MS);
    window.addEventListener('online', checkWhileVisible);
    document.addEventListener('visibilitychange', checkWhileVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', checkWhileVisible);
      document.removeEventListener('visibilitychange', checkWhileVisible);
    };
  }, []);
}
