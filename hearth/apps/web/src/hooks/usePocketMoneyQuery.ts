import { useQuery } from '@tanstack/react-query';

import { getHearthRuntime } from '../api/core';
import { pocketMoneyApi } from '../api/pocketMoney';
import { queryKeys } from '../api/queryKeys';

export function usePocketMoneyQuery(
  weekStart = getHearthRuntime().weekStart,
  asOfDate = getHearthRuntime().localDate,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.pocketMoney(weekStart, asOfDate),
    queryFn: () => pocketMoneyApi.getPocketMoney(weekStart, asOfDate),
    placeholderData: (previous) => previous,
    enabled,
  });
}
