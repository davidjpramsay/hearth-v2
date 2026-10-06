import { describe, expect, it } from 'vitest';
import { withRequestDeadline } from './deadline';

describe('request deadlines', () => {
  it('bounds a hanging request and aborts its transport', async () => {
    let signal: AbortSignal | null | undefined;
    await expect(
      withRequestDeadline(
        undefined,
        (init) => {
          signal = init.signal;
          return new Promise(() => {});
        },
        10,
      ),
    ).rejects.toThrow('taking too long');
    expect(signal?.aborted).toBe(true);
  });
  it('also bounds body reads and translates network errors', async () => {
    await expect(
      withRequestDeadline(undefined, async () => {
        throw new TypeError('Failed to fetch');
      }),
    ).rejects.toThrow('Couldn’t reach Hearth');
    await expect(
      withRequestDeadline(
        undefined,
        async () => {
          await new Promise(() => {});
        },
        10,
      ),
    ).rejects.toThrow('taking too long');
  });
  it('preserves caller cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      withRequestDeadline({ signal: controller.signal }, async (init) => {
        init.signal?.throwIfAborted();
        return 'unexpected';
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
