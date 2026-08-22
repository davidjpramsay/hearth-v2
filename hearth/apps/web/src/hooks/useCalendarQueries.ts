import { useQuery } from '@tanstack/react-query';

import { calendarApi } from '../api/calendar';
import { getHearthRuntime } from '../api/core';
import { queryKeys } from '../api/queryKeys';
import { calendarRefreshPolicy } from './calendarRefreshPolicy';

export function useWeekQuery(start = getHearthRuntime().weekStart, enabled = true) {
  return useQuery({
    queryKey: queryKeys.week(start),
    queryFn: () => calendarApi.getWeek(start),
    placeholderData: (previous) => previous,
    enabled,
    ...calendarRefreshPolicy,
  });
}

export function useMonthQuery(month = getHearthRuntime().currentMonth, enabled = true) {
  return useQuery({
    queryKey: queryKeys.month(month),
    queryFn: () => calendarApi.getMonth(month),
    placeholderData: (previous) => previous,
    enabled,
    ...calendarRefreshPolicy,
  });
}
