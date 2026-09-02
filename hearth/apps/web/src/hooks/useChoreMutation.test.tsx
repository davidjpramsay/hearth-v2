import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChoreList, ChoreOccurrence, RuntimeContext } from '@hearth/shared';

import { choresApi } from '../api/chores';
import { configureHearthClient } from '../api/core';
import { queryKeys } from '../api/queryKeys';
import { useChoreMutation } from './useChoreMutation';

const runtime: RuntimeContext = {
  mode: 'private',
  generatedAt: '2026-08-28T10:00:00.000Z',
  household: {
    id: 'household_hearth_demo',
    name: 'Ramsay',
    timezone: 'Australia/Perth',
    locale: 'en-AU',
  },
  timezone: 'Australia/Perth',
  locale: 'en-AU',
  localDate: '2026-08-28',
  weekStart: '2026-08-24',
  currentMonth: '2026-08',
  requiresSetup: false,
};

const occurrence: ChoreOccurrence = {
  id: 'occurrence_school_bag_2026_08_26',
  title: 'Pack school bag',
  assignee: {
    id: 'member_ezra',
    displayName: 'Ezra',
    color: '#1668b7',
    avatarUrl: '/demo/ezra.png',
    role: 'child',
    capabilities: ['household.view', 'chores.complete'],
  },
  routineLabel: 'Morning',
  availableFromTime: '07:00',
  dueTime: '07:30',
  sortOrder: 0,
  localDate: '2026-08-26',
  state: 'pending',
  completionId: null,
  completedAt: null,
  completedLabel: null,
  locked: false,
};

afterEach(() => vi.restoreAllMocks());

describe('useChoreMutation', () => {
  it('updates the correct historical day and identifies an admin correction', async () => {
    configureHearthClient(runtime);
    const completed: ChoreOccurrence = {
      ...occurrence,
      state: 'completed',
      completionId: 'completion_school_bag',
      completedAt: '2026-08-28T10:05:00.000Z',
      completedLabel: 'Done 6:05 pm',
    };
    const complete = vi.spyOn(choresApi, 'completeChore').mockResolvedValue({
      occurrence: completed,
      completionId: 'completion_school_bag',
      audit: {
        id: 'audit_school_bag',
        actorType: 'member',
        actorId: 'member_maya',
        source: 'companion',
        action: 'chore.complete',
        targetId: occurrence.id,
        occurredAt: '2026-08-28T10:05:00.000Z',
        result: 'succeeded',
      },
      replayed: false,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const historicalList: ChoreList = {
      householdId: 'household_hearth_demo',
      localDate: occurrence.localDate,
      displayDate: 'Wednesday 26 August',
      completedCount: 0,
      totalCount: 1,
      groups: [{ member: occurrence.assignee, occurrences: [occurrence] }],
    };
    queryClient.setQueryData(queryKeys.choresForDate(occurrence.localDate), historicalList);

    const { result } = renderHook(() => useChoreMutation({ asAdmin: true }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });

    act(() => result.current.mutate({ action: 'complete', occurrence }));
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(complete).toHaveBeenCalledWith(occurrence.id, expect.any(String), true);
    await waitFor(() =>
      expect(
        queryClient.getQueryData<ChoreList>(queryKeys.choresForDate(occurrence.localDate))
          ?.groups[0]?.occurrences[0]?.state,
      ).toBe('completed'),
    );
    expect(queryClient.getQueryData(queryKeys.chores)).toBeUndefined();
  });
});
