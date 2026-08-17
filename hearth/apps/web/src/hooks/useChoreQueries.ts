import { useQuery } from '@tanstack/react-query';

import { choresApi } from '../api/chores';
import { queryKeys } from '../api/queryKeys';

export function useChoresQuery(enabled = true) {
  return useQuery({ queryKey: queryKeys.chores, queryFn: choresApi.getChores, enabled });
}

export function useChoreTemplatesQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.choreTemplates,
    queryFn: choresApi.getChoreTemplates,
    enabled,
  });
}

export function useChoreOccurrenceDetailQuery(occurrenceId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.choreOccurrence(occurrenceId),
    queryFn: () => choresApi.getChoreOccurrenceDetail(occurrenceId),
    enabled,
  });
}
