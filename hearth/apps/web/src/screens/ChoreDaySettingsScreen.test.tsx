import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ChoreList, ChoreOccurrence, Member, RuntimeContext } from '@hearth/shared';

import { configureHearthClient } from '../api/core';
import { useAdminQuery } from '../hooks/useAdminQueries';
import { useChoreMutation } from '../hooks/useChoreMutation';
import {
  useChoreOccurrenceDetailQuery,
  useChoresForDatesQueries,
  useChoresQuery,
} from '../hooks/useChoreQueries';
import { RuntimeContextValue } from '../runtime/context';
import { earlierWeekDates } from '../utils/choreWeek';
import { ChoreDaySettingsScreen } from './ChoreDaySettingsScreen';

vi.mock('../hooks/useAdminQueries', () => ({ useAdminQuery: vi.fn() }));
vi.mock('../hooks/useChoreMutation', () => ({ useChoreMutation: vi.fn() }));
vi.mock('../hooks/useChoreQueries', () => ({
  useChoreOccurrenceDetailQuery: vi.fn(),
  useChoresForDatesQueries: vi.fn(),
  useChoresQuery: vi.fn(),
}));

const member: Member = {
  id: 'member_ezra',
  displayName: 'Ezra',
  color: '#1668b7',
  avatarUrl: '/demo/ezra.png',
  role: 'child',
  capabilities: ['household.view', 'chores.complete'],
};

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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChoreDaySettingsScreen', () => {
  it('lists earlier current-week chores and offers complete and undo actions', () => {
    const mutate = vi.fn();
    const pending = occurrence({
      id: 'occurrence_school_bag_2026_08_26',
      title: 'Pack school bag',
      localDate: '2026-08-26',
    });
    const completed = occurrence({
      id: 'occurrence_dishes_2026_08_25',
      title: 'Wash dishes',
      localDate: '2026-08-25',
      state: 'completed',
      completionId: 'completion_dishes',
      completedAt: '2026-08-25T11:00:00.000Z',
      completedLabel: 'Done 7:00 pm',
    });
    mockScreen(mutate, [
      query(list('2026-08-27', 'Thursday 27 August', [])),
      query(list('2026-08-26', 'Wednesday 26 August', [pending])),
      query(list('2026-08-25', 'Tuesday 25 August', [completed])),
      query(list('2026-08-24', 'Monday 24 August', [])),
    ]);

    renderScreen();

    expect(screen.getByRole('heading', { name: 'Chores this week' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Earlier this week' })).toBeVisible();
    expect(screen.getByText('Wednesday 26 August')).toBeVisible();
    expect(screen.getByText('Tuesday 25 August')).toBeVisible();
    expect(screen.queryByText('Thursday 27 August')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mark Pack school bag done' }));
    expect(mutate).toHaveBeenCalledWith({ action: 'complete', occurrence: pending });

    fireEvent.click(screen.getByRole('button', { name: 'Wash dishes, done. Mark not done' }));
    expect(mutate).toHaveBeenLastCalledWith({ action: 'undo', occurrence: completed });
  });

  it('starts with an empty earlier-week list every Monday', () => {
    expect(earlierWeekDates('2026-08-24', '2026-08-24')).toEqual([]);
    expect(earlierWeekDates('2026-08-24', '2026-08-28')).toEqual([
      '2026-08-27',
      '2026-08-26',
      '2026-08-25',
      '2026-08-24',
    ]);
  });
});

function mockScreen(mutate: ReturnType<typeof vi.fn>, pastQueries: unknown[]) {
  vi.mocked(useChoresQuery).mockReturnValue(
    query(list('2026-08-28', 'Friday 28 August', [])) as unknown as ReturnType<
      typeof useChoresQuery
    >,
  );
  vi.mocked(useChoresForDatesQueries).mockReturnValue(
    pastQueries as ReturnType<typeof useChoresForDatesQueries>,
  );
  vi.mocked(useAdminQuery).mockReturnValue({
    data: { household: { members: [member] } },
    isPending: false,
    isError: false,
  } as ReturnType<typeof useAdminQuery>);
  vi.mocked(useChoreOccurrenceDetailQuery).mockReturnValue({
    data: undefined,
    isPending: false,
    isError: false,
  } as unknown as ReturnType<typeof useChoreOccurrenceDetailQuery>);
  vi.mocked(useChoreMutation).mockReturnValue({
    mutate: mutate as unknown as ReturnType<typeof useChoreMutation>['mutate'],
    isPending: false,
    pendingOccurrenceId: null,
    failedOccurrenceId: null,
    errorMessage: null,
    clearError: vi.fn(),
  });
}

function occurrence(overrides: Partial<ChoreOccurrence>): ChoreOccurrence {
  return {
    id: 'occurrence_default',
    title: 'Chore',
    assignee: member,
    routineLabel: 'Morning',
    availableFromTime: null,
    dueTime: null,
    sortOrder: 0,
    localDate: '2026-08-26',
    state: 'pending',
    completionId: null,
    completedAt: null,
    completedLabel: null,
    locked: false,
    ...overrides,
  };
}

function list(localDate: string, displayDate: string, occurrences: ChoreOccurrence[]): ChoreList {
  return {
    householdId: 'household_hearth_demo',
    localDate,
    displayDate,
    completedCount: occurrences.filter((item) => item.state === 'completed').length,
    totalCount: occurrences.length,
    groups: [{ member, occurrences }],
  };
}

function query(data: ChoreList) {
  return {
    data,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  };
}

function renderScreen() {
  configureHearthClient(runtime);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={['/admin/chore-day']}>
      <QueryClientProvider client={queryClient}>
        <RuntimeContextValue.Provider value={runtime}>
          <ChoreDaySettingsScreen />
        </RuntimeContextValue.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
