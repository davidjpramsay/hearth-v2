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

export function usePhotoSourceQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.photoSource,
    queryFn: hearthApi.getPhotoSource,
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

export function useHomeAssistantConnectionQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.homeAssistantConnection,
    queryFn: hearthApi.getHomeAssistantConnection,
    enabled,
    retry: false,
  });
}

export function useSystemStatusQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.systemStatus,
    queryFn: hearthApi.getSystemStatus,
    enabled,
    retry: false,
  });
}

export function useListsQuery(enabled = true) {
  return useQuery({ queryKey: queryKeys.lists, queryFn: hearthApi.getLists, enabled });
}

export function useListSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.listSettings,
    queryFn: hearthApi.getListSettings,
    enabled,
  });
}

export function useMealPlanQuery(startDate = getHearthRuntime().weekStart, enabled = true) {
  return useQuery({
    queryKey: queryKeys.meals(startDate),
    queryFn: () => hearthApi.getMealPlan(startDate),
    enabled,
  });
}

export function useSavedMealLibraryQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.savedMealLibrary,
    queryFn: hearthApi.getSavedMealLibrary,
    enabled,
  });
}

export function usePocketMoneyQuery(
  weekStart = getHearthRuntime().weekStart,
  asOfDate = getHearthRuntime().localDate,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.pocketMoney(weekStart, asOfDate),
    queryFn: () => hearthApi.getPocketMoney(weekStart, asOfDate),
    placeholderData: (previous) => previous,
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

export function useChoreOccurrenceDetailQuery(occurrenceId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.choreOccurrence(occurrenceId),
    queryFn: () => hearthApi.getChoreOccurrenceDetail(occurrenceId),
    enabled,
  });
}
