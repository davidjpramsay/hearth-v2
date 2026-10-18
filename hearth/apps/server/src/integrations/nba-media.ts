import sharp from 'sharp';
import { NBA_TEAMS, NbaPlayerIdSchema, NbaTeamIdSchema } from '@hearth/shared';
import { boundResponse } from './bounded-response.js';

export interface NbaMediaProvider {
  read(kind: 'teams' | 'players', id: string): Promise<Buffer | null>;
}
type Entry = { image: Buffer | null; expires: number };
const MAX_ITEMS = 64;
const MAX_BYTES = 8 * 1024 * 1024;

/** Optional artwork, separate from score availability. No supplied URLs or redirects. */
export class EspnNbaMedia implements NbaMediaProvider {
  private readonly cache = new Map<string, Entry>();
  private readonly pending = new Map<string, Promise<Buffer | null>>();
  private bytes = 0;
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly now = () => Date.now(),
  ) {}
  async read(kind: 'teams' | 'players', id: string): Promise<Buffer | null> {
    if (!(kind === 'teams' ? NbaTeamIdSchema : NbaPlayerIdSchema).safeParse(id).success)
      return null;
    const key = `${kind}:${id}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.now()) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.image;
    }
    const existing = this.pending.get(key);
    if (existing) return existing;
    // Concurrent requests are finite as well as the retained cache. No unbounded work queue.
    if (this.pending.size >= 16) return null;
    const operation = this.fetchImage(kind, id)
      .catch(() => null)
      .then((image) => {
        const old = this.cache.get(key);
        this.bytes -= old?.image?.byteLength ?? 0;
        this.cache.delete(key);
        this.cache.set(key, { image, expires: this.now() + (image ? 6 * 60 * 60_000 : 60_000) });
        this.bytes += image?.byteLength ?? 0;
        while (this.cache.size > MAX_ITEMS || this.bytes > MAX_BYTES) {
          const oldest = this.cache.keys().next().value!;
          this.bytes -= this.cache.get(oldest)?.image?.byteLength ?? 0;
          this.cache.delete(oldest);
        }
        return image;
      })
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, operation);
    return operation;
  }
  private async fetchImage(kind: 'teams' | 'players', id: string): Promise<Buffer | null> {
    const slug = NBA_TEAMS.find(([team]) => team === id)?.[2].toLowerCase();
    const url =
      kind === 'teams'
        ? `https://a.espncdn.com/i/teamlogos/nba/500/${slug}.png`
        : `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    try {
      const response = await this.fetcher(url, {
        signal: controller.signal,
        redirect: 'error',
        headers: { Accept: 'image/png' },
      });
      if (!response.ok || response.headers.get('content-type')?.split(';')[0] !== 'image/png')
        return null;
      const bounded = await boundResponse(response, 1024 * 1024, controller.signal);
      const source = Buffer.from(await bounded.arrayBuffer());
      // Signature plus raster decoding: never forward provider HTML, SVG, metadata or a URL.
      if (source.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
      return await sharp(source, { limitInputPixels: 1_000_000 })
        .timeout({ seconds: 2 })
        .resize(kind === 'teams' ? 96 : 320, kind === 'teams' ? 96 : 232, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 82 })
        .toBuffer();
    } finally {
      // Also cancel unread response bodies on an early content-type/status rejection.
      controller.abort();
      clearTimeout(timeout);
    }
  }
}

/** Network-free demo. Fictional people must never be shown with real player faces. */
export class NoNbaMedia implements NbaMediaProvider {
  async read(): Promise<null> {
    return null;
  }
}
