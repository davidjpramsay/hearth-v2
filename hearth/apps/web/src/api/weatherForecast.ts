import { WeatherForecastSchema } from '@hearth/shared';

import { householdApiBase, request } from './core';

export const weatherForecastApi = {
  get: () => request(`${householdApiBase()}/weather`, WeatherForecastSchema),
};
