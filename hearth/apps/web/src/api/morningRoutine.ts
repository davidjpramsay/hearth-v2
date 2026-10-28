import {
  MorningOverviewSchema,
  MorningSettingsSchema,
  MorningSettingsResultSchema,
  MorningCompletionResultSchema,
  type UpdateMorningSettings,
  type SetMorningCompletion,
} from '@hearth/shared';
import { demoAdminHeaders, getHearthRuntime, householdApiBase, request } from './core';
const headers = () => (getHearthRuntime().mode === 'private' ? {} : demoAdminHeaders);
export const morningRoutineApi = {
  get: (signal?: AbortSignal) =>
    request(`${householdApiBase()}/morning-routine`, MorningOverviewSchema, {
      ...(signal ? { signal } : {}),
    }),
  settings: (signal?: AbortSignal) =>
    request(`${householdApiBase()}/morning-routine/settings`, MorningSettingsSchema, {
      headers: headers(),
      ...(signal ? { signal } : {}),
    }),
  save: (input: UpdateMorningSettings) =>
    request(`${householdApiBase()}/morning-routine/settings`, MorningSettingsResultSchema, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(input),
    }),
  complete: (input: SetMorningCompletion) =>
    request(`${householdApiBase()}/morning-routine/completion`, MorningCompletionResultSchema, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
};
