import {
  IndoorClimateSchema,
  IndoorDiscoverySchema,
  IndoorSettingsSchema,
  IndoorSettingsResultSchema,
  type IndoorPeriod,
  type SaveIndoorSettings,
  type HomeAssistantConnectionTestRequest,
} from '@hearth/shared';
import { householdApiBase, request, demoAdminHeaders } from './core';
const base = () => `${householdApiBase()}/indoor-climate-settings`;
export const indoorApi = {
  read: (period: IndoorPeriod, signal: AbortSignal) =>
    request(`${householdApiBase()}/indoor-climate?period=${period}`, IndoorClimateSchema, {
      signal,
    }),
  settings: (signal: AbortSignal) =>
    request(base(), IndoorSettingsSchema, { signal, headers: demoAdminHeaders }),
  test: (input: HomeAssistantConnectionTestRequest) =>
    request(
      `${base()}/tests`,
      IndoorDiscoverySchema,
      { method: 'POST', headers: demoAdminHeaders, body: JSON.stringify(input) },
      30_000,
    ),
  discover: () =>
    request(
      `${base()}/discoveries`,
      IndoorDiscoverySchema,
      { method: 'POST', headers: demoAdminHeaders, body: '{}' },
      30_000,
    ),
  save: (input: SaveIndoorSettings) =>
    request(base(), IndoorSettingsResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
};
