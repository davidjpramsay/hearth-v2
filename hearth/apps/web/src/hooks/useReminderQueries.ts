import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCommandMutation } from './useCommandMutation';

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

function useReminderMutation<TVariables>(
  mutationFn: (variables: TVariables, requestId: string) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useCommandMutation('reminder', {
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.reminders }),
        queryClient.invalidateQueries({ queryKey: queryKeys.today }),
      ]);
    },
  });
}

export function useCreateReminder() {
  return useReminderMutation(remindersApi.create);
}

export function useUpdateReminder() {
  return useReminderMutation(
    (
      input: { reminderId: string; title: string; dueLocalDate: string | null },
      requestId: string,
    ) => remindersApi.update(input.reminderId, input, requestId),
  );
}

export function useSetReminderCompletion() {
  return useReminderMutation(
    (input: { reminderId: string; isCompleted: boolean }, requestId: string) =>
      remindersApi.setCompletion(input.reminderId, input.isCompleted, requestId),
  );
}

export function useDeleteReminder() {
  return useReminderMutation((reminderId: string, requestId: string) =>
    remindersApi.delete(reminderId, requestId),
  );
}
