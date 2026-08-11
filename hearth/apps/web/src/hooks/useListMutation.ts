import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import type { HouseholdLists, ListItem, ListItemCommandResult } from '@hearth/shared';

import { createRequestId, HearthApiError } from '../api/core';
import { listsApi as hearthApi } from '../api/lists';
import { queryKeys } from '../api/queryKeys';

interface ListMutationVariables {
  item: ListItem;
}

interface MutationContext {
  lists: HouseholdLists | undefined;
}

export function useListMutation() {
  const queryClient = useQueryClient();
  const [failedItemId, setFailedItemId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mutation = useMutation<
    ListItemCommandResult,
    Error,
    ListMutationVariables,
    MutationContext
  >({
    mutationFn: ({ item }) => {
      const source = window.matchMedia('(max-width: 900px)').matches ? 'companion' : 'tv';
      return item.checked
        ? hearthApi.undoListItem(item.id, createRequestId('list_undo'), source)
        : hearthApi.completeListItem(item.id, createRequestId('list_complete'), source);
    },
    onMutate: async ({ item }) => {
      setFailedItemId(null);
      setErrorMessage(null);
      await queryClient.cancelQueries({ queryKey: queryKeys.lists });
      const context = { lists: queryClient.getQueryData<HouseholdLists>(queryKeys.lists) };
      updateItem(queryClient, {
        ...item,
        checked: !item.checked,
        checkedAt: item.checked ? null : new Date().toISOString(),
        checkedByActorId: item.checked ? null : 'member_maya',
      });
      return context;
    },
    onSuccess: (result) => {
      queryClient.setQueryData<HouseholdLists>(queryKeys.lists, (current) =>
        current === undefined
          ? current
          : {
              ...current,
              lists: current.lists.map((list) => (list.id === result.list.id ? result.list : list)),
            },
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.today });
    },
    onError: (error, variables, context) => {
      if (context?.lists !== undefined) queryClient.setQueryData(queryKeys.lists, context.lists);
      setFailedItemId(variables.item.id);
      setErrorMessage(
        error instanceof HearthApiError
          ? error.payload.error.message
          : 'That list change could not be saved.',
      );
    },
  });

  return {
    mutate: mutation.mutate,
    isPending: mutation.isPending,
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
