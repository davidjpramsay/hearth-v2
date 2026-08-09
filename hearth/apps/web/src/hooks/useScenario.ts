import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import { DemoScenarioSchema, type DemoScenario } from '@hearth/shared';

import { hearthApi, queryKeys } from '../api/client';
import { useHearthRuntime } from '../runtime/context';

export function useScenario(): {
  scenario: DemoScenario | 'offline';
  preparing: boolean;
  error: string | null;
} {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const runtime = useHearthRuntime();
  const requested = searchParams.get('scenario') ?? 'healthy';
  const scenario = requested === 'offline' ? 'offline' : parseScenario(requested);
  const control = useQuery({
    queryKey: ['demo-scenario', scenario],
    queryFn: async () => {
      if (scenario === 'offline' || runtime.mode === 'private') return scenario;
      await hearthApi.setScenario(scenario);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.today }),
        queryClient.invalidateQueries({ queryKey: queryKeys.week }),
        queryClient.invalidateQueries({ queryKey: queryKeys.chores }),
        queryClient.invalidateQueries({ queryKey: queryKeys.home }),
      ]);
      return scenario;
    },
    enabled: scenario !== 'offline' && runtime.mode !== 'private',
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    networkMode: 'always',
  });

  return {
    scenario: runtime.mode === 'private' ? 'healthy' : scenario,
    preparing: runtime.mode !== 'private' && scenario !== 'offline' && control.isPending,
    error: control.isError ? 'Hearth could not prepare that demo state.' : null,
  };
}

function parseScenario(value: string): DemoScenario {
  const parsed = DemoScenarioSchema.safeParse(value);
  return parsed.success ? parsed.data : 'healthy';
}
