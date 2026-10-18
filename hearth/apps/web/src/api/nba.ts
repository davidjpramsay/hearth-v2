import {
  NbaOverviewSchema,
  NbaSettingsSchema,
  NbaSettingsResultSchema,
  type UpdateNbaSettings,
} from '@hearth/shared';
import { demoAdminHeaders, getHearthRuntime, householdApiBase, request } from './core';
const headers = () => (getHearthRuntime().mode === 'private' ? {} : demoAdminHeaders);
export const nbaApi = {
  get: (signal?: AbortSignal) =>
    request(`${householdApiBase()}/nba`, NbaOverviewSchema, { ...(signal ? { signal } : {}) }),
  settings: (signal?: AbortSignal) =>
    request(`${householdApiBase()}/nba/settings`, NbaSettingsSchema, {
      headers: headers(),
      ...(signal ? { signal } : {}),
    }),
  save: (input: UpdateNbaSettings) =>
    request(`${householdApiBase()}/nba/settings`, NbaSettingsResultSchema, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(input),
    }),
};
