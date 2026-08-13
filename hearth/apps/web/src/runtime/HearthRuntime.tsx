import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, type ReactNode } from 'react';

import { configureHearthClient } from '../api/core';
import { runtimeApi as hearthApi } from '../api/runtime';
import { authStatusQueryKey } from '../auth/queryKeys';
import { RuntimeContextValue } from './context';

const FirstUseSetup = lazy(async () => ({
  default: (await import('../auth/FirstUseSetup')).FirstUseSetup,
}));
const PrivateHouseholdAccess = lazy(async () => ({
  default: (await import('../auth/PrivateHouseholdAccess')).PrivateHouseholdAccess,
}));

export function HearthRuntimeBootstrap({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const runtime = useQuery({
    queryKey: ['hearth-runtime'],
    queryFn: hearthApi.getRuntime,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 1,
    networkMode: 'online',
  });
  const auth = useQuery({
    queryKey: authStatusQueryKey,
    queryFn: hearthApi.getAuthStatus,
    enabled: runtime.data?.mode === 'private' && runtime.data.household === null,
    staleTime: 15_000,
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
    if (runtime.data.mode === 'private') {
      if (auth.isPending) {
        return (
          <main className="runtime-gate" aria-busy="true" aria-live="polite">
            <img alt="" src="/brand/hearth-mark.png" />
            <h1>Preparing secure setup</h1>
            <p>Checking this Hearth’s private passkey settings…</p>
          </main>
        );
      }
      if (auth.isError) {
        return (
          <main className="runtime-gate" role="alert">
            <img alt="" src="/brand/hearth-mark.png" />
            <h1>Secure setup could not start</h1>
            <p>{auth.error.message}</p>
            <button className="button button--primary" type="button" onClick={() => auth.refetch()}>
              Try again
            </button>
          </main>
        );
      }
      const refreshAccess = async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['hearth-runtime'] }),
          queryClient.invalidateQueries({ queryKey: authStatusQueryKey }),
        ]);
      };
      return (
        <Suspense fallback={<SecureSetupLoading />}>
          {runtime.data.requiresSetup ? (
            <FirstUseSetup runtime={runtime.data} auth={auth.data} onComplete={refreshAccess} />
          ) : (
            <PrivateHouseholdAccess auth={auth.data} onComplete={refreshAccess} />
          )}
        </Suspense>
      );
    }
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

function SecureSetupLoading() {
  return (
    <main className="runtime-gate" aria-busy="true" aria-live="polite">
      <img alt="" src="/brand/hearth-mark.png" />
      <h1>Preparing secure setup</h1>
      <p>Loading this Hearth’s private setup tools…</p>
    </main>
  );
}
