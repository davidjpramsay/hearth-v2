import { z } from 'zod';

import { API_BASE } from '../api/core';
import { withRequestDeadline } from '../api/deadline';
import { hasUnsavedChanges } from '../hooks/useUnsavedChanges';

const HostedReleaseHealthSchema = z.object({
  version: z.string().min(1).max(80),
});

export type HostedReleaseCheckResult =
  'initialized' | 'unchanged' | 'reloaded' | 'unavailable' | 'deferred';

interface HostedReleaseMonitorOptions {
  readVersion: () => Promise<string>;
  reload: () => void;
  canReload?: () => boolean;
}

export interface HostedReleaseMonitor {
  check(): Promise<HostedReleaseCheckResult>;
}

export function createHostedReleaseMonitor(
  options: HostedReleaseMonitorOptions,
): HostedReleaseMonitor {
  let observedVersion: string | null = null;
  let pendingCheck: Promise<HostedReleaseCheckResult> | null = null;

  return {
    check() {
      if (pendingCheck !== null) return pendingCheck;
      pendingCheck = options
        .readVersion()
        .then((version): HostedReleaseCheckResult => {
          if (observedVersion === null) {
            observedVersion = version;
            return 'initialized';
          }
          if (version === observedVersion) return 'unchanged';
          if (options.canReload?.() === false) return 'deferred';
          observedVersion = version;
          options.reload();
          return 'reloaded';
        })
        .catch((): HostedReleaseCheckResult => 'unavailable')
        .finally(() => {
          pendingCheck = null;
        });
      return pendingCheck;
    },
  };
}

async function readHostedReleaseVersion(): Promise<string> {
  return withRequestDeadline(
    {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    },
    async (init) => {
      const response = await fetch(`${API_BASE}/health`, init);
      if (!response.ok) throw new Error('Hearth release status is unavailable.');
      return HostedReleaseHealthSchema.parse(await response.json()).version;
    },
  );
}

export const hostedReleaseMonitor = createHostedReleaseMonitor({
  readVersion: readHostedReleaseVersion,
  reload: () => window.location.reload(),
  canReload: () => !hasUnsavedChanges(),
});
