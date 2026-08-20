import {
  WeatherLocationCommandResultSchema,
  WeatherLocationSchema,
  WeatherLocationSearchResultsSchema,
  WeatherLocationTestResultSchema,
  type WeatherLocation,
  type WeatherLocationCommandResult,
  type WeatherLocationSearchResults,
  type WeatherLocationTestRequest,
  type WeatherLocationTestResult,
} from '@hearth/shared';

import { demoAdminHeaders, householdApiBase, request } from './core';

export const weatherApi = {
  getLocation: (): Promise<WeatherLocation | null> =>
    request(`${householdApiBase()}/weather-location`, WeatherLocationSchema.nullable(), {
      headers: demoAdminHeaders,
    }),
  search: (query: string): Promise<WeatherLocationSearchResults> =>
    request(`${householdApiBase()}/weather-location-searches`, WeatherLocationSearchResultsSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify({ query }),
    }),
  test: (input: WeatherLocationTestRequest): Promise<WeatherLocationTestResult> =>
    request(`${householdApiBase()}/weather-location-tests`, WeatherLocationTestResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  save: (input: { requestId: string; testId: string }): Promise<WeatherLocationCommandResult> =>
    request(`${householdApiBase()}/weather-location`, WeatherLocationCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
};
