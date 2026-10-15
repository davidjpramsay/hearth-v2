import type {
  AdminOverview,
  BridgeConnection,
  BridgeGrantRequest,
  RuntimeContext,
} from '@hearth/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminApi } from '../api/admin';
import { clearHearthClient, configureHearthClient } from '../api/core';
import { homeAssistantBridgeApi } from '../api/homeAssistantBridge';
import { HomeAssistantBridgeSettings } from './HomeAssistantBridgeSettings';

vi.mock('../api/admin', () => ({ adminApi: { getAdmin: vi.fn() } }));
vi.mock('../api/homeAssistantBridge', () => ({
  homeAssistantBridgeApi: { getConnection: vi.fn(), issue: vi.fn(), revoke: vi.fn() },
}));
const stamp = '2026-10-15T00:00:00.000Z';
const summary: BridgeConnection = {
  id: 'bridge_test',
  createdAt: stamp,
  revokedAt: null,
  screenIds: ['screen_active'],
  shareChores: false,
  shareCalendar: false,
  controlChores: false,
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
      revokedAt: stamp,
    },
    {
      id: 'screen_inconsistent',
      name: 'Revocation pending screen',
      type: 'television',
      status: 'connected',
      revokedAt: stamp,
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
  const button = await screen.findByRole('button', { name: 'Create Home Assistant key' });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}
function success(input: BridgeGrantRequest) {
  return Promise.resolve({
    connection: {
      ...summary,
      screenIds: input.screenIds,
      shareChores: input.shareChores,
      shareCalendar: input.shareCalendar,
      controlChores: input.controlChores,
    },
    replayed: false,
  });
}
beforeEach(() => {
  configureHearthClient({
    mode: 'private',
    generatedAt: stamp,
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
  } satisfies RuntimeContext);
  vi.mocked(adminApi.getAdmin).mockReset().mockResolvedValue(overview);
  vi.mocked(homeAssistantBridgeApi.getConnection).mockReset().mockResolvedValue(null);
  vi.mocked(homeAssistantBridgeApi.issue).mockReset().mockImplementation(success);
  vi.mocked(homeAssistantBridgeApi.revoke).mockReset().mockResolvedValue({ revoked: true });
});
afterEach(() => {
  cleanup();
  clearHearthClient();
  vi.restoreAllMocks();
});

