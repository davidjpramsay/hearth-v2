import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { ChoreCommandResult, ChoreList, ChoreOccurrence, TodaySummary } from '@hearth/shared';

import { choresApi as hearthApi } from '../api/chores';
import { createRequestId, getHearthRuntime, HearthApiError } from '../api/core';
import { queryKeys } from '../api/queryKeys';

interface ChoreMutationVariables {
  action: 'complete' | 'undo';
  occurrence: ChoreOccurrence;
}

interface MutationContext {
  today: TodaySummary | undefined;
  chores: ChoreList | undefined;
  localDate: string;
}

export function useChoreMutation({ asAdmin = false }: { asAdmin?: boolean } = {}) {
  const queryClient = useQueryClient();
  const [failedOccurrenceId, setFailedOccurrenceId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useMutation<ChoreCommandResult, Error, ChoreMutationVariables, MutationContext>({
    mutationFn: async ({ action, occurrence }) => {
      const requestId = createRequestId(`chore_${action}`);
      if (action === 'complete') {
        return hearthApi.completeChore(occurrence.id, requestId, asAdmin);
      }
      if (occurrence.completionId === null) {
        throw new Error('This completion can no longer be undone.');
      }
      return hearthApi.undoChore(occurrence.id, requestId, occurrence.completionId, asAdmin);
    },
    onMutate: async ({ action, occurrence }) => {
      setFailedOccurrenceId(null);
      setErrorMessage(null);
      const choresKey = queryKeys.choresForDate(occurrence.localDate);
      const isToday = occurrence.localDate === getHearthRuntime().localDate;
      await Promise.all([
        ...(isToday ? [queryClient.cancelQueries({ queryKey: queryKeys.today })] : []),
        queryClient.cancelQueries({ queryKey: choresKey }),
        queryClient.cancelQueries({ queryKey: queryKeys.pocketMoneyRoot }),
      ]);
      const context = {
        today: isToday ? queryClient.getQueryData<TodaySummary>(queryKeys.today) : undefined,
        chores: queryClient.getQueryData<ChoreList>(choresKey),
        localDate: occurrence.localDate,
      };
      const optimistic =
        action === 'complete'
          ? {
              ...occurrence,
              state: 'completed' as const,
              completionId: `completion_optimistic_${occurrence.id}`,
              completedAt: new Date().toISOString(),
              completedLabel: 'Marking as done…',
            }
          : {
              ...occurrence,
              state: 'pending' as const,
              completionId: null,
              completedAt: null,
              completedLabel: null,
            };
      updateOccurrence(queryClient, optimistic, isToday);
      return context;
    },
    onSuccess: (result) => {
      updateOccurrence(
        queryClient,
        result.occurrence,
        result.occurrence.localDate === getHearthRuntime().localDate,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.pocketMoneyRoot });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.choreOccurrence(result.occurrence.id),
      });
    },
    onError: (error, variables, context) => {
      if (context?.today !== undefined) queryClient.setQueryData(queryKeys.today, context.today);
      if (context?.chores !== undefined) {
        queryClient.setQueryData(queryKeys.choresForDate(context.localDate), context.chores);
      }
      setFailedOccurrenceId(variables.occurrence.id);
      setErrorMessage(
        error instanceof HearthApiError ? error.payload.error.message : 'Couldn’t mark this done.',
      );
    },
  });

  return {
    mutate: mutation.mutate,
    isPending: mutation.isPending,
    pendingOccurrenceId: mutation.isPending ? (mutation.variables?.occurrence.id ?? null) : null,
    failedOccurrenceId,
    errorMessage,
    clearError: () => {
      setFailedOccurrenceId(null);
      setErrorMessage(null);
      mutation.reset();
    },
  };
}

function updateOccurrence(
  queryClient: ReturnType<typeof useQueryClient>,
  updated: ChoreOccurrence,
  updateToday: boolean,
): void {
  if (updateToday) {
    queryClient.setQueryData<TodaySummary>(queryKeys.today, (current) =>
      current === undefined
        ? current
        : {
            ...current,
            chores: current.chores.map((item) => (item.id === updated.id ? updated : item)),
          },
    );
  }
  queryClient.setQueryData<ChoreList>(queryKeys.choresForDate(updated.localDate), (current) =>
    current === undefined
      ? current
      : {
          ...current,
          completedCount: current.groups
            .flatMap((group) => group.occurrences)
            .map((item) => (item.id === updated.id ? updated : item))
            .filter((item) => item.state === 'completed').length,
          groups: current.groups.map((group) => ({
            ...group,
            occurrences: group.occurrences.map((item) => (item.id === updated.id ? updated : item)),
          })),
        },
  );
}
