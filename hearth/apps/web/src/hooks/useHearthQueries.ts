import { useQuery } from '@tanstack/react-query';

import { getHearthRuntime, hearthApi, queryKeys } from '../api/client';

export function useTodayQuery(enabled = true) {
  return useQuery({ queryKey: queryKeys.today, queryFn: hearthApi.getToday, enabled });
}

export function useTodayConfigurationQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.todayConfiguration,
    queryFn: hearthApi.getTodayConfiguration,
    enabled,
  });
}

export function useWeekQuery(start = getHearthRuntime().weekStart, enabled = true) {
  return useQuery({
    queryKey: queryKeys.week(start),
    queryFn: () => hearthApi.getWeek(start),
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function useMonthQuery(month = getHearthRuntime().currentMonth, enabled = true) {
  return useQuery({
    queryKey: queryKeys.month(month),
    queryFn: () => hearthApi.getMonth(month),
    placeholderData: (previous) => previous,
    enabled,
  });
}

export function useChoresQuery(enabled = true) {
  return useQuery({ queryKey: queryKeys.chores, queryFn: hearthApi.getChores, enabled });
}

export function useHomeQuery(enabled = true) {
  return useQuery({ queryKey: queryKeys.home, queryFn: hearthApi.getHome, enabled });
}

export function usePhotosQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.photos,
    queryFn: hearthApi.getPhotos,
    enabled,
    retry: false,
  });
}

export function useAdminQuery(enabled = true) {
  return useQuery({ queryKey: queryKeys.admin, queryFn: hearthApi.getAdmin, enabled });
}

export function useCalendarConnectionQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.calendarConnection,
    queryFn: hearthApi.getCalendarConnection,
    enabled,
    retry: false,
  });
}

export function useListsQuery(enabled = true) {
  return useQuery({ queryKey: queryKeys.lists, queryFn: hearthApi.getLists, enabled });
}

export function useMealPlanQuery(startDate = getHearthRuntime().weekStart, enabled = true) {
  return useQuery({
    queryKey: queryKeys.meals(startDate),
    queryFn: () => hearthApi.getMealPlan(startDate),
    enabled,
  });
}

export function usePocketMoneyQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.pocketMoney,
    queryFn: hearthApi.getPocketMoney,
    enabled,
  });
}

export function useChoreTemplatesQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.choreTemplates,
    queryFn: hearthApi.getChoreTemplates,
    enabled,
  });
}
