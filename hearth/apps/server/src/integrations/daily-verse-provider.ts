import type Database from 'better-sqlite3';
import { z } from 'zod';

import { DailyVerseSummarySchema, type DailyVerseSummary } from '@hearth/shared';

const ESV_PASSAGE_URL = 'https://api.esv.org/v3/passage/text/';
const ESV_SOURCE_URL = 'https://www.esv.org/';
const REQUEST_TIMEOUT_MS = 7_000;

// A deliberately small rotation keeps API and local-cache use predictable.
export const DAILY_VERSE_REFERENCES = [
  'Psalm 118:24',
  'Proverbs 3:5-6',
  'Isaiah 41:10',
  'Micah 6:8',
  'Matthew 5:16',
  'Matthew 6:34',
  'Matthew 11:28',
  'Matthew 22:37-39',
  'Luke 6:31',
  'John 8:12',
  'John 13:34',
  'John 14:27',
  'Romans 8:28',
  'Romans 12:10',
  'Romans 12:12',
  '1 Corinthians 13:4-5',
  '1 Corinthians 16:14',
  'Galatians 5:22-23',
  'Galatians 6:9',
  'Ephesians 4:2',
  'Ephesians 4:32',
  'Philippians 4:6-7',
  'Philippians 4:13',
  'Colossians 3:12',
  'Colossians 3:15',
  'Colossians 3:23',
  '1 Thessalonians 5:16-18',
  '2 Timothy 1:7',
  'Hebrews 10:24',
  'James 1:19',
  '1 Peter 4:8',
  '1 John 4:19',
] as const;

const EsvResponseSchema = z.object({
  passages: z.array(z.string()),
});

export interface DailyVerseProvider {
  getDailyVerse(householdId: string, localDate: string): Promise<DailyVerseSummary | null>;
}

export class UnconfiguredDailyVerseProvider implements DailyVerseProvider {
  async getDailyVerse(): Promise<null> {
    return null;
  }
}

export class FakeDailyVerseProvider implements DailyVerseProvider {
  async getDailyVerse(): Promise<DailyVerseSummary> {
    return DailyVerseSummarySchema.parse({
      text: 'Let kindness shape the way you speak and serve one another today.',
      reference: 'Demo preview',
      translation: 'Demo',
      sourceUrl: null,
      freshness: 'current',
      statusMessage: null,
    });
  }
}

export class EsvDailyVerseProvider implements DailyVerseProvider {
  private readonly dailyResults = new Map<string, DailyVerseSummary | null>();

  constructor(
    private readonly database: Database.Database,
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (apiKey.trim() === '') throw new Error('The ESV API key cannot be empty.');
  }

  async getDailyVerse(householdId: string, localDate: string): Promise<DailyVerseSummary | null> {
    const resultKey = `${householdId}:${localDate}`;
    if (this.dailyResults.has(resultKey)) return this.dailyResults.get(resultKey) ?? null;

    const reference = referenceForLocalDate(localDate);
    try {
      const verse = await this.fetchVerse(reference);
      this.writeCache(householdId, verse);
      this.dailyResults.set(resultKey, verse);
      return verse;
    } catch {
      const stale = this.readCache(householdId, reference);
      this.dailyResults.set(resultKey, stale);
      return stale;
    }
  }

  private async fetchVerse(reference: string): Promise<DailyVerseSummary> {
    const url = new URL(ESV_PASSAGE_URL);
    url.searchParams.set('q', reference);
    url.searchParams.set('include-passage-references', 'false');
    url.searchParams.set('include-verse-numbers', 'false');
    url.searchParams.set('include-first-verse-numbers', 'false');
    url.searchParams.set('include-footnotes', 'false');
    url.searchParams.set('include-headings', 'false');
    url.searchParams.set('include-short-copyright', 'true');
    url.searchParams.set('include-copyright', 'false');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetcher(url, {
        headers: { Authorization: `Token ${this.apiKey}` },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`ESV request failed with status ${response.status}.`);
      const payload = EsvResponseSchema.parse(await response.json());
      const text = payload.passages.join('\n').replaceAll(/\s+/g, ' ').trim();
      return DailyVerseSummarySchema.parse({
        text,
        reference,
        translation: 'ESV',
        sourceUrl: ESV_SOURCE_URL,
        freshness: 'current',
        statusMessage: null,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private readCache(householdId: string, reference: string): DailyVerseSummary | null {
    const row = this.database
      .prepare(
        `SELECT passage_reference, verse_text, source_url
         FROM daily_verse_cache
         WHERE household_id = ? AND passage_reference = ?`,
      )
      .get(householdId, reference) as
      { passage_reference: string; verse_text: string; source_url: string } | undefined;
    if (row === undefined) return null;
    return DailyVerseSummarySchema.parse({
      text: row.verse_text,
      reference: row.passage_reference,
      translation: 'ESV',
      sourceUrl: row.source_url,
      freshness: 'stale',
      statusMessage: 'Showing the most recently saved verse.',
    });
  }

  private writeCache(householdId: string, verse: DailyVerseSummary): void {
    this.database
      .prepare(
        `INSERT INTO daily_verse_cache
          (household_id, passage_reference, verse_text, source_url, fetched_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(household_id, passage_reference) DO UPDATE SET
           verse_text = excluded.verse_text,
           source_url = excluded.source_url,
           fetched_at = excluded.fetched_at`,
      )
      .run(householdId, verse.reference, verse.text, ESV_SOURCE_URL, this.now().toISOString());
  }
}

export function referenceForLocalDate(localDate: string): string {
  const dayNumber = Math.floor(Date.parse(`${localDate}T00:00:00.000Z`) / 86_400_000);
  const index =
    ((dayNumber % DAILY_VERSE_REFERENCES.length) + DAILY_VERSE_REFERENCES.length) %
    DAILY_VERSE_REFERENCES.length;
  return DAILY_VERSE_REFERENCES[index]!;
}
