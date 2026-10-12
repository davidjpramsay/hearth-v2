import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhoneAccess } from './PhoneAccess';
import { phoneApi } from '../api/phoneConnections';
import type { PasskeyAuthStatus } from '@hearth/shared';

vi.mock('../api/phoneConnections', () => ({
  phoneApi: {
    pending: vi.fn(),
    ownerClaim: vi.fn(),
    claim: vi.fn(),
    exchange: vi.fn(),
    recoverWithCard: vi.fn(),
  },
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
  it('can leave a scanned recovery without submitting it or disconnecting a phone', async () => {
    window.history.replaceState(null, '', `/#recover-phone=${'A'.repeat(43)}`);
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Back to connection options' }));
    expect(screen.queryByLabelText('Replacement phone name')).not.toBeInTheDocument();
    expect(phoneApi.recoverWithCard).not.toHaveBeenCalled();
    await waitFor(() => expect(phoneApi.pending).toHaveBeenCalled());
  });

  it('uses a scanned setup card without rendering a copied-key field', async () => {
    const key = 'a'.repeat(64);
    window.history.replaceState(null, '', `/#setup-phone=${key}`);
    vi.mocked(phoneApi.ownerClaim).mockResolvedValue({
      authenticated: true,
      householdId: 'household_fixture',
      memberId: 'member_david',
      displayName: 'David',
      expiresAt: '2027-01-01T00:00:00Z',
    });
    const complete = show({ auth: { ...auth, requiresSetup: true } });
    expect(window.location.hash).toBe('');
    expect(screen.queryByLabelText('Owner setup key')).not.toBeInTheDocument();
    expect(screen.getByText(/Setup card recognised/)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'David' } });
    fireEvent.change(screen.getByLabelText('Phone name'), { target: { value: 'David’s iPhone' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create household and connect' }));
    await waitFor(() =>
      expect(vi.mocked(phoneApi.ownerClaim).mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({ ownerKey: key, adultName: 'David', phoneName: 'David’s iPhone' }),
      ),
    );
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
  });
  it('cannot repurpose a first-setup QR as existing owner recovery', async () => {
    window.history.replaceState(null, '', `/#setup-phone=${'a'.repeat(64)}`);
    show();
    expect(screen.getByText('This Hearth is already set up')).toBeVisible();
    expect(phoneApi.ownerClaim).not.toHaveBeenCalled();
    expect(phoneApi.recoverWithCard).not.toHaveBeenCalled();
  });
  it('binds a scanned recovery to an exact retry without exposing the private card', async () => {
    const secret = 'A'.repeat(43);
    window.history.replaceState(null, '', `/#recover-phone=${secret}`);
    vi.mocked(phoneApi.recoverWithCard)
      .mockRejectedValueOnce(new Error('Temporary interruption'))
      .mockResolvedValueOnce({
        authenticated: true,
        householdId: 'household_fixture',
        memberId: 'member_david',
        displayName: 'David',
        expiresAt: '2027-01-01T00:00:00Z',
      });
    const complete = show();
    expect(window.location.hash).toBe('');
    expect(screen.queryByDisplayValue(secret)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Replacement phone name'), {
      target: { value: 'David’s new phone' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Replace lost owner phone' }));
    await screen.findByText('Temporary interruption');
    const first = vi.mocked(phoneApi.recoverWithCard).mock.calls[0]![0];
    expect(first.recoverySecret).toBe(secret);
    expect(screen.getByLabelText('Replacement phone name')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry this recovery' }));
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(vi.mocked(phoneApi.recoverWithCard).mock.calls[1]![0]).toEqual(first);
  });
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
