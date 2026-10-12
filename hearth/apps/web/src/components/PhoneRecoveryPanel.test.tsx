import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhoneRecoveryPanel } from './PhoneRecoveryPanel';
import { phoneApi } from '../api/phoneConnections';
import type { PhoneRecoverySummary } from '@hearth/shared';

vi.mock('../api/phoneConnections', () => ({
  phoneApi: {
    recovery: vi.fn(),
    confirm: vi.fn(),
    createRecoveryCard: vi.fn(),
    activateRecoveryCard: vi.fn(),
    updateRecovery: vi.fn(),
  },
}));
vi.mock('qrcode', () => ({ toDataURL: vi.fn(async () => 'data:image/png;base64,AAAA') }));
const owner: PhoneRecoverySummary = {
  available: true,
  ownerName: 'David',
  canManage: true,
  canRecoverOwner: false,
  hasRecoveryCard: false,
  adults: [
    {
      memberId: 'member_rachael',
      displayName: 'Rachael',
      connected: true,
      trusted: false,
      phones: [{ connectionId: 'phone_rachael', phoneName: 'Rachael’s iPhone', trusted: false }],
    },
  ],
};
const card = {
  id: 'card_fixture',
  generation: 1,
  expiresAt: '2026-10-12T00:05:00Z',
  qrUrl: `https://hearth.example.test/#recover-phone=${'A'.repeat(43)}`,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(phoneApi.recovery).mockResolvedValue(owner);
  vi.mocked(phoneApi.confirm).mockResolvedValue({
    confirmed: true,
    expiresAt: '2026-10-12T00:05:00Z',
  });
  vi.mocked(phoneApi.createRecoveryCard).mockResolvedValue(card);
  vi.mocked(phoneApi.activateRecoveryCard).mockResolvedValue({ accepted: true });
  vi.mocked(phoneApi.updateRecovery).mockResolvedValue({ accepted: true });
});
afterEach(cleanup);
function show() {
  const onRecoverOwner = vi.fn(async () => undefined);
  const view = render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <PhoneRecoveryPanel onRecoverOwner={onRecoverOwner} />
    </QueryClientProvider>,
  );
  return { ...view, onRecoverOwner };
}
async function openRecovery() {
  const details = screen.getByText('Recovery & lost phones').closest('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
  await screen.findByText('No saved recovery card yet.');
  return details;
}
describe('compact phone recovery', () => {
  it('starts collapsed and does not read private recovery status until requested', () => {
    show();
    expect(screen.queryByRole('button', { name: 'Create recovery card' })).not.toBeInTheDocument();
    expect(phoneApi.recovery).not.toHaveBeenCalled();
  });
  it('shows a private downloadable card but cannot activate it before acknowledgement', async () => {
    const { container } = show();
    await openRecovery();
    fireEvent.click(screen.getByRole('button', { name: 'Create recovery card' }));
    expect(
      await screen.findByRole('heading', { name: 'Your private recovery card' }),
    ).toBeVisible();
    expect(phoneApi.confirm).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Activate saved card' })).toBeDisabled();
    expect(phoneApi.activateRecoveryCard).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Save recovery card' })).toHaveAttribute(
      'download',
      'Hearth-recovery-card.png',
    );
    expect(container.innerHTML).not.toContain(card.qrUrl);
    expect(container.innerHTML).not.toContain('A'.repeat(43));
  });
  it('activates only after saved-card confirmation and then removes the private preview', async () => {
    show();
    await openRecovery();
    fireEvent.click(screen.getByRole('button', { name: 'Create recovery card' }));
    await screen.findByRole('heading', { name: 'Your private recovery card' });
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'I saved this somewhere other than this phone' }),
    );
    vi.mocked(phoneApi.recovery).mockResolvedValue({ ...owner, hasRecoveryCard: true });
    fireEvent.click(screen.getByRole('button', { name: 'Activate saved card' }));
    await waitFor(() =>
      expect(phoneApi.activateRecoveryCard).toHaveBeenCalledWith(card.id, expect.any(String)),
    );
    expect(await screen.findByText('Recovery card saved.')).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Your private recovery card' }),
    ).not.toBeInTheDocument();
  });
  it('keeps the old saved card state after a prepare failure', async () => {
    vi.mocked(phoneApi.recovery).mockResolvedValue({ ...owner, hasRecoveryCard: true });
    vi.mocked(phoneApi.createRecoveryCard).mockRejectedValue(
      new Error('Temporary failure. Old card remains valid.'),
    );
    show();
    const details = screen.getByText('Recovery & lost phones').closest('details')!;
    details.open = true;
    fireEvent(details, new Event('toggle'));
    fireEvent.click(await screen.findByRole('button', { name: 'Replace recovery card' }));
    expect(await screen.findByText('Temporary failure. Old card remains valid.')).toBeVisible();
    expect(screen.getByText('Recovery card saved.')).toBeVisible();
    expect(phoneApi.activateRecoveryCard).not.toHaveBeenCalled();
  });
  it('does not resurrect a private preview after the panel was closed mid-request', async () => {
    let finish!: (value: typeof card) => void;
    vi.mocked(phoneApi.createRecoveryCard).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    show();
    const details = await openRecovery();
    fireEvent.click(screen.getByRole('button', { name: 'Create recovery card' }));
    await waitFor(() => expect(phoneApi.createRecoveryCard).toHaveBeenCalledOnce());
    details.open = false;
    fireEvent(details, new Event('toggle'));
    await act(async () => finish(card));
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(await screen.findByRole('button', { name: 'Create recovery card' })).toBeEnabled();
    expect(
      screen.queryByRole('heading', { name: 'Your private recovery card' }),
    ).not.toBeInTheDocument();
  });
  it('requires deliberate selection and submits only eligible trusted adult ids', async () => {
    show();
    await openRecovery();
    expect(screen.getByRole('button', { name: 'Save trusted phones' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Rachael’s iPhone · Rachael' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save trusted phones' }));
    await waitFor(() =>
      expect(phoneApi.updateRecovery).toHaveBeenCalledWith(['phone_rachael'], expect.any(String)),
    );
    expect(phoneApi.confirm).toHaveBeenCalledOnce();
  });
  it('does not allow a profile without its own connected phone to be newly trusted', async () => {
    vi.mocked(phoneApi.recovery).mockResolvedValue({
      ...owner,
      adults: [{ ...owner.adults[0]!, connected: false, phones: [] }],
    });
    show();
    await openRecovery();
    expect(screen.queryByRole('checkbox', { name: /Rachael/ })).not.toBeInTheDocument();
    expect(screen.getByText('Connect Rachael’s own phone first')).toBeVisible();
  });
  it('offers a designated recovery adult replacement without switching their account', async () => {
    vi.mocked(phoneApi.recovery).mockResolvedValue({
      ...owner,
      canManage: false,
      canRecoverOwner: true,
    });
    const { onRecoverOwner } = show();
    await openRecovery();
    expect(screen.queryByRole('button', { name: 'Create recovery card' })).not.toBeInTheDocument();
    expect(screen.getByText(/your phone stays connected as you/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Replace David’s lost phone' }));
    await waitFor(() => expect(onRecoverOwner).toHaveBeenCalledOnce());
  });
});
