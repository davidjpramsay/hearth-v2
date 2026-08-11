import { useQuery } from '@tanstack/react-query';

import { getHearthRuntime } from '../api/core';
import { mealsApi } from '../api/meals';
import { queryKeys } from '../api/queryKeys';

export function useMealPlanQuery(startDate = getHearthRuntime().weekStart, enabled = true) {
  return useQuery({
    queryKey: queryKeys.meals(startDate),
    queryFn: () => mealsApi.getMealPlan(startDate),
    enabled,
  });
}

export function useSavedMealLibraryQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.savedMealLibrary,
    queryFn: mealsApi.getSavedMealLibrary,
    enabled,
  });
}
