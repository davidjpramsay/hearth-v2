import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signOutAndClear } from './signOut';
import { getHearthRuntime } from '../api/core';

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.style.visibility = '';
});

describe('private sign-out cleanup', () => {
  it('cancels pending reads, clears private caches and closes the old document before navigation', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['household_private', 'today'], { notice: 'private household record' });
    let finish: (value: unknown) => void = () => undefined;
    const pending = client
      .fetchQuery({
        queryKey: ['household_private', 'late'],
        queryFn: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      })
      .catch(() => undefined);
    const replace = vi.fn();
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', {
      location: { replace, reload: vi.fn() },
      dispatchEvent,
      addEventListener: vi.fn(),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ signedOut: true }))),
    );
    await signOutAndClear(client);
    finish({ notice: 'late private record' });
    await pending;
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(() => getHearthRuntime()).toThrow(/not been loaded/);
    expect(dispatchEvent.mock.calls[0]?.[0].type).toBe('hearth:sign-out');
    expect(document.documentElement.style.visibility).toBe('hidden');
    expect(replace).toHaveBeenCalledWith('/');
  });
});
