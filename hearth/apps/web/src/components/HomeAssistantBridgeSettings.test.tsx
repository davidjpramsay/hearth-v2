import type { AdminOverview, BridgeConnection } from '@hearth/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../api/admin';
import { configureHearthClient, clearHearthClient } from '../api/core';
import { HomeAssistantBridgeApiError, homeAssistantBridgeApi } from '../api/homeAssistantBridge';
import { HomeAssistantBridgeSettings } from './HomeAssistantBridgeSettings';
import type * as BridgeModule from '../api/homeAssistantBridge';

vi.mock('../api/admin', () => ({ adminApi: { getAdmin: vi.fn() } }));
vi.mock('../api/homeAssistantBridge', async (original) => ({
  ...(await original<typeof BridgeModule>()),
  homeAssistantBridgeApi: { getConnection: vi.fn(), approvePairing: vi.fn(), revoke: vi.fn() },
}));
const summary: BridgeConnection = {
  id: 'bridge_test',
  createdAt: '2026-10-15T00:00:00Z',
  revokedAt: null,
  screenIds: ['screen_active'],
  shareChores: true,
  shareCalendar: false,
  controlChores: true,
};
const overview = {
  pairedDevices: [
    {
      id: 'screen_active',
      name: 'Living room screen',
      type: 'television',
      status: 'connected',
      revokedAt: null,
    },
    {
      id: 'screen_revoked',
      name: 'Revoked screen',
      type: 'television',
      status: 'revoked',
      revokedAt: '2026-10-15T00:00:00Z',
    },
  ],
} as AdminOverview;
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <HomeAssistantBridgeSettings />
      </QueryClientProvider>,
    ),
  };
}
async function ready() {
  const input = await screen.findByLabelText('Code shown in Home Assistant');
  fireEvent.change(input, { target: { value: 'abc def' } });
  return screen.getByRole('button', { name: 'Approve Home Assistant' });
}
beforeEach(() => {
  configureHearthClient({
    mode: 'private',
    generatedAt: '2026-10-15T00:00:00Z',
    household: {
      id: 'household_test',
      name: 'Test home',
      timezone: 'Australia/Perth',
      locale: 'en-AU',
    },
    timezone: 'Australia/Perth',
    locale: 'en-AU',
    localDate: '2026-10-15',
    weekStart: '2026-10-12',
    currentMonth: '2026-10',
    requiresSetup: false,
  });
  vi.mocked(adminApi.getAdmin).mockReset().mockResolvedValue(overview);
  vi.mocked(homeAssistantBridgeApi.getConnection).mockReset().mockResolvedValue(null);
  vi.mocked(homeAssistantBridgeApi.approvePairing)
    .mockReset()
    .mockResolvedValue({ approved: true, expiresAt: '2026-10-15T00:05:00Z' });
  vi.mocked(homeAssistantBridgeApi.revoke).mockReset().mockResolvedValue({ revoked: true });
});
afterEach(() => {
  cleanup();
  clearHearthClient();
  vi.restoreAllMocks();
});
describe('short-code Home Assistant connection', () => {
  it('defaults permissions off, excludes revoked screens and never offers a key field', async () => {
    show();
    await ready();
    expect(screen.getByLabelText('Living room screen')).not.toBeChecked();
    expect(screen.queryByLabelText('Revoked screen')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Share chores (read only)')).not.toBeChecked();
    expect(screen.getByLabelText('Share calendar (read only)')).not.toBeChecked();
    expect(screen.getByLabelText('Allow completing and reopening today’s chores')).toBeDisabled();
    expect(screen.queryByLabelText('One-time key')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Code shown in Home Assistant')).toHaveValue('ABCDEF');
    expect(homeAssistantBridgeApi.approvePairing).not.toHaveBeenCalled();
  });
  it('sends only the short approval and selected permissions, without storage or mutation caching', async () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const { client } = show();
    const button = await ready();
    fireEvent.click(screen.getByLabelText('Share chores (read only)'));
    fireEvent.click(button);
    await screen.findByText(/Approved. Home Assistant/);
    expect(homeAssistantBridgeApi.approvePairing).toHaveBeenCalledWith(
      {
        requestId: expect.any(String),
        code: 'ABCDEF',
        screenIds: [],
        shareChores: true,
        shareCalendar: false,
        controlChores: false,
      },
      expect.any(AbortSignal),
    );
    expect(storage).not.toHaveBeenCalled();
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain('ABCDEF');
  });
  it('requires separate opt-in and clears control when sharing is unchecked', async () => {
    show();
    const button = await ready();
    const share = screen.getByLabelText('Share chores (read only)');
    const control = screen.getByLabelText('Allow completing and reopening today’s chores');
    fireEvent.click(share);
    fireEvent.click(control);
    fireEvent.click(share);
    expect(control).not.toBeChecked();
    expect(control).toBeDisabled();
    fireEvent.click(share);
    fireEvent.click(control);
    fireEvent.click(button);
    await screen.findByText(/Approved. Home Assistant/);
    expect(vi.mocked(homeAssistantBridgeApi.approvePairing).mock.calls[0]![0]).toMatchObject({
      shareChores: true,
      controlChores: true,
    });
  });
  it('keeps invalid/incomplete codes out of requests', async () => {
    show();
    await ready();
    const input = screen.getByLabelText('Code shown in Home Assistant');
    for (const value of ['ABCDE', 'ABCDIO', '123456']) {
      fireEvent.change(input, { target: { value } });
      expect(screen.getByRole('button', { name: 'Approve Home Assistant' })).toBeDisabled();
    }
    expect(homeAssistantBridgeApi.approvePairing).not.toHaveBeenCalled();
  });
  it('retries an uncertain approval with identical request identity and no response-body disclosure', async () => {
    vi.mocked(homeAssistantBridgeApi.approvePairing).mockRejectedValueOnce(
      new Error('private error text'),
    );
    show();
    fireEvent.click(await ready());
    fireEvent.click(await screen.findByRole('button', { name: 'Retry same approval' }));
    await screen.findByText(/Approved. Home Assistant/);
    const calls = vi.mocked(homeAssistantBridgeApi.approvePairing).mock.calls;
    expect(calls[1]![0]).toBe(calls[0]![0]);
    expect(screen.queryByText('private error text')).not.toBeInTheDocument();
  });
  it('lets an adult correct an expired/rejected code without silently approving a replacement', async () => {
    vi.mocked(homeAssistantBridgeApi.approvePairing).mockRejectedValueOnce(
      new HomeAssistantBridgeApiError(403),
    );
    show();
    fireEvent.click(await ready());
    await screen.findByText(/Check the six letters/);
    expect(screen.getByLabelText('Code shown in Home Assistant')).toBeEnabled();
    expect(homeAssistantBridgeApi.approvePairing).toHaveBeenCalledOnce();
  });
  it('requires confirmation to disconnect and reuses an uncertain revocation request', async () => {
    vi.mocked(homeAssistantBridgeApi.getConnection).mockResolvedValue(summary);
    vi.mocked(homeAssistantBridgeApi.revoke).mockRejectedValueOnce(new Error('lost reply'));
    show();
    await screen.findByText('Home Assistant is connected');
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Home Assistant' }));
    expect(homeAssistantBridgeApi.revoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep access' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect Home Assistant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, disconnect' }));
    await screen.findByText('Disconnection could not be confirmed. Try again.');
    fireEvent.click(screen.getByRole('button', { name: 'Yes, disconnect' }));
    await screen.findByLabelText('Code shown in Home Assistant');
    const calls = vi.mocked(homeAssistantBridgeApi.revoke).mock.calls;
    expect(calls[1]![0]).toBe(calls[0]![0]);
  });
  it('does not offer approval while connection status is unknown', async () => {
    vi.mocked(homeAssistantBridgeApi.getConnection).mockRejectedValueOnce(new Error('offline'));
    show();
    await screen.findByText('Could not load Home Assistant access.');
    expect(
      screen.queryByRole('button', { name: 'Approve Home Assistant' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await ready();
  });
  it('cancels requests on unmount and does not turn a late reply into UI or cache authority', async () => {
    let finish!: (result: { approved: true; expiresAt: string }) => void;
    vi.mocked(homeAssistantBridgeApi.approvePairing).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const view = show();
    fireEvent.click(await ready());
    await waitFor(() => expect(homeAssistantBridgeApi.approvePairing).toHaveBeenCalledOnce());
    const signal = vi.mocked(homeAssistantBridgeApi.approvePairing).mock.calls[0]![1]!;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => finish({ approved: true, expiresAt: '2026-10-15T00:05:00Z' }));
    show();
    await ready();
    expect(screen.queryByText(/Approved. Home Assistant/)).not.toBeInTheDocument();
  });
});
