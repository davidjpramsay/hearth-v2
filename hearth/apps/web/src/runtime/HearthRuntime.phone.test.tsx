import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HearthRuntimeBootstrap } from './HearthRuntime';
import { runtimeApi } from '../api/runtime';
import { phoneApi } from '../api/phoneConnections';
import { authStatusQueryKey } from '../auth/queryKeys';
import type { RuntimeContext, PasskeyAuthStatus } from '@hearth/shared';

vi.mock('../api/runtime', () => ({
  runtimeApi: { getRuntime: vi.fn(), getAuthStatus: vi.fn(), signOut: vi.fn() },
}));
vi.mock('../api/phoneConnections', () => ({
  phoneApi: { pending: vi.fn(), claim: vi.fn(), exchange: vi.fn(), ownerClaim: vi.fn() },
}));
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});
describe('QR intent before authorized app bootstrap', () => {
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