describe('Home Assistant inbound bridge setup', () => {
  it('offers only unrevoked screens and defaults all permissions to false', async () => {
    show();
    await ready();
    expect(screen.getByLabelText('Living room screen')).not.toBeChecked();
    expect(screen.queryByLabelText('Revoked screen')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Revocation pending screen')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Share chores (read only)')).not.toBeChecked();
    expect(screen.getByLabelText('Share calendar (read only)')).not.toBeChecked();
    expect(
      screen.getByLabelText('Allow completing and reopening today’s chores'),
    ).not.toBeChecked();
    expect(screen.getByLabelText('Allow completing and reopening today’s chores')).toBeDisabled();
    expect(adminApi.getAdmin).toHaveBeenCalledOnce();
    expect(screen.getByRole('heading', { name: 'Home Assistant controls Hearth' })).toBeVisible();
    const setup = screen.getByText('How to connect Home Assistant').closest('details');
    expect(setup).not.toHaveAttribute('open');
    expect(setup).toHaveTextContent('not built in');
    expect(setup).toHaveTextContent('updated Hearth TV APK');
    expect(homeAssistantBridgeApi.issue).not.toHaveBeenCalled();
  });

  it('allows read-only sharing with no selected screens and generates 32 random bytes', async () => {
    const random = vi.spyOn(crypto, 'getRandomValues');
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const { client } = show();
    const button = await ready();
    fireEvent.click(screen.getByLabelText('Share chores (read only)'));
    fireEvent.click(button);
    const field = await screen.findByLabelText('One-time key');
    const input = vi.mocked(homeAssistantBridgeApi.issue).mock.calls[0]![0];
    expect(input).toMatchObject({
      screenIds: [],
      shareChores: true,
      shareCalendar: false,
      controlChores: false,
      requestId: expect.any(String),
    });
    expect(input.secret).toMatch(/^ha_[A-Za-z0-9_-]{43}$/);
    expect(
      random.mock.calls.some(([array]) => array instanceof Uint8Array && array.length === 32),
    ).toBe(true);
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveAttribute('readonly');
    expect(field).toHaveAttribute('autocomplete', 'off');
    expect(field).not.toHaveAttribute('name');
    expect(storage).not.toHaveBeenCalled();
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain(input.secret);
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect(fireEvent.copy(field)).toBe(true);
  });

  it('requires separate opt-in to change chores, and clearing sharing clears control', async () => {
    show();
    const button = await ready();
    const control = screen.getByLabelText('Allow completing and reopening today’s chores');
    const sharing = screen.getByLabelText('Share chores (read only)');
    expect(control).toBeDisabled();
    fireEvent.click(sharing);
    expect(control).toBeEnabled();
    expect(control).not.toBeChecked();
    fireEvent.click(control);
    fireEvent.click(sharing);
    expect(control).not.toBeChecked();
    expect(control).toBeDisabled();
    fireEvent.click(sharing);
    fireEvent.click(control);
    fireEvent.click(button);
    await screen.findByLabelText('One-time key');
    expect(homeAssistantBridgeApi.issue).toHaveBeenCalledWith(
      expect.objectContaining({ shareChores: true, controlChores: true, screenIds: [] }),
      expect.any(AbortSignal),
    );
    expect(screen.getByText('Complete and reopen today’s chores')).toBeVisible();
  });

  it('shows/hides the one-time key and clears it when setup is done', async () => {
    show();
    fireEvent.click(await ready());
    const field = await screen.findByLabelText('One-time key');
    fireEvent.click(screen.getByRole('button', { name: 'Show key' }));
    expect(field).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Hide key' }));
    expect(field).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Done, key saved in Home Assistant' }));
    expect(screen.queryByLabelText('One-time key')).not.toBeInTheDocument();
    expect(screen.getByText('Home Assistant access is enabled')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Create Home Assistant key' }),
    ).not.toBeInTheDocument();
  });

  it('retries the exact issue request after an uncertain response without generating another key', async () => {
    const random = vi.spyOn(crypto, 'getRandomValues');
    vi.mocked(homeAssistantBridgeApi.issue).mockRejectedValueOnce(
      new Error('Do not display this response body'),
    );
    show();
    const button = await ready();
    fireEvent.click(screen.getByLabelText('Living room screen'));
    fireEvent.click(screen.getByLabelText('Share calendar (read only)'));
    fireEvent.click(button);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry same key' }));
    await screen.findByLabelText('One-time key');
    const calls = vi.mocked(homeAssistantBridgeApi.issue).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1]![0]).toBe(calls[0]![0]);
    expect(calls[0]![0]).toMatchObject({
      screenIds: ['screen_active'],
      shareChores: false,
      shareCalendar: true,
    });
    expect(
      random.mock.calls.filter(([array]) => array instanceof Uint8Array && array.length === 32),
    ).toHaveLength(1);
    expect(screen.queryByText('Do not display this response body')).not.toBeInTheDocument();
  });

  it('shows a safe existing summary and confirms revocation with an exact retry identifier', async () => {
    vi.mocked(homeAssistantBridgeApi.getConnection).mockResolvedValue(summary);
    vi.mocked(homeAssistantBridgeApi.revoke).mockRejectedValueOnce(new Error('lost response'));
    show();
    await screen.findByText('Home Assistant access is enabled');
    expect(screen.queryByLabelText('One-time key')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke Home Assistant access' }));
    expect(homeAssistantBridgeApi.revoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep access' }));
    expect(homeAssistantBridgeApi.revoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke Home Assistant access' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, revoke access' }));
    await screen.findByText('Revocation could not be confirmed. Try revoking again.');
    fireEvent.click(screen.getByRole('button', { name: 'Yes, revoke access' }));
    await ready();
    const calls = vi.mocked(homeAssistantBridgeApi.revoke).mock.calls;
    expect(calls[1]![0]).toBe(calls[0]![0]);
    fireEvent.click(screen.getByRole('button', { name: 'Create Home Assistant key' }));
    await screen.findByLabelText('One-time key');
    fireEvent.click(screen.getByRole('button', { name: 'Revoke Home Assistant access' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, revoke access' }));
    await ready();
    expect(vi.mocked(homeAssistantBridgeApi.revoke).mock.calls[2]![0]).not.toBe(calls[0]![0]);
    expect(screen.queryByLabelText('One-time key')).not.toBeInTheDocument();
  });

  it('can revoke an uncertain issuance before starting a new key', async () => {
    vi.mocked(homeAssistantBridgeApi.issue).mockRejectedValueOnce(new Error('lost response'));
    show();
    fireEvent.click(await ready());
    await screen.findByRole('button', { name: 'Retry same key' });
    fireEvent.click(screen.getByRole('button', { name: 'Revoke Home Assistant access' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, revoke access' }));
    fireEvent.click(await ready());
    await screen.findByLabelText('One-time key');
    const calls = vi.mocked(homeAssistantBridgeApi.issue).mock.calls;
    expect(calls[1]![0].requestId).not.toBe(calls[0]![0].requestId);
    expect(calls[1]![0].secret).not.toBe(calls[0]![0].secret);
  });

  it('does not create a grant until a failed safe-summary read is retried', async () => {
    vi.mocked(homeAssistantBridgeApi.getConnection).mockRejectedValueOnce(new Error('offline'));
    show();
    await screen.findByText('Could not load Home Assistant access.');
    expect(
      screen.queryByRole('button', { name: 'Create Home Assistant key' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await ready();
    expect(homeAssistantBridgeApi.issue).not.toHaveBeenCalled();
  });

  it('aborts on unmount and never redisplays an old key after remounting', async () => {
    let finish!: (result: { connection: BridgeConnection; replayed: boolean }) => void;
    vi.mocked(homeAssistantBridgeApi.issue).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const view = show();
    fireEvent.click(await ready());
    await waitFor(() => expect(homeAssistantBridgeApi.issue).toHaveBeenCalledOnce());
    const signal = vi.mocked(homeAssistantBridgeApi.issue).mock.calls[0]![1]!;
    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => finish({ connection: summary, replayed: false }));
    vi.mocked(homeAssistantBridgeApi.getConnection).mockResolvedValue(summary);
    show();
    await screen.findByText('Home Assistant access is enabled');
    expect(screen.queryByLabelText('One-time key')).not.toBeInTheDocument();
  });

  it('cancels an old safe-summary refresh so it cannot erase a newly issued grant', async () => {
    const { client } = show();
    const button = await ready();
    let finish!: (value: null) => void;
    vi.mocked(homeAssistantBridgeApi.getConnection).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    void client.refetchQueries({
      queryKey: ['household_test', 'admin', 'home-assistant-bridge'],
      exact: true,
    });
    fireEvent.click(button);
    await screen.findByLabelText('One-time key');
    expect(vi.mocked(homeAssistantBridgeApi.getConnection).mock.calls[1]![0]!.aborted).toBe(true);
    await act(async () => finish(null));
    fireEvent.click(screen.getByRole('button', { name: 'Done, key saved in Home Assistant' }));
    expect(screen.getByText('Home Assistant access is enabled')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Create Home Assistant key' }),
    ).not.toBeInTheDocument();
  });
});
