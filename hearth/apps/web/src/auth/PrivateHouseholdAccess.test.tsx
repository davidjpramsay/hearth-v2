import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PasskeyAuthStatus } from '@hearth/shared';

import { PrivateHouseholdAccess } from './PrivateHouseholdAccess';

afterEach(cleanup);

const signedOut: PasskeyAuthStatus = {
  mode: 'private',
  configured: true,
  secureOrigin: true,
  requiresSetup: false,
  authenticated: false,
  actor: null,
};

describe('PrivateHouseholdAccess', () => {
  it('explains that household data needs a passkey sign-in', () => {
    renderAccess(signedOut);

    expect(screen.getByRole('heading', { name: 'Sign in to open Hearth' })).toBeVisible();
    expect(screen.getByText(/calendar, photos and family information private/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign in with a passkey' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('private HTTPS address');
  });

  it('provides a safe way out of a signed-in account without household access', () => {
    renderAccess({
      ...signedOut,
      authenticated: true,
      actor: { id: 'member_maya', displayName: 'Maya', role: 'adult' },
    });

    expect(
      screen.getByRole('heading', { name: 'This account cannot open this Hearth' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign out and use another passkey' })).toBeEnabled();
  });
});

function renderAccess(auth: PasskeyAuthStatus) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PrivateHouseholdAccess auth={auth} onComplete={vi.fn()} />
    </QueryClientProvider>,
  );
}
