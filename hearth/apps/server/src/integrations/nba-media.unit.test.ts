import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { EspnNbaMedia } from './nba-media.js';

const png = () =>
  sharp({ create: { width: 500, height: 500, channels: 4, background: '#008348' } })
    .png()
    .toBuffer();
describe('optional bounded NBA artwork', () => {
  it('uses only the fixed CDN paths, coalesces reads, resizes and strips to WebP', async () => {
    const bytes = await png();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/png' } }),
      );
    const provider = new EspnNbaMedia(fetcher);
    const [a, b] = await Promise.all([provider.read('teams', '2'), provider.read('teams', '2')]);
    expect(a).toEqual(b);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://a.espncdn.com/i/teamlogos/nba/500/bos.png');
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('error');
    expect(await sharp(a!).metadata()).toMatchObject({ format: 'webp', width: 96, height: 96 });
    await provider.read('players', '1966');
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      'https://a.espncdn.com/i/headshots/nba/players/full/1966.png',
    );
    await provider.read('teams', '2');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects arbitrary IDs before I/O and never follows redirects/accepts SVG or HTML', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('<svg></svg>', { headers: { 'Content-Type': 'image/svg+xml' } }),
      );
    const provider = new EspnNbaMedia(fetcher);
    for (const id of ['../1966', 'https://private.invalid', '999999999999'])
      expect(await provider.read('players', id)).toBeNull();
    expect(await provider.read('teams', '999')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await provider.read('teams', '2')).toBeNull();
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('error');
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
  it('bounds bytes and caches failures briefly so a missing image does not repeat per card', async () => {
    let now = 0;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response('x'.repeat(1024 * 1024 + 1), { headers: { 'Content-Type': 'image/png' } }),
      );
    const provider = new EspnNbaMedia(fetcher, () => now);
    expect(await provider.read('teams', '2')).toBeNull();
    expect(await provider.read('teams', '2')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    now = 60_001;
    await provider.read('teams', '2');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects malformed PNGs and overlarge pixel counts without affecting score availability', async () => {
    const oversized = await sharp({
      create: { width: 1500, height: 1500, channels: 4, background: 'white' },
    })
      .png()
      .toBuffer();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () =>
          new Response(new Uint8Array(oversized), { headers: { 'Content-Type': 'image/png' } }),
      );
    expect(await new EspnNbaMedia(fetcher).read('teams', '2')).toBeNull();
    fetcher.mockResolvedValue(
      new Response('not png', { headers: { 'Content-Type': 'image/png' } }),
    );
    expect(await new EspnNbaMedia(fetcher).read('teams', '2')).toBeNull();
  });
  it('aborts stalled downloads after four seconds', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(
        (_url, init) =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            }),
          ),
      );
      const image = new EspnNbaMedia(fetcher).read('teams', '2');
      await vi.advanceTimersByTimeAsync(4_000);
      expect(await image).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it('caps concurrent work and retains at most 64 cached images', async () => {
    const bytes = await png();
    let finish: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      await waiting;
      return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': 'image/png' } });
    });
    const provider = new EspnNbaMedia(fetcher);
    const active = Array.from({ length: 16 }, (_, i) => provider.read('players', String(i + 1)));
    expect(await provider.read('players', '17')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(16);
    finish!();
    await Promise.all(active);
    // Completion order of the concurrent first batch is intentionally unspecified.
    // Fill an entire new cache so every first-batch image must be evicted.
    for (let i = 17; i <= 80; i++) await provider.read('players', String(i));
    const calls = fetcher.mock.calls.length;
    await provider.read('players', '1');
    expect(fetcher).toHaveBeenCalledTimes(calls + 1);
  });
});
