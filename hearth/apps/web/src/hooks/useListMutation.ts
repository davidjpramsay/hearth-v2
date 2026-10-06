import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import type { HouseholdLists, ListItem, ListItemCommandResult } from '@hearth/shared';

import { createRequestId, HearthApiError } from '../api/core';
import { listsApi as hearthApi } from '../api/lists';
import { queryKeys } from '../api/queryKeys';
import { COMPANION_QUERY } from '../layout/viewportQueries';

interface ListMutationVariables {
  item: ListItem;
}

interface MutationContext {
  previous: ListItem;
}

export function useListMutation() {
  const queryClient = useQueryClient();
  const [failedItemId, setFailedItemId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const commands = useRef(new Map<string, { item: ListItem; requestId: string }>());
  const [pendingItemIds, setPendingItemIds] = useState<ReadonlySet<string>>(new Set());
  const mutation = useMutation<
    ListItemCommandResult,
    Error,
    ListMutationVariables,
    MutationContext
  >({
    mutationFn: ({ item }) => {
      const command = commands.current.get(item.id)!;
      item = command.item;
      const source = window.matchMedia(COMPANION_QUERY).matches ? 'companion' : 'tv';
      return item.checked
        ? hearthApi.undoListItem(item.id, command.requestId, source)
        : hearthApi.completeListItem(item.id, command.requestId, source);
    },
    onMutate: async ({ item }) => {
      setFailedItemId(null);
      setErrorMessage(null);
      await queryClient.cancelQueries({ queryKey: queryKeys.lists });
      const context = { previous: item };
      updateItem(queryClient, {
        ...item,
        checked: !item.checked,
        checkedAt: item.checked ? null : new Date().toISOString(),
        checkedByActorId: item.checked ? null : 'member_maya',
      });
      return context;
    },
    onSuccess: (result) => {
      commands.current.delete(result.item.id);
      updateItem(queryClient, result.item);
      void queryClient.invalidateQueries({ queryKey: queryKeys.today });
    },
    onError: (error, variables, context) => {
      if (context !== undefined) updateItem(queryClient, context.previous);
      setFailedItemId(variables.item.id);
      setErrorMessage(
        error instanceof HearthApiError
          ? error.payload.error.message
          : 'That list change could not be saved.',
      );
    },
    onSettled: (_result, _error, variables) => {
      setPendingItemIds((current) => {
        const next = new Set(current);
        next.delete(variables.item.id);
        return next;
      });
    },
  });

  return {
    mutate: (variables: ListMutationVariables) => {
      if (pendingItemIds.has(variables.item.id)) return;
      const original = commands.current.get(variables.item.id) ?? {
        item: variables.item,
        requestId: createRequestId('list_change'),
      };
      commands.current.set(variables.item.id, original);
      setPendingItemIds((current) => new Set(current).add(variables.item.id));
      mutation.mutate({ item: original.item });
    },
    isPending: pendingItemIds.size > 0,
    pendingItemIds,
    pendingItemId: mutation.isPending ? (mutation.variables?.item.id ?? null) : null,
    failedItemId,
    errorMessage,
    clearError: () => {
      setFailedItemId(null);
      setErrorMessage(null);
      mutation.reset();
    },
  };
}

function updateItem(queryClient: ReturnType<typeof useQueryClient>, updated: ListItem): void {
  queryClient.setQueryData<HouseholdLists>(queryKeys.lists, (current) =>
    current === undefined
      ? current
      : {
          ...current,
          lists: current.lists.map((list) => {
            if (!list.items.some((item) => item.id === updated.id)) return list;
            const items = list.items.map((item) => (item.id === updated.id ? updated : item));
            return {
              ...list,
              items,
              remainingCount: items.filter((item) => !item.checked).length,
            };
          }),
        },
  );
}
