import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../api/queryKeys';
import { weatherForecastApi } from '../api/weatherForecast';

const FIVE_MINUTES = 5 * 60 * 1_000;

export function useWeatherForecastQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.weather,
    queryFn: weatherForecastApi.get,
    enabled,
    placeholderData: (previous) => previous,
    refetchInterval: FIVE_MINUTES,
    refetchIntervalInBackground: false,
    staleTime: FIVE_MINUTES - 5_000,
  });
}
