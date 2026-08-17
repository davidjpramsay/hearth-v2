import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PasskeyAuthStatus } from '@hearth/shared';

import { pairingApi as hearthApi } from '../api/pairing';
import { PrivateHouseholdAccess } from './PrivateHouseholdAccess';

vi.mock('../api/pairing', () => ({
  pairingApi: {
    createBrowserTelevisionSession: vi.fn(),
    exchangeBrowserTelevisionCredential: vi.fn(),
    getPairing: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

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

  it('creates a restricted browser-television pairing code without storing the secret in UI', async () => {
    const pairing = {
      id: 'pairing_browser_tv',
      requestId: 'request_browser_tv',
      code: 'M7PAIR',
      deviceName: 'Browser television',
      status: 'pending' as const,
      expiresAt: '2026-08-16T15:00:00.000Z',
      approvedDeviceId: null,
    };
    vi.mocked(hearthApi.createBrowserTelevisionSession).mockResolvedValue({ pairing });
    vi.mocked(hearthApi.getPairing).mockResolvedValue(pairing);

    renderAccess(signedOut);
    fireEvent.click(screen.getByRole('button', { name: 'Pair this screen as a television' }));

    expect(await screen.findByRole('heading', { name: 'Connect this screen' })).toBeVisible();
    expect(await screen.findByLabelText('Pairing code M7PAIR')).toBeVisible();
    expect(screen.getByText(/Admin → Televisions/)).toBeVisible();
    await waitFor(() => expect(hearthApi.createBrowserTelevisionSession).toHaveBeenCalledOnce());
    const secret = vi.mocked(hearthApi.createBrowserTelevisionSession).mock.calls[0]?.[2];
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(document.body.textContent).not.toContain(secret ?? 'missing-secret');
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
