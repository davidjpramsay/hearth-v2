import type { DailyVerseSummary } from '@hearth/shared';
import type { DailyVerseProvider } from './daily-verse-provider.js';

/** Optional network content must never hold the core Today response open. */
export class TodayVerseCache {
  private readonly entries = new Map<
    string,
    { date: string; value: DailyVerseSummary | null; retryAt: number; pending: boolean }
  >();
  constructor(
    private readonly provider: DailyVerseProvider,
    private readonly changed: (householdId: string) => void,
  ) {}

  read(householdId: string, localDate: string, allowRefresh = true): DailyVerseSummary | null {
    if (!allowRefresh) return this.provider.getCachedDailyVerse?.(householdId, localDate) ?? null;
    let entry = this.entries.get(householdId);
    if (entry === undefined || entry.date !== localDate) {
      entry = {
        date: localDate,
        value: this.provider.getCachedDailyVerse?.(householdId, localDate) ?? null,
        retryAt: 0,
        pending: false,
      };
      this.entries.set(householdId, entry);
    }
    if (!entry.pending && entry.retryAt <= Date.now()) {
      entry.pending = true;
      const current = entry;
      void this.provider
        .getDailyVerse(householdId, localDate)
        .then((value) => {
          const previous = JSON.stringify(current.value);
          current.value = value;
          current.retryAt = Date.now() + (value?.freshness === 'current' ? 86_400_000 : 60_000);
          if (this.entries.get(householdId) === current && previous !== JSON.stringify(value))
            this.changed(householdId);
        })
        .catch(() => {
          current.retryAt = Date.now() + 60_000;
        })
        .finally(() => {
          current.pending = false;
        });
    }
    return entry.value;
  }
}
