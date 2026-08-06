import { useQuery } from '@tanstack/react-query';

import { hearthApi, queryKeys } from '../api/client';

export function useTodayQuery(enabled = true) {
  return useQuery({ queryKey: queryKeys.today, queryFn: hearthApi.getToday, enabled });
}

export function useWeekQuery(enabled = true) {
  return useQuery({ queryKey: queryKeys.week, queryFn: hearthApi.getWeek, enabled });
}

export function useMonthQuery(month = '2026-08', enabled = true) {
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

export function useListsQuery(enabled = true) {
  return useQuery({ queryKey: queryKeys.lists, queryFn: hearthApi.getLists, enabled });
}

export function useMealPlanQuery(startDate = '2026-08-03', enabled = true) {
  return useQuery({
    queryKey: queryKeys.meals(startDate),
    queryFn: () => hearthApi.getMealPlan(startDate),
    enabled,
  });
}

export function useRewardsQuery(enabled = true) {
  return useQuery({ queryKey: queryKeys.rewards, queryFn: hearthApi.getRewards, enabled });
}

export function useChoreTemplatesQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.choreTemplates,
    queryFn: hearthApi.getChoreTemplates,
    enabled,
  });
}
