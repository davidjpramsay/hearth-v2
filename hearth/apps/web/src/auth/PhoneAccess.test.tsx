import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhoneAccess } from './PhoneAccess';
import { phoneApi } from '../api/phoneConnections';
import type { PasskeyAuthStatus } from '@hearth/shared';

vi.mock('../api/phoneConnections', () => ({
  phoneApi: { pending: vi.fn(), ownerClaim: vi.fn(), claim: vi.fn(), exchange: vi.fn() },
}));
const auth: PasskeyAuthStatus = {
  mode: 'private',
  accessMethod: 'phone',
  configured: true,
  secureOrigin: true,
  requiresSetup: false,
  authenticated: false,
  actor: null,
};
const state = {
  id: 'phone_invitation_fixture',
  state: 'approved' as const,
  adultName: 'Rachael',
  phoneName: 'Rachael’s iPhone',
  expiresAt: '2026-10-12T00:05:00Z',
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(phoneApi.pending).mockResolvedValue(null);
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function show(props: Partial<Parameters<typeof PhoneAccess>[0]> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onComplete = vi.fn(async () => undefined);
  render(
    <QueryClientProvider client={client}>
      <PhoneAccess auth={auth} onComplete={onComplete} {...props} />
    </QueryClientProvider>,
  );
  return onComplete;
}
describe('no-passkey phone access', () => {
  it('offers no disconnect route when an owner phone scans an invitation', async () => {
    show({
      auth: {
        ...auth,
        authenticated: true,
        ownerPhone: true,
        actor: { id: 'member_david', displayName: 'David', role: 'adult' },
      },
      invitationSecret: 'a'.repeat(43),
    });
    expect(screen.getByText(/protected owner phone/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /Disconnect/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep current connection' })).toBeEnabled();
    expect(phoneApi.claim).not.toHaveBeenCalled();
  });
  it('never silently replaces an already connected adult when a QR is scanned', async () => {
    const complete = show({
      auth: {
        ...auth,
        authenticated: true,
        actor: { id: 'member_david', displayName: 'David', role: 'adult' },
      },
      invitationSecret: 'a'.repeat(43),
    });
    expect(screen.getByRole('heading', { name: 'Already connected as David' })).toBeVisible();
    expect(screen.queryByLabelText('Phone name')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep current connection' }));
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(phoneApi.claim).not.toHaveBeenCalled();
    expect(phoneApi.exchange).not.toHaveBeenCalled();
  });
  it('explains the single QR route and keeps owner recovery secondary', async () => {
    show();
    expect(await screen.findByText(/Scan its QR/)).toBeVisible();
    expect(screen.queryByText(/Sign in with a passkey/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Owner setup key')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Owner phone setup or replacement'));
    fireEvent.click(screen.getByRole('button', { name: 'Use owner setup key' }));
    expect(screen.getByLabelText('Owner setup key')).toHaveAttribute('type', 'password');
  });
  it('removes an invitation fragment before sending a request, without using browser storage', async () => {
    const stored = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: stored });
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: stored });
    const secret = 'a'.repeat(43);
    window.history.replaceState(null, '', `/#connect-phone=${secret}`);
    vi.mocked(phoneApi.claim).mockResolvedValue({ ...state, state: 'scanned' });
    show();
    expect(window.location.hash).toBe('');
    fireEvent.change(screen.getByLabelText('Phone name'), {
      target: { value: 'Rachael’s iPhone' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request connection' }));
    await waitFor(() => expect(phoneApi.claim).toHaveBeenCalledWith(secret, 'Rachael’s iPhone'));
    expect(stored).not.toHaveBeenCalled();
  });
  it('clearly confirms the selected adult before exchange', async () => {
    vi.mocked(phoneApi.pending).mockResolvedValue(state);
    vi.mocked(phoneApi.exchange).mockResolvedValue({
      authenticated: true,
      householdId: 'household_fixture',
      memberId: 'member_rachael',
      displayName: 'Rachael',
      expiresAt: '2027-01-01T00:00:00Z',
    });
    const complete = show();
    fireEvent.click(await screen.findByRole('button', { name: 'Connect as Rachael' }));
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(phoneApi.exchange).toHaveBeenCalledOnce();
  });
  it('retries a just-connected lost reply instead of looping on an unauthenticated Open Hearth action', async () => {
    vi.mocked(phoneApi.pending).mockResolvedValue({ ...state, state: 'connected' });
    vi.mocked(phoneApi.exchange).mockRejectedValue(
      new Error('The connection reply was lost. Ask for a new QR.'),
    );
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Finish connecting' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/new QR/);
  });
  it('shows expired requests without attempting an exchange automatically', async () => {
    vi.mocked(phoneApi.pending).mockResolvedValue({ ...state, state: 'expired' });
    show();
    expect(await screen.findByText(/QR is no longer available/)).toBeVisible();
    expect(phoneApi.exchange).not.toHaveBeenCalled();
  });
  it('bootstraps with an owner key and clears the form secret immediately', async () => {
    vi.mocked(phoneApi.ownerClaim).mockRejectedValue(new Error('Not accepted'));
    show({ auth: { ...auth, requiresSetup: true } });
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'David' } });
    fireEvent.change(screen.getByLabelText('Phone name'), { target: { value: 'David’s iPhone' } });
    fireEvent.change(screen.getByLabelText('Owner setup key'), {
      target: { value: 'b'.repeat(64) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create household and connect' }));
    await waitFor(() => expect(phoneApi.ownerClaim).toHaveBeenCalledOnce());
    expect(screen.getByLabelText('Owner setup key')).toHaveValue('');
    expect(await screen.findByRole('alert')).toHaveTextContent('Not accepted');
  });
});
