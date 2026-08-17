import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ChoreOccurrence } from '@hearth/shared';

import { ChoreRow, type ChoreMutationView } from './ChoreRow';

const occurrence: ChoreOccurrence = {
  id: 'occurrence_school_bag',
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
  localDate: '2026-08-03',
  state: 'pending',
  completionId: null,
  completedAt: null,
  completedLabel: null,
  locked: false,
};

function view(overrides: Partial<ChoreMutationView> = {}): ChoreMutationView {
  return {
    mutate: vi.fn(),
    pendingOccurrenceId: null,
    failedOccurrenceId: null,
    errorMessage: null,
    clearError: vi.fn(),
    ...overrides,
  };
}

describe('ChoreRow', () => {
  it('uses the same typed view contract to complete and undo', () => {
    const mutation = view();
    const { rerender } = render(
      <ChoreRow
        occurrence={occurrence}
        mutation={mutation}
        focus={{ 'data-focus-id': 'chore-one' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Complete Pack school bag' }));
    expect(mutation.mutate).toHaveBeenCalledWith({ action: 'complete', occurrence });
    expect(screen.getByText(/Morning · 7:00–7:30 am/)).toBeVisible();

    const completed = {
      ...occurrence,
      state: 'completed' as const,
      completionId: 'completion_one',
      completedAt: '2026-08-02T23:42:00.000Z',
      completedLabel: 'Done 07:42',
    };
    rerender(
      <ChoreRow
        occurrence={completed}
        mutation={mutation}
        focus={{ 'data-focus-id': 'chore-one' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pack school bag, done. Undo' }));
    expect(mutation.mutate).toHaveBeenLastCalledWith({ action: 'undo', occurrence: completed });
  });

  it('keeps the affected row and a retry action visible after failure', () => {
    render(
      <ChoreRow
        occurrence={occurrence}
        mutation={view({
          failedOccurrenceId: occurrence.id,
          errorMessage: 'Couldn’t mark this done.',
        })}
        focus={{ 'data-focus-id': 'chore-one' }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t mark this done.');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('renders a skipped occurrence as an intentional non-command state', () => {
    const mutation = view();
    render(
      <ChoreRow
        occurrence={{ ...occurrence, state: 'skipped' }}
        mutation={mutation}
        focus={{ 'data-focus-id': 'chore-one' }}
      />,
    );
    const row = screen.getByRole('button', { name: 'Pack school bag, skipped' });
    expect(row).toHaveTextContent('Skipped');
    expect(row).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(row);
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('renders an excused occurrence as a non-command state', () => {
    const mutation = view();
    render(
      <ChoreRow
        occurrence={{ ...occurrence, state: 'excused' }}
        mutation={mutation}
        focus={{ 'data-focus-id': 'chore-one' }}
      />,
    );
    const row = screen.getByRole('button', { name: 'Pack school bag, excused' });
    expect(row).toHaveTextContent('Excused');
    expect(row).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(row);
    expect(mutation.mutate).not.toHaveBeenCalled();
  });
});
