import { useQuery } from '@tanstack/react-query';

import { adminApi } from '../api/admin';
import { queryKeys } from '../api/queryKeys';

export function useAdminQuery(enabled = true) {
  return useQuery({ queryKey: queryKeys.admin, queryFn: adminApi.getAdmin, enabled });
}

export function useActivityQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.activity,
    queryFn: adminApi.getActivity,
    enabled,
    retry: false,
  });
}

export function useSystemStatusQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.systemStatus,
    queryFn: adminApi.getSystemStatus,
    enabled,
    retry: false,
  });
}
