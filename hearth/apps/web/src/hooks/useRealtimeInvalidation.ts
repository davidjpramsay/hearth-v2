import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { RealtimeEventSchema } from '@hearth/shared';

import { invalidateCalendarDisplays } from '../api/calendarCache';
import { queryKeys } from '../api/queryKeys';
import { getRealtimeUrl } from '../api/realtime';

export function useRealtimeInvalidation(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof EventSource === 'undefined') return undefined;
    const source = new EventSource(getRealtimeUrl());
    const receive = (message: MessageEvent<string>) => {
      let payload: unknown;
      try {
        payload = JSON.parse(message.data) as unknown;
      } catch {
        return;
      }
      const parsed = RealtimeEventSchema.safeParse(payload);
      if (!parsed.success) return;
      if (parsed.data.kind === 'chore.changed') {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.today }),
          queryClient.invalidateQueries({ queryKey: queryKeys.chores }),
          queryClient.invalidateQueries({ queryKey: queryKeys.pocketMoneyRoot }),
        ]);
        return;
      }
      if (parsed.data.kind === 'list.changed') {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.today }),
          queryClient.invalidateQueries({ queryKey: queryKeys.lists }),
        ]);
        return;
      }
      if (parsed.data.kind === 'meal.changed') {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.today }),
          queryClient.invalidateQueries({ queryKey: [queryKeys.today[0], 'meals'] }),
        ]);
        return;
      }
      if (parsed.data.kind === 'pocket-money.changed') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.pocketMoneyRoot });
        return;
      }
      if (parsed.data.kind === 'chore-template.changed') {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.choreTemplates }),
          queryClient.invalidateQueries({ queryKey: queryKeys.today }),
          queryClient.invalidateQueries({ queryKey: queryKeys.chores }),
        ]);
        return;
      }
      if (parsed.data.kind === 'home.changed') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.home });
        return;
      }
      if (parsed.data.kind === 'today.changed') {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.today }),
          queryClient.invalidateQueries({ queryKey: queryKeys.todayConfiguration }),
        ]);
        return;
      }
      if (parsed.data.kind === 'weather.changed') {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.weatherLocation }),
          queryClient.invalidateQueries({ queryKey: queryKeys.today }),
          queryClient.invalidateQueries({ queryKey: queryKeys.weekRoot }),
        ]);
        return;
      }
      if (parsed.data.kind === 'calendar.changed') {
        void invalidateCalendarDisplays(queryClient);
        return;
      }
      if (parsed.data.kind === 'photos.changed') {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.photos }),
          queryClient.invalidateQueries({ queryKey: queryKeys.photoSource }),
          queryClient.invalidateQueries({ queryKey: queryKeys.today }),
        ]);
        return;
      }
      if (parsed.data.kind === 'reminders.changed') {
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.reminderSources }),
          queryClient.invalidateQueries({ queryKey: queryKeys.reminders }),
          queryClient.invalidateQueries({ queryKey: queryKeys.today }),
        ]);
        return;
      }
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.today }),
        queryClient.invalidateQueries({ queryKey: queryKeys.weekRoot }),
        queryClient.invalidateQueries({ queryKey: queryKeys.monthRoot }),
        queryClient.invalidateQueries({ queryKey: queryKeys.chores }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin }),
      ]);
    };
    source.addEventListener('chore.changed', receive as EventListener);
    source.addEventListener('household.changed', receive as EventListener);
    source.addEventListener('list.changed', receive as EventListener);
    source.addEventListener('meal.changed', receive as EventListener);
    source.addEventListener('pocket-money.changed', receive as EventListener);
    source.addEventListener('chore-template.changed', receive as EventListener);
    source.addEventListener('home.changed', receive as EventListener);
    source.addEventListener('today.changed', receive as EventListener);
    source.addEventListener('calendar.changed', receive as EventListener);
    source.addEventListener('weather.changed', receive as EventListener);
    source.addEventListener('photos.changed', receive as EventListener);
    source.addEventListener('reminders.changed', receive as EventListener);
    return () => source.close();
  }, [queryClient]);
}
