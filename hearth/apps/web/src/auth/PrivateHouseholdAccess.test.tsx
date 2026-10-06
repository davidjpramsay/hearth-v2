import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PasskeyAuthStatus, PairingRequest } from '@hearth/shared';

import { pairingApi as hearthApi } from '../api/pairing';
import { PrivateHouseholdAccess } from './PrivateHouseholdAccess';
import { passkeysAvailable } from './passkeys';

vi.mock('./passkeys', () => ({
  passkeysAvailable: vi.fn(),
  authenticateWithPasskey: vi.fn(),
  recoverWithCode: vi.fn(),
}));

vi.mock('../api/pairing', () => ({
  pairingApi: {
    createBrowserTelevisionSession: vi.fn(),
    exchangeBrowserTelevisionCredential: vi.fn(),
    getPairing: vi.fn(),
  },
}));

beforeEach(() => {
  vi.mocked(passkeysAvailable).mockReturnValue(false);
  // jsdom does not implement native dialog lifecycle; real modal/focus behavior is browser-tested.
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
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
  it('separates personal passkey sign-in from restricted shared-screen connection', () => {
    renderAccess(signedOut);

    expect(screen.getByRole('heading', { name: 'Connect to Hearth' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Phone or computer' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Shared screen' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign in with a passkey' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('private HTTPS address');
    expect(hearthApi.createBrowserTelevisionSession).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByRole('button', { name: 'Connect shared screen' }));

    expect(await screen.findByRole('heading', { name: 'Connect this screen' })).toBeVisible();
    expect(await screen.findByLabelText('Pairing code M7PAIR')).toBeVisible();
    expect(screen.getByText(/More → Phones & screens/)).toBeVisible();
    await waitFor(() => expect(hearthApi.createBrowserTelevisionSession).toHaveBeenCalledOnce());
    const secret = vi.mocked(hearthApi.createBrowserTelevisionSession).mock.calls[0]?.[2];
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(document.body.textContent).not.toContain(secret ?? 'missing-secret');
  });

  it('does not resume a cancelled code request when its response arrives late', async () => {
    let finish = (_value: { pairing: PairingRequest }) => {};
    vi.mocked(hearthApi.createBrowserTelevisionSession).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const onComplete = vi.fn(async () => {});
    renderAccess(signedOut, onComplete);
    fireEvent.click(screen.getByRole('button', { name: 'Connect shared screen' }));
    await waitFor(() => expect(hearthApi.createBrowserTelevisionSession).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel connection' }));
    await act(async () => finish({ pairing: pairingFixture() }));
    expect(screen.getByRole('heading', { name: 'Connect to Hearth' })).toBeVisible();
    expect(hearthApi.getPairing).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does not exchange credentials after cancelling a pending approval check', async () => {
    let finish = (_value: PairingRequest) => {};
    vi.mocked(hearthApi.createBrowserTelevisionSession).mockResolvedValue({
      pairing: pairingFixture(),
    });
    vi.mocked(hearthApi.getPairing).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderAccess(signedOut);
    fireEvent.click(screen.getByRole('button', { name: 'Connect shared screen' }));
    await waitFor(() => expect(hearthApi.getPairing).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel connection' }));
    await act(async () =>
      finish({ ...pairingFixture(), status: 'approved', approvedDeviceId: 'device_fixture' }),
    );
    expect(hearthApi.exchangeBrowserTelevisionCredential).not.toHaveBeenCalled();
  });

  it('removes expired codes and offers a fresh connection attempt', async () => {
    vi.mocked(hearthApi.createBrowserTelevisionSession).mockResolvedValue({
      pairing: pairingFixture(),
    });
    vi.mocked(hearthApi.getPairing).mockResolvedValue({ ...pairingFixture(), status: 'expired' });
    renderAccess(signedOut);
    fireEvent.click(screen.getByRole('button', { name: 'Connect shared screen' }));
    expect(await screen.findByText('Code expired. Get a new code to try again.')).toBeVisible();
    expect(screen.queryByLabelText('Pairing code M7PAIR')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Get a new code' }));
    await waitFor(() => expect(hearthApi.createBrowserTelevisionSession).toHaveBeenCalledTimes(2));
  });

  it('does not exchange a late approval after leaving the connection screen', async () => {
    let finish = (_value: PairingRequest) => {};
    vi.mocked(hearthApi.createBrowserTelevisionSession).mockResolvedValue({
      pairing: pairingFixture(),
    });
    vi.mocked(hearthApi.getPairing).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const view = renderAccess(signedOut);
    fireEvent.click(screen.getByRole('button', { name: 'Connect shared screen' }));
    await waitFor(() => expect(hearthApi.getPairing).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () =>
      finish({ ...pairingFixture(), status: 'approved', approvedDeviceId: 'device_fixture' }),
    );
    expect(hearthApi.exchangeBrowserTelevisionCredential).not.toHaveBeenCalled();
  });

  it('opens Hearth exactly once after approval and secret exchange', async () => {
    vi.mocked(hearthApi.createBrowserTelevisionSession).mockResolvedValue({
      pairing: pairingFixture(),
    });
    vi.mocked(hearthApi.getPairing).mockResolvedValue({
      ...pairingFixture(),
      status: 'approved',
      approvedDeviceId: 'device_fixture',
    });
    vi.mocked(hearthApi.exchangeBrowserTelevisionCredential).mockResolvedValue({
      deviceId: 'device_fixture',
      householdId: 'household_fixture',
      deviceName: 'Wall tablet',
      scopes: ['household.read'],
      pairedAt: '2026-08-16T14:30:00.000Z',
    });
    const onComplete = vi.fn(async () => {});
    renderAccess(signedOut, onComplete);
    fireEvent.click(screen.getByRole('button', { name: 'Connect shared screen' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    expect(hearthApi.exchangeBrowserTelevisionCredential).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('Connected. Opening Hearth…');
  });
});

function pairingFixture(): PairingRequest {
  return {
    id: 'pairing_browser_tv',
    requestId: 'request_browser_tv',
    code: 'M7PAIR',
    deviceName: 'Browser television',
    status: 'pending',
    expiresAt: '2026-08-16T15:00:00.000Z',
    approvedDeviceId: null,
  };
}

function renderAccess(auth: PasskeyAuthStatus, onComplete = vi.fn(async () => {})) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PrivateHouseholdAccess auth={auth} onComplete={onComplete} />
    </QueryClientProvider>,
  );
}
