import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
  useQuery,
} from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CALENDAR_REFRESH_INTERVAL_MS, calendarRefreshPolicy } from './calendarRefreshPolicy';

function createWrapper(queryClient: QueryClient) {
  return function CalendarQueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

async function flushTimers(): Promise<void> {
  await act(async () => vi.advanceTimersByTimeAsync(0));
}

describe('calendar refresh policy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    focusManager.setFocused(true);
    onlineManager.setOnline(true);
  });

  afterEach(() => {
    focusManager.setFocused(undefined);
    onlineManager.setOnline(true);
    vi.useRealTimers();
  });

  it('loads immediately and refreshes every five visible minutes', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const queryFn = vi.fn().mockResolvedValue({ events: ['saved event'] });

    renderHook(
      () =>
        useQuery({
          queryKey: ['calendar-refresh-interval'],
          queryFn,
          ...calendarRefreshPolicy,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await flushTimers();
    expect(queryFn).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(CALENDAR_REFRESH_INTERVAL_MS - 1));
    expect(queryFn).toHaveBeenCalledTimes(1);

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('refreshes immediately after reconnecting', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const queryFn = vi.fn().mockResolvedValue({ events: ['saved event'] });

    renderHook(
      () =>
        useQuery({
          queryKey: ['calendar-refresh-reconnect'],
          queryFn,
          ...calendarRefreshPolicy,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await flushTimers();
    expect(queryFn).toHaveBeenCalledTimes(1);

    act(() => onlineManager.setOnline(false));
    act(() => onlineManager.setOnline(true));
    await flushTimers();

    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('keeps the last successful data visible when a background refresh fails', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const saved = { events: ['saved event'] };
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce(saved)
      .mockRejectedValueOnce(new Error('iCloud unavailable'));

    const { result } = renderHook(
      () =>
        useQuery({
          queryKey: ['calendar-refresh-cache'],
          queryFn,
          ...calendarRefreshPolicy,
        }),
      { wrapper: createWrapper(queryClient) },
    );

    await flushTimers();
    expect(result.current.data).toEqual(saved);

    await act(async () => vi.advanceTimersByTimeAsync(CALENDAR_REFRESH_INTERVAL_MS));

    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual(saved);
  });
});
