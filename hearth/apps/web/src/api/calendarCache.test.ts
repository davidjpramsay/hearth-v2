import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { invalidateCalendarDisplays } from './calendarCache';
import { configureHearthClient } from './core';
import { queryKeys } from './queryKeys';

const runtime = {
  mode: 'test' as const,
  generatedAt: '2026-08-22T03:40:00.000Z',
  household: {
    id: 'household_calendar_refresh_test',
    name: 'Calendar Refresh Home',
    timezone: 'Australia/Perth',
    locale: 'en-AU',
  },
  timezone: 'Australia/Perth',
  locale: 'en-AU',
  localDate: '2026-08-22',
  weekStart: '2026-08-17',
  currentMonth: '2026-08',
  requiresSetup: false,
};

describe('calendar cache invalidation', () => {
  it('refreshes Today, Week and Month after calendar settings change', async () => {
    configureHearthClient(runtime);
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await invalidateCalendarDisplays(queryClient);

    expect(invalidate).toHaveBeenCalledTimes(3);
    expect(invalidate).toHaveBeenNthCalledWith(1, { queryKey: queryKeys.today });
    expect(invalidate).toHaveBeenNthCalledWith(2, { queryKey: queryKeys.weekRoot });
    expect(invalidate).toHaveBeenNthCalledWith(3, { queryKey: queryKeys.monthRoot });
  });
});
