import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyMigrations } from '../database.js';
import { EsvDailyVerseProvider, referenceForLocalDate } from './daily-verse-provider.js';

const databases: Database.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe('ESV daily verse provider', () => {
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
