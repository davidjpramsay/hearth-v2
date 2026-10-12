import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { phoneApi } from '../api/phoneConnections';
import { PhoneConnectionsPanel } from './PhoneConnectionsPanel';

vi.mock('../api/phoneConnections', () => ({ phoneApi: { list: vi.fn(), remove: vi.fn() } }));
const stamp = '2026-10-12T00:00:00.000Z';
const connections = [
  {
    id: 'phone_owner',
    memberId: 'member_david',
    adultName: 'David',
    phoneName: 'David’s iPhone',
    source: 'owner' as const,
    createdAt: stamp,
    lastSeenAt: stamp,
    expiresAt: '2027-04-01T00:00:00Z',
    current: false,
  },
  {
    id: 'phone_rachael',
    memberId: 'member_rachael',
    adultName: 'Rachael',
    phoneName: 'Rachael’s iPhone',
    source: 'qr' as const,
    createdAt: stamp,
    lastSeenAt: stamp,
    expiresAt: '2027-04-01T00:00:00Z',
    current: false,
  },
];
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(phoneApi.list).mockResolvedValue({ connections, adults: [] });
});
afterEach(cleanup);
function show() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <PhoneConnectionsPanel />
    </QueryClientProvider>,
  );
}
describe('protected owner phone menu', () => {
  it('marks the owner clearly and never offers a remove button for it', async () => {
    show();
    expect(await screen.findByText('David · owner phone')).toBeVisible();
    expect(screen.getByText('Protected owner phone')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Remove David’s iPhone' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Rachael’s iPhone' })).toBeEnabled();
  });
  it('still confirms and removes the selected secondary phone only', async () => {
    vi.mocked(phoneApi.remove).mockResolvedValue({ removed: true, current: false });
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Rachael’s iPhone' }));
    expect(screen.getByText(/Other phones and screens stay connected/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Remove phone' }));
    await waitFor(() =>
      expect(phoneApi.remove).toHaveBeenCalledWith('phone_rachael', expect.any(String)),
    );
    expect(phoneApi.remove).toHaveBeenCalledOnce();
  });
});
