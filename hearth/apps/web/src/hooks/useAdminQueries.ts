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

export function useApplianceUpdateQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.applianceUpdate,
    queryFn: adminApi.getApplianceUpdate,
    enabled,
    retry: false,
    refetchInterval: (query) => {
      const phase = query.state.data?.operation.phase;
      return phase === 'queued' ||
        phase === 'installing' ||
        phase === 'checking-health' ||
        phase === 'rolling-back'
        ? 2_000
        : false;
    },
  });
}
