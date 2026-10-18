import { NbaGameBoxSchema, NbaGameDetailSchema, type NbaGameBox } from '@hearth/shared';
import type { NbaService } from './nba-service.js';
import type { NbaBoxScoreProvider } from './integrations/nba-box-score.js';
import { RepositoryError } from './repository.js';

type Entry = {
  attempted: number;
  failed: boolean;
  data?: NbaGameBox;
  fetchedAt?: string;
  pending?: Promise<void>;
};
/** On-demand only. Cache/negative entries and concurrent reads are independently bounded. */
export class NbaGameService {
  private readonly cache = new Map<string, Entry>();
  constructor(
    private readonly nba: NbaService,
    private readonly provider: NbaBoxScoreProvider,
    private readonly now = () => new Date(),
  ) {}
  async detail(householdId: string, timezone: string, gameId: string) {
    const overview = await this.nba.overview(householdId, timezone);
    const game = overview.data?.games.find((item) => item.id === gameId);
    if (!game)
      throw new RepositoryError('NOT_FOUND', 'That game is not in the current NBA schedule.');
    const key = `${gameId}:${game.homeTeamId}:${game.awayTeamId}`;
    let entry = this.cache.get(key);
    if (!entry) {
      if (this.cache.size >= 16) {
        const idle = [...this.cache].find(([, item]) => !item.pending);
        if (idle) this.cache.delete(idle[0]);
      }
      entry = { attempted: -Infinity, failed: false };
      // Busy responses do not grow the cache or start more provider work.
      if ([...this.cache.values()].filter((item) => item.pending).length < 4)
        this.cache.set(key, entry);
    }
    const current = entry;
    if (
      !current.pending &&
      this.now().getTime() - current.attempted >= 60_000 &&
      [...this.cache.values()].filter((item) => item.pending).length < 4
    ) {
      current.attempted = this.now().getTime();
      current.pending = this.provider
        .read(game)
        .then((data) => {
          const parsed = NbaGameBoxSchema.parse(data);
          if (
            parsed.game.id !== game.id ||
            parsed.game.homeTeamId !== game.homeTeamId ||
            parsed.game.awayTeamId !== game.awayTeamId
          )
            throw new Error('Mismatched box score');
          current.data = parsed;
          current.fetchedAt = this.now().toISOString();
          current.failed = false;
        })
        .catch(() => {
          current.failed = true;
        })
        .finally(() => {
          delete current.pending;
        });
    }
    await current.pending;
    return NbaGameDetailSchema.parse({
      game: current.data?.game ?? game,
      teams: current.data?.teams ?? null,
      source: this.provider.source,
      fetchedAt: current.fetchedAt ?? null,
      status: !current.data
        ? 'unavailable'
        : current.failed ||
            overview.status === 'stale' ||
            this.now().getTime() - Date.parse(current.fetchedAt ?? '') >= 60_000
          ? 'stale'
          : 'current',
    });
  }
  reset() {
    this.cache.clear();
  }
}
