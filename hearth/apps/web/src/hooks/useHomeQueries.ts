import { useQuery } from '@tanstack/react-query';

import { homeApi } from '../api/home';
import { queryKeys } from '../api/queryKeys';

export function useHomeQuery(enabled = true) {
  return useQuery({ queryKey: queryKeys.home, queryFn: homeApi.getHome, enabled });
}
