import { describe, expect, it, vi } from 'vitest';
import { NBA_TEAMS } from '@hearth/shared';
import { EspnNbaProvider } from './nba-provider.js';

const table = () => ({
  season: { displayName: '2026-27' },
  children: ['Eastern Conference', 'Western Conference'].map((name, side) => ({
    name,
    standings: {
      entries: NBA_TEAMS.slice(side * 15, side * 15 + 15).map(([id], i) => ({
        team: { id },
        stats: [
          { name: 'wins', value: 10 },
          { name: 'losses', value: 5 },
          { name: 'winPercent', value: 2 / 3 },
          { name: 'gamesBehind', value: 0 },
          { name: 'playoffSeed', value: i + 1 },
          { name: 'streak', displayValue: 'W2' },
        ],
      })),
    },
  })),
});
const event = (id: string, date: string, completed = true, value = 42) => ({
  id,
  date,
  season: { type: 1 },
  status: {
    type: {
      name: completed ? 'STATUS_FINAL' : 'STATUS_SCHEDULED',
      state: completed ? 'post' : 'pre',
      completed,
      shortDetail: completed ? 'Final' : 'Scheduled',
    },
  },
  competitions: [
    {
      competitors: ['home', 'away'].map((homeAway, i) => ({
        homeAway,
        team: { id: String(i + 1) },
        score: completed ? String(110 + i) : '0',
        leaders: [
          { name: 'points', leaders: [{ value, athlete: { displayName: `Example Player ${i}` } }] },
        ],
      })),
    },
  ],
});
const board = (events: ReturnType<typeof event>[] = []) => ({
  leagues: [{ season: { displayName: '2026-27', type: { name: 'Preseason' } } }],
  events,
});
function harness(events: ReturnType<typeof event>[]) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (url) =>
      Response.json(String(url).endsWith('/standings') ? table() : board(events)),
    );
  return { fetcher, provider: new EspnNbaProvider(fetcher) };
}
describe('bounded ESPN NBA adapter', () => {
  it('aborts stalled provider requests at eight seconds', async () => {
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
      const failed = expect(new EspnNbaProvider(fetcher).read('2026-10-19', 'UTC')).rejects.toThrow(
        'aborted',
      );
      await vi.advanceTimersByTimeAsync(8_000);
      await failed;
      expect(fetcher.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
  it('covers complete local weeks across a month boundary, deduplicates months, keeps ties and labels preseason', async () => {
    const h = harness([
      event('1', '2026-10-25T15:59:00Z'), // Perth Sunday: exclude
      event('2', '2026-10-25T16:00:00Z'), // Monday midnight
      event('3', '2026-11-07T16:00:00Z', false),
      event('4', '2026-11-08T16:00:00Z'), // following Monday: exclude
    ]);
    const data = await h.provider.read('2026-10-26', 'Australia/Perth');
    expect(h.fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings',
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=202610&limit=1000',
      'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=202611&limit=1000',
    ]);
    expect(data.games.map((game) => game.id)).toEqual(['2', '3']);
    expect(data.games[0]?.localDate).toBe('2026-10-26');
    expect(data.games[1]?.homeScore).toBeNull();
    expect(data.phase).toBe('Preseason');
    expect(data.standings).toHaveLength(30);
    expect(data.highlights).toHaveLength(2);
  });
  it('respects the DST Sunday boundary, not a fixed 14×24h window', async () => {
    const h = harness([event('1', '2026-11-02T04:59:00Z'), event('2', '2026-11-02T05:00:00Z')]);
    const data = await h.provider.read('2026-10-19', 'America/New_York');
    expect(data.games.map((game) => game.id)).toEqual(['1']);
  });
  it('does not include next week’s bigger result in this week’s best', async () => {
    const h = harness([
      event('1', '2026-10-20T01:00:00Z', true, 35),
      event('2', '2026-10-27T01:00:00Z', true, 80),
    ]);
    expect(
      (await h.provider.read('2026-10-19', 'Australia/Perth')).highlights.every(
        (mark) => mark.value === 35,
      ),
    ).toBe(true);
  });
  it('fails closed for incomplete standings, invalid events and a limit-sized possibly truncated month', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ children: [] }));
    await expect(new EspnNbaProvider(fetcher).read('2026-10-19', 'UTC')).rejects.toThrow();
    const h = harness(
      Array.from({ length: 1000 }, (_, i) => event(String(i), '2026-10-20T01:00:00Z')),
    );
    await expect(h.provider.read('2026-10-19', 'UTC')).rejects.toThrow();
  });
  it('does not follow redirects or expose a raw provider response', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('private diagnostic', { status: 403 }));
    await expect(new EspnNbaProvider(fetcher).read('2026-10-19', 'UTC')).rejects.toThrow(
      'NBA feed is unavailable.',
    );
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('error');
  });
  it('bounds decoded bytes', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response('x'.repeat(4 * 1024 * 1024 + 1)));
    await expect(new EspnNbaProvider(fetcher).read('2026-10-19', 'UTC')).rejects.toThrow(
      'safe size limit',
    );
  });
});
