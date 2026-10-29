import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HearthRuntimeBootstrap } from './HearthRuntime';
import { runtimeApi } from '../api/runtime';
import { phoneApi } from '../api/phoneConnections';
import { authStatusQueryKey } from '../auth/queryKeys';
import type { RuntimeContext, PasskeyAuthStatus } from '@hearth/shared';
import { clearIdentityAndReload } from '../auth/signOut';

vi.mock('../auth/signOut', () => ({
  clearIdentityAndReload: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../api/runtime', () => ({
  runtimeApi: { getRuntime: vi.fn(), getAuthStatus: vi.fn(), signOut: vi.fn() },
}));
vi.mock('../api/phoneConnections', () => ({
  phoneApi: { pending: vi.fn(), claim: vi.fn(), exchange: vi.fn(), ownerClaim: vi.fn() },
}));
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.clearAllMocks();
});
describe('QR intent before authorized app bootstrap', () => {
  for (const first of [true, false]) {
    it(`a successful ${first ? 'first claim opens guidance' : 'replacement retains recovery guidance'}`, async () => {
      const runtime: RuntimeContext = {
        mode: 'private',
        generatedAt: '2026-10-29T00:00:00Z',
        household: null,
        timezone: 'Australia/Perth',
        locale: 'en-AU',
        localDate: '2026-10-29',
        weekStart: '2026-10-26',
        currentMonth: '2026-10',
        requiresSetup: first,
      };
      const auth: PasskeyAuthStatus = {
        mode: 'private',
        accessMethod: 'phone',
        configured: true,
        secureOrigin: true,
        requiresSetup: first,
        authenticated: false,
        actor: null,
      };
      vi.mocked(runtimeApi.getRuntime).mockResolvedValue(runtime);
      vi.mocked(runtimeApi.getAuthStatus).mockResolvedValue(auth);
      vi.mocked(phoneApi.ownerClaim).mockResolvedValue({
        authenticated: true,
        householdId: 'household_fixture',
        memberId: 'member_fixture',
        displayName: 'Fixture adult',
        expiresAt: '2027-01-01T00:00:00Z',
      });
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      window.history.replaceState(
        null,
        '',
        `/#${first ? 'setup-phone' : 'replace-owner'}=${'a'.repeat(64)}`,
      );
      render(
        <QueryClientProvider client={client}>
          <HearthRuntimeBootstrap>
            <p>Private app content</p>
          </HearthRuntimeBootstrap>
        </QueryClientProvider>,
      );
      await screen.findByRole('button', {
        name: first ? 'Create household and connect' : 'Connect as owner phone',
      });
      expect(clearIdentityAndReload).not.toHaveBeenCalled();
      if (first)
        fireEvent.change(screen.getByLabelText('Your name'), {
          target: { value: 'Fixture adult' },
        });
      fireEvent.change(screen.getByLabelText('Phone name'), { target: { value: 'Fixture phone' } });
      fireEvent.submit(
        screen
          .getByRole('button', {
            name: first ? 'Create household and connect' : 'Connect as owner phone',
          })
          .closest('form')!,
      );
      await waitFor(() =>
        expect(clearIdentityAndReload).toHaveBeenCalledWith(
          client,
          first ? '/admin/get-started' : '/admin/televisions?recovery=1',
        ),
      );
      expect(window.location.hash).toBe('');
    });
  }
  it('strips the fragment and asks an already connected adult before rendering the private app', async () => {
    const runtime: RuntimeContext = {
      mode: 'private',
      sharedScreen: false,
      generatedAt: '2026-10-12T00:00:00Z',
      household: {
        id: 'household_fixture',
        name: 'Fixture',
        timezone: 'Australia/Perth',
        locale: 'en-AU',
      },
      timezone: 'Australia/Perth',
      locale: 'en-AU',
      localDate: '2026-10-12',
      weekStart: '2026-10-12',
      currentMonth: '2026-10',
      requiresSetup: false,
    };
    const auth: PasskeyAuthStatus = {
      mode: 'private',
      accessMethod: 'phone',
      configured: true,
      secureOrigin: true,
      requiresSetup: false,
      authenticated: true,
      actor: { id: 'member_david', displayName: 'David', role: 'adult' },
    };
    vi.mocked(runtimeApi.getRuntime).mockResolvedValue(runtime);
    vi.mocked(runtimeApi.getAuthStatus).mockResolvedValue(auth);
    vi.mocked(phoneApi.pending).mockResolvedValue(null);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['hearth-runtime'], runtime);
    client.setQueryData(authStatusQueryKey, auth);
    window.history.replaceState(null, '', `/#connect-phone=${'a'.repeat(43)}`);
    render(
      <QueryClientProvider client={client}>
        <HearthRuntimeBootstrap>
          <p>Private app content</p>
        </HearthRuntimeBootstrap>
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole('heading', { name: 'Already connected as David' }),
    ).toBeVisible();
    expect(window.location.hash).toBe('');
    expect(screen.queryByText('Private app content')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep current connection' }));
    await waitFor(() => expect(screen.getByText('Private app content')).toBeVisible());
    expect(phoneApi.claim).not.toHaveBeenCalled();
  });
});
