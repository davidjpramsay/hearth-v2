import { createContext, useContext } from 'react';

import type { RuntimeContext } from '@hearth/shared';

export const RuntimeContextValue = createContext<RuntimeContext | null>(null);

export function useHearthRuntime(): RuntimeContext {
  const runtime = useContext(RuntimeContextValue);
  if (runtime === null) throw new Error('Hearth runtime is not available.');
  return runtime;
}
