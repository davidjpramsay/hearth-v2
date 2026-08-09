import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { configureHearthClient, hearthApi } from '../api/client';
import { RuntimeContextValue } from './context';

export function HearthRuntimeBootstrap({ children }: { children: ReactNode }) {
  const runtime = useQuery({
    queryKey: ['hearth-runtime'],
    queryFn: hearthApi.getRuntime,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 1,
    networkMode: 'online',
  });

  if (runtime.isPending) {
    return (
      <main className="runtime-gate" aria-busy="true" aria-live="polite">
        <img alt="" src="/brand/hearth-mark.png" />
        <h1>Starting Hearth</h1>
        <p>Loading this home’s local settings…</p>
      </main>
    );
  }

  if (runtime.isError) {
    return (
      <main className="runtime-gate" role="alert">
        <img alt="" src="/brand/hearth-mark.png" />
        <h1>Hearth could not start</h1>
        <p>Check that the Hearth server is running on this home network, then try again.</p>
        <button className="button button--primary" type="button" onClick={() => runtime.refetch()}>
          Try again
        </button>
      </main>
    );
  }

  if (runtime.data.requiresSetup || runtime.data.household === null) {
    return (
      <main className="runtime-gate">
        <img alt="" src="/brand/hearth-mark.png" />
        <h1>Set up this Hearth</h1>
        <p>
          This private Hearth is empty and ready for an adult to create the real household. No demo
          people or family data have been added.
        </p>
      </main>
    );
  }

  configureHearthClient(runtime.data);
  return (
    <RuntimeContextValue.Provider value={runtime.data}>{children}</RuntimeContextValue.Provider>
  );
}
