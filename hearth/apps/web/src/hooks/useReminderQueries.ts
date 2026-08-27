import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

function useReminderMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
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
    (input: { reminderId: string; title: string; dueLocalDate: string | null }) =>
      remindersApi.update(input.reminderId, input),
  );
}

export function useSetReminderCompletion() {
  return useReminderMutation((input: { reminderId: string; isCompleted: boolean }) =>
    remindersApi.setCompletion(input.reminderId, input.isCompleted),
  );
}

export function useDeleteReminder() {
  return useReminderMutation((reminderId: string) => remindersApi.delete(reminderId));
}
