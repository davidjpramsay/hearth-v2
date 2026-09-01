import { z } from 'zod';

import { API_BASE } from '../api/core';

const HostedReleaseHealthSchema = z.object({
  version: z.string().min(1).max(80),
});

export type HostedReleaseCheckResult = 'initialized' | 'unchanged' | 'reloaded' | 'unavailable';

interface HostedReleaseMonitorOptions {
  readVersion: () => Promise<string>;
  reload: () => void;
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
  const response = await fetch(`${API_BASE}/health`, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Hearth release status is unavailable.');
  return HostedReleaseHealthSchema.parse(await response.json()).version;
}

export const hostedReleaseMonitor = createHostedReleaseMonitor({
  readVersion: readHostedReleaseVersion,
  reload: () => window.location.reload(),
});
