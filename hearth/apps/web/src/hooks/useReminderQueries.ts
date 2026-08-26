import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../api/queryKeys';
import { remindersApi } from '../api/reminders';

export function useRemindersQuery(includeCompleted = false, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reminderOverview(includeCompleted),
    queryFn: () => remindersApi.getOverview(includeCompleted),
    enabled,
    retry: false,
  });
}
