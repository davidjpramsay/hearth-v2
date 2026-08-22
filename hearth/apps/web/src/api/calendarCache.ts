import type { QueryClient } from '@tanstack/react-query';

import { queryKeys } from './queryKeys';

export async function invalidateCalendarDisplays(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.today }),
    queryClient.invalidateQueries({ queryKey: queryKeys.weekRoot }),
    queryClient.invalidateQueries({ queryKey: queryKeys.monthRoot }),
  ]);
}
