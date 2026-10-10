import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { runtimeApi as hearthApi } from '../api/runtime';
import { useHearthRuntime } from '../runtime/context';
import { useSharedScreen } from '../runtime/sharedScreen';
import { authenticateWithPasskey, passkeysAvailable } from './passkeys';
import { authStatusQueryKey } from './queryKeys';

export function AdminAuthBoundary({ children }: { children: ReactNode }) {
  const runtime = useHearthRuntime();
  const sharedScreen = useSharedScreen();
  const queryClient = useQueryClient();
  const auth = useQuery({
    queryKey: authStatusQueryKey,
    queryFn: hearthApi.getAuthStatus,
    enabled: runtime.mode === 'private' && !sharedScreen,
    staleTime: 15_000,
  });
  const signIn = useMutation({
    mutationFn: authenticateWithPasskey,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: authStatusQueryKey });
    },
  });

  if (sharedScreen) return <Navigate replace to="/today" />;
  if (runtime.mode !== 'private') return children;
  if (auth.isPending) return <AdminAuthMessage title="Checking private access…" />;
  if (auth.isError) {
    return (
      <AdminAuthMessage title="Hearth could not check your sign-in" detail={auth.error.message} />
    );
  }
  if (!auth.data.configured) {
    return (
      <AdminAuthMessage
        title="Private access is not configured"
        detail="Finish Hearth’s stable private HTTPS address and passkey settings on the server first."
      />
    );
  }
  if (!auth.data.authenticated) {
    const available = auth.data.secureOrigin && passkeysAvailable();
    return (
      <section className="admin-auth-gate" aria-labelledby="admin-sign-in-title">
        <img alt="" src="/brand/hearth-mark.png" />
        <h1 id="admin-sign-in-title">Sign in to manage Hearth</h1>
        <p>
          Use your own adult passkey for controller access. A shared-screen connection does not give
          this phone household settings.
        </p>
        {!available ? (
          <p className="form-message form-message--error" role="alert">
            Open Hearth from its private HTTPS address on a passkey-capable device.
          </p>
        ) : null}
        {signIn.isError ? (
          <p className="form-message form-message--error" role="alert">
            {signIn.error.message}
          </p>
        ) : null}
        <button
          className="button button--primary"
          type="button"
          disabled={!available || signIn.isPending}
          onClick={() => signIn.mutate()}
        >
          {signIn.isPending ? 'Waiting for passkey…' : 'Sign in with a passkey'}
        </button>
      </section>
    );
  }
  return children;
}

function AdminAuthMessage({ title, detail }: { title: string; detail?: string }) {
  return (
    <section className="admin-auth-gate" aria-live="polite">
      <img alt="" src="/brand/hearth-mark.png" />
      <h1>{title}</h1>
      {detail === undefined ? null : <p>{detail}</p>}
    </section>
  );
}
