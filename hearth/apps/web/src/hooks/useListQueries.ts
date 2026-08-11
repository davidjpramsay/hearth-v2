import { useQuery } from '@tanstack/react-query';

import { listsApi } from '../api/lists';
import { queryKeys } from '../api/queryKeys';

export function useListsQuery(enabled = true) {
  return useQuery({ queryKey: queryKeys.lists, queryFn: listsApi.getLists, enabled });
}

export function useListSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.listSettings,
    queryFn: listsApi.getListSettings,
    enabled,
  });
}
