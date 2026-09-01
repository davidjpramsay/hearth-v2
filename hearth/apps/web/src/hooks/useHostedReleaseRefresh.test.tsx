import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hostedReleaseMonitor } from '../runtime/hostedRelease';
import {
  HOSTED_RELEASE_CHECK_INTERVAL_MS,
  useHostedReleaseRefresh,
} from './useHostedReleaseRefresh';

describe('hosted release refresh lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('checks while visible and pauses its minute fallback while hidden', async () => {
    const check = vi.spyOn(hostedReleaseMonitor, 'check').mockResolvedValue('unchanged');
    renderHook(() => useHostedReleaseRefresh());

    expect(check).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(HOSTED_RELEASE_CHECK_INTERVAL_MS));
    expect(check).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    await act(async () => vi.advanceTimersByTimeAsync(HOSTED_RELEASE_CHECK_INTERVAL_MS));
    expect(check).toHaveBeenCalledTimes(2);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(check).toHaveBeenCalledTimes(3);
  });
});
