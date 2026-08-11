import { useQuery } from '@tanstack/react-query';

import { connectionsApi } from '../api/connections';
import { queryKeys } from '../api/queryKeys';

export function useCalendarConnectionQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.calendarConnection,
    queryFn: connectionsApi.getCalendarConnection,
    enabled,
    retry: false,
  });
}

export function useHomeAssistantConnectionQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.homeAssistantConnection,
    queryFn: connectionsApi.getHomeAssistantConnection,
    enabled,
    retry: false,
  });
}
