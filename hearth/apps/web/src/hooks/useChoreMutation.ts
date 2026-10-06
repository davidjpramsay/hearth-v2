import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import type { ChoreCommandResult, ChoreList, ChoreOccurrence, TodaySummary } from '@hearth/shared';

import { choresApi as hearthApi } from '../api/chores';
import { createRequestId, getHearthRuntime, HearthApiError } from '../api/core';
import { queryKeys } from '../api/queryKeys';

interface ChoreMutationVariables {
  action: 'complete' | 'undo';
  occurrence: ChoreOccurrence;
}

interface MutationContext {
  previous: ChoreOccurrence;
  isToday: boolean;
}

export function useChoreMutation({ asAdmin = false }: { asAdmin?: boolean } = {}) {
  const queryClient = useQueryClient();
  const [failedOccurrenceId, setFailedOccurrenceId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const commands = useRef(
    new Map<
      string,
      { action: ChoreMutationVariables['action']; occurrence: ChoreOccurrence; requestId: string }
    >(),
  );
  const [pendingOccurrenceIds, setPendingOccurrenceIds] = useState<ReadonlySet<string>>(new Set());

  const mutation = useMutation<ChoreCommandResult, Error, ChoreMutationVariables, MutationContext>({
    mutationFn: async ({ action, occurrence }) => {
      const command = commands.current.get(occurrence.id)!;
      const requestId = command.requestId;
      action = command.action;
      occurrence = command.occurrence;
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
        previous: occurrence,
        isToday,
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
      commands.current.delete(result.occurrence.id);
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
      if (context !== undefined) updateOccurrence(queryClient, context.previous, context.isToday);
      setFailedOccurrenceId(variables.occurrence.id);
      setErrorMessage(
        error instanceof HearthApiError ? error.payload.error.message : 'Couldn’t mark this done.',
      );
    },
    onSettled: (_result, _error, variables) => {
      setPendingOccurrenceIds((current) => {
        const next = new Set(current);
        next.delete(variables.occurrence.id);
        return next;
      });
    },
  });

  return {
    mutate: (variables: ChoreMutationVariables) => {
      if (pendingOccurrenceIds.has(variables.occurrence.id)) return;
      const original = commands.current.get(variables.occurrence.id) ?? {
        ...variables,
        requestId: createRequestId(`chore_${variables.action}`),
      };
      commands.current.set(variables.occurrence.id, original);
      setPendingOccurrenceIds((current) => new Set(current).add(variables.occurrence.id));
      mutation.mutate({ action: original.action, occurrence: original.occurrence });
    },
    isPending: pendingOccurrenceIds.size > 0,
    pendingOccurrenceIds,
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
