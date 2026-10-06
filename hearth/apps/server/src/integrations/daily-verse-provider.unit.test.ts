import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyMigrations } from '../database.js';
import { EsvDailyVerseProvider, referenceForLocalDate } from './daily-verse-provider.js';
import { TodayVerseCache } from './today-verse-cache.js';

const databases: Database.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe('ESV daily verse provider', () => {
  it('does not fetch external verse content for caller-selected historical or future dates', () => {
    const provider = {
      getDailyVerse: vi.fn(async () => null),
      getCachedDailyVerse: vi.fn(() => null),
    };
    const reader = new TodayVerseCache(provider, vi.fn());
    for (let day = 1; day <= 28; day += 1)
      reader.read('household_test', `2027-02-${String(day).padStart(2, '0')}`, false);
    expect(provider.getDailyVerse).not.toHaveBeenCalled();
    reader.read('household_test', '2026-08-20', true);
    expect(provider.getDailyVerse).toHaveBeenCalledTimes(1);
  });
  it('coalesces refreshes and recovers on the same day after bounded failure backoff', async () => {
    let now = new Date('2026-08-20T00:00:00Z');
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(new Response(JSON.stringify({ passages: ['Recovered verse. (ESV)'] })));
    const provider = new EsvDailyVerseProvider(createDatabase(), 'key', fetcher, () => now);
    const first = await Promise.all([
      provider.getDailyVerse('household_test', '2026-08-20'),
      provider.getDailyVerse('household_test', '2026-08-20'),
    ]);
    expect(first).toEqual([null, null]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await provider.getDailyVerse('household_test', '2026-08-20');
    expect(fetcher).toHaveBeenCalledTimes(1);
    now = new Date('2026-08-20T00:01:01Z');
    const recovered = await provider.getDailyVerse('household_test', '2026-08-20');
    expect(recovered?.freshness).toBe('current');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(provider.getCachedDailyVerse('household_test', '2026-08-20')).toEqual(recovered);
  });

  it('reads durable content immediately without waiting for the network', async () => {
    const database = createDatabase();
    await new EsvDailyVerseProvider(
      database,
      'key',
      async () => new Response(JSON.stringify({ passages: ['Saved verse. (ESV)'] })),
    ).getDailyVerse('household_test', '2026-08-20');
    let resolve: ((response: Response) => void) | undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    const changed = vi.fn();
    const reader = new TodayVerseCache(
      new EsvDailyVerseProvider(database, 'key', fetcher),
      changed,
    );
    expect(reader.read('household_test', '2026-08-20')?.text).toBe('Saved verse. (ESV)');
    expect(reader.read('household_test', '2026-08-20')?.freshness).toBe('stale');
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolve?.(new Response(JSON.stringify({ passages: ['Fresh verse. (ESV)'] })));
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
    expect(reader.read('household_test', '2026-08-20')?.text).toBe('Fresh verse. (ESV)');
  });
  it('selects the same passage for the same household-local date', () => {
    expect(referenceForLocalDate('2026-08-20')).toBe(referenceForLocalDate('2026-08-20'));
    expect(referenceForLocalDate('2026-08-21')).not.toBe(referenceForLocalDate('2026-08-20'));
  });

  it('sends the token only in the server request and reuses the daily result', async () => {
    const database = createDatabase();
    const fetcher = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toEqual({ Authorization: 'Token private-test-key' });
      return new Response(JSON.stringify({ passages: ['Love one another. (ESV)'] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    const provider = new EsvDailyVerseProvider(database, 'private-test-key', fetcher);

    const first = await provider.getDailyVerse('household_test', '2026-08-20');
    const second = await provider.getDailyVerse('household_test', '2026-08-20');

    expect(first).toEqual(
      expect.objectContaining({
        text: 'Love one another. (ESV)',
        translation: 'ESV',
        freshness: 'current',
      }),
    );
    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(first)).not.toContain('private-test-key');
  });

  it('falls back to the saved passage when ESV is temporarily unavailable', async () => {
    const database = createDatabase();
    const success = vi.fn(
      async () =>
        new Response(JSON.stringify({ passages: ['Be kind to one another. (ESV)'] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    await new EsvDailyVerseProvider(database, 'key', success).getDailyVerse(
      'household_test',
      '2026-08-20',
    );
    const failure = vi.fn(async () => new Response('Unavailable', { status: 503 }));

    const stale = await new EsvDailyVerseProvider(database, 'key', failure).getDailyVerse(
      'household_test',
      '2026-08-20',
    );

    expect(stale).toEqual(
      expect.objectContaining({
        text: 'Be kind to one another. (ESV)',
        freshness: 'stale',
        statusMessage: 'Showing the most recently saved verse.',
      }),
    );
  });
});

function createDatabase(): Database.Database {
  const database = new Database(':memory:');
  databases.push(database);
  applyMigrations(database);
  database
    .prepare(
      `INSERT INTO households
        (id, name, timezone, locale, week_starts_on, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
    )
    .run('household_test', 'Test', 'Australia/Perth', 'en-AU', 'now', 'now');
  return database;
}
