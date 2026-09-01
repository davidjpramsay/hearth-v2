import { describe, expect, it, vi } from 'vitest';

import { createHostedReleaseMonitor } from './hostedRelease';

describe('hosted release monitor', () => {
  it('establishes a baseline and reloads only when the release changes', async () => {
    const readVersion = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('release-a')
      .mockResolvedValueOnce('release-a')
      .mockResolvedValueOnce('release-b')
      .mockResolvedValueOnce('release-b');
    const reload = vi.fn();
    const monitor = createHostedReleaseMonitor({ readVersion, reload });

    await expect(monitor.check()).resolves.toBe('initialized');
    await expect(monitor.check()).resolves.toBe('unchanged');
    await expect(monitor.check()).resolves.toBe('reloaded');
    await expect(monitor.check()).resolves.toBe('unchanged');

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('recovers from an unavailable check without treating it as a release', async () => {
    const readVersion = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('release-a');
    const reload = vi.fn();
    const monitor = createHostedReleaseMonitor({ readVersion, reload });

    await expect(monitor.check()).resolves.toBe('unavailable');
    await expect(monitor.check()).resolves.toBe('initialized');
    expect(reload).not.toHaveBeenCalled();
  });

  it('shares one request when reconnect signals arrive together', async () => {
    let resolveVersion: ((version: string) => void) | undefined;
    const readVersion = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveVersion = resolve;
        }),
    );
    const monitor = createHostedReleaseMonitor({ readVersion, reload: vi.fn() });

    const first = monitor.check();
    const second = monitor.check();
    expect(readVersion).toHaveBeenCalledTimes(1);
    resolveVersion?.('release-a');

    await expect(first).resolves.toBe('initialized');
    await expect(second).resolves.toBe('initialized');
  });
});
