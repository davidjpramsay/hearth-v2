import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { useCommandMutation } from './useCommandMutation';

afterEach(cleanup);
describe('retryable commands', () => {
  it('reuses one immutable command after a lost reply and gives the next intent a new ID', async () => {
    const calls: Array<{ input: { text: string }; requestId: string }> = [];
    let fail = true;
    const mutationFn = vi.fn(async (input: { text: string }, requestId: string) => {
      calls.push({ input, requestId });
      if (fail) throw new TypeError('Lost reply');
      return input.text;
    });
    const client = new QueryClient();
    const { result } = renderHook(() => useCommandMutation('test', { mutationFn }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    const input = { text: 'Original' };
    act(() => result.current.mutate(input));
    await waitFor(() => expect(result.current.isError).toBe(true));
    input.text = 'Changed object';
    act(() => result.current.mutate({ text: 'Different intent' }));
    await waitFor(() => expect(result.current.error?.message).toContain('previous change'));
    expect(calls).toHaveLength(1);
    fail = false;
    act(() => result.current.retryCommand());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls[1]).toEqual(calls[0]);
    act(() => result.current.mutate({ text: 'Next' }));
    await waitFor(() => expect(result.current.data).toBe('Next'));
    expect(calls[2]?.requestId).not.toBe(calls[0]?.requestId);
    client.clear();
  });
});
