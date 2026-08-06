import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import { DemoScenarioSchema, type DemoScenario } from '@hearth/shared';

import { hearthApi, queryKeys } from '../api/client';

export function useScenario(): {
  scenario: DemoScenario | 'offline';
  preparing: boolean;
  error: string | null;
} {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const requested = searchParams.get('scenario') ?? 'healthy';
  const scenario = requested === 'offline' ? 'offline' : parseScenario(requested);
  const control = useQuery({
    queryKey: ['demo-scenario', scenario],
    queryFn: async () => {
      if (scenario === 'offline') return scenario;
      await hearthApi.setScenario(scenario);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.today }),
        queryClient.invalidateQueries({ queryKey: queryKeys.week }),
        queryClient.invalidateQueries({ queryKey: queryKeys.chores }),
        queryClient.invalidateQueries({ queryKey: queryKeys.home }),
      ]);
      return scenario;
    },
    enabled: scenario !== 'offline',
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    networkMode: 'always',
  });

  return {
    scenario,
    preparing: scenario !== 'offline' && control.isPending,
    error: control.isError ? 'Hearth could not prepare that demo state.' : null,
  };
}

function parseScenario(value: string): DemoScenario {
  const parsed = DemoScenarioSchema.safeParse(value);
  return parsed.success ? parsed.data : 'healthy';
}
