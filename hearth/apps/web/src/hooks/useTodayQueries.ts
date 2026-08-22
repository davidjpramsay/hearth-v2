import { useQuery } from '@tanstack/react-query';

import { todayApi } from '../api/today';
import { queryKeys } from '../api/queryKeys';
import { calendarRefreshPolicy } from './calendarRefreshPolicy';

export function useTodayQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.today,
    queryFn: todayApi.getToday,
    enabled,
    ...calendarRefreshPolicy,
  });
}

export function useTodayConfigurationQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.todayConfiguration,
    queryFn: todayApi.getTodayConfiguration,
    enabled,
  });
}
