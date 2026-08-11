import {
  MealCommandResultSchema,
  MealPlanSchema,
  MealPlanWeekCommandResultSchema,
  SavedMealCommandResultSchema,
  SavedMealLibrarySchema,
  type MealPlanEntryInput,
} from '@hearth/shared';

import { demoAdminHeaders, getHearthRuntime, householdApiBase, request } from './core';

export const mealsApi = {
  getMealPlan: (startDate = getHearthRuntime().weekStart) =>
    request(`${householdApiBase()}/meal-plan?start=${startDate}`, MealPlanSchema),
  upsertMealPlan: (input: {
    requestId: string;
    localDate: string;
    slot: 'breakfast' | 'lunch' | 'dinner';
    mealName: string;
    savedMealId: string | null;
    note: string | null;
  }) =>
    request(`${householdApiBase()}/meal-plan-entries`, MealCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  createSavedMeal: (input: {
    requestId: string;
    name: string;
    description: string | null;
    preparationMinutes: number | null;
    favourite: boolean;
  }) =>
    request(`${householdApiBase()}/saved-meals`, SavedMealCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  getSavedMealLibrary: () =>
    request(`${householdApiBase()}/saved-meal-library`, SavedMealLibrarySchema, {
      headers: demoAdminHeaders,
    }),
  updateSavedMeal: (
    mealId: string,
    input: {
      requestId: string;
      name: string;
      description: string | null;
      preparationMinutes: number | null;
      favourite: boolean;
    },
  ) =>
    request(`${householdApiBase()}/saved-meals/${mealId}`, SavedMealCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  archiveSavedMeal: (mealId: string, requestId: string) =>
    request(`${householdApiBase()}/saved-meals/${mealId}/archives`, SavedMealCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId }),
    }),
  restoreSavedMeal: (mealId: string, requestId: string) =>
    request(
      `${householdApiBase()}/saved-meals/${mealId}/restorations`,
      SavedMealCommandResultSchema,
      { method: 'POST', headers: demoAdminHeaders, body: JSON.stringify({ requestId }) },
    ),
  updateMealPlanWeek: (input: {
    requestId: string;
    startDate: string;
    entries: MealPlanEntryInput[];
  }) =>
    request(`${householdApiBase()}/meal-plan-weeks`, MealPlanWeekCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  clearMealPlanWeek: (startDate: string, requestId: string) =>
    request(`${householdApiBase()}/meal-plan-week-clears`, MealPlanWeekCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId, startDate }),
    }),
  copyMealPlanWeek: (input: {
    requestId: string;
    sourceStartDate: string;
    targetStartDate: string;
    replaceExisting: boolean;
  }) =>
    request(`${householdApiBase()}/meal-plan-week-copies`, MealPlanWeekCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
};
