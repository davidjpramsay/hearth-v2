import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '../api/queryKeys';
import { weatherApi } from '../api/weather';

export function useWeatherLocationQuery() {
  return useQuery({
    queryKey: queryKeys.weatherLocation,
    queryFn: weatherApi.getLocation,
    retry: false,
  });
}
