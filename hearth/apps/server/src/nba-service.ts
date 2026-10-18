import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { addLocalDays, localDateInTimezone, startOfLocalWeek } from '@hearth/core';
import {
  NbaDataSchema,
  NbaOverviewSchema,
  NbaSettingsResultSchema,
  NbaSettingsSchema,
  type NbaData,
  type NbaSettings,
  type NbaSettingsResult,
  type UpdateNbaSettings,
} from '@hearth/shared';
import { RepositoryError, type CommandActor } from './repository.js';
import type { NbaProvider } from './integrations/nba-provider.js';

type Cache = {
  data?: NbaData;
  fetchedAt?: string;
  attempted: number;
  pending?: Promise<void>;
  failed: boolean;
};
type Receipt = { hash: string; result: NbaSettingsResult };
export class NbaService {
  private readonly settings = new Map<string, NbaSettings>();
  private readonly receipts = new Map<string, Receipt>();
  private readonly cache = new Map<string, Cache>();
  constructor(
    private readonly provider: NbaProvider,
    private readonly database?: Database.Database,
    private readonly now = () => new Date(),
  ) {}
  getSettings(householdId: string): NbaSettings {
    const row = this.database
      ?.prepare('SELECT settings_json FROM nba_settings WHERE household_id=?')
      .get(householdId) as { settings_json: string } | undefined;
    return NbaSettingsSchema.parse(
      row
        ? JSON.parse(row.settings_json)
        : (this.settings.get(householdId) ?? { standoutTeamIds: [] }),
    );
  }
  update(householdId: string, input: UpdateNbaSettings, actor: CommandActor): NbaSettingsResult {
    const settings = NbaSettingsSchema.parse(input);
    const scope = `${actor.type}:${actor.id}`;
    const key = JSON.stringify([householdId, scope, input.requestId]);
    const hash = createHash('sha256').update(JSON.stringify(settings)).digest('hex');
    const row = this.database
      ?.prepare(
        'SELECT input_hash,result_json FROM nba_settings_receipts WHERE household_id=? AND actor_scope=? AND request_id=?',
      )
      .get(householdId, scope, input.requestId) as
      { input_hash: string; result_json: string } | undefined;
    const previous = row
      ? { hash: row.input_hash, result: NbaSettingsResultSchema.parse(JSON.parse(row.result_json)) }
      : this.receipts.get(key);
    if (previous) {
      if (previous.hash !== hash)
        throw new RepositoryError(
          'CONFLICT',
          'That request was already used with different teams.',
        );
      return { ...structuredClone(previous.result), replayed: true };
    }
    const save = () => {
      const result = NbaSettingsResultSchema.parse({
        settings,
        replayed: false,
        audit: {
          id: `audit_${randomUUID()}`,
          actorType: actor.type,
          actorId: actor.id,
          source: actor.source,
          action: 'nba.settings.update',
          targetId: householdId,
          occurredAt: this.now().toISOString(),
          result: 'succeeded',
        },
      });
      if (this.database) {
        this.database
          .prepare(
            'INSERT INTO nba_settings(household_id,settings_json) VALUES (?,?) ON CONFLICT(household_id) DO UPDATE SET settings_json=excluded.settings_json',
          )
          .run(householdId, JSON.stringify(settings));
        this.database
          .prepare('INSERT INTO nba_settings_receipts VALUES (?,?,?,?,?)')
          .run(householdId, scope, input.requestId, hash, JSON.stringify(result));
        this.database
          .prepare(
            `INSERT INTO audit_events(id,occurred_at,household_id,actor_type,actor_id,source_channel,action_type,target_type,target_id,request_id,result,safe_summary_json) VALUES (?,?,?,?,?,?,'nba.settings.update','nba',?,?,'succeeded',?)`,
          )
          .run(
            result.audit.id,
            result.audit.occurredAt,
            householdId,
            actor.type,
            actor.id,
            actor.source,
            householdId,
            input.requestId,
            JSON.stringify({ teamCount: settings.standoutTeamIds.length }),
          );
      } else {
        this.settings.set(householdId, settings);
        this.receipts.set(key, { hash, result });
      }
      return result;
    };
    return structuredClone(this.database ? this.database.transaction(save)() : save());
  }
  async overview(householdId: string, timezone: string) {
    const weekStart = startOfLocalWeek(localDateInTimezone(this.now().toISOString(), timezone));
    const key = `${weekStart}:${timezone}`;
    let entry = this.cache.get(key);
    if (!entry) {
      // At most two fortnight/timezone projections, including in-flight work.
      if (this.cache.size >= 2) {
        const idle = [...this.cache].find(([, item]) => !item.pending);
        if (idle) this.cache.delete(idle[0]);
        else return this.projection(householdId, timezone, weekStart, undefined);
      }
      entry = { attempted: -Infinity, failed: false };
      this.cache.set(key, entry);
    }
    const current = entry;
    const ttl = current.failed ? 60_000 : 15 * 60_000;
    if (!current.pending && this.now().getTime() - current.attempted >= ttl) {
      current.attempted = this.now().getTime();
      current.pending = this.provider
        .read(weekStart, timezone)
        .then((data) => {
          current.data = NbaDataSchema.parse(data);
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
    return this.projection(householdId, timezone, weekStart, current);
  }
  private projection(
    householdId: string,
    timezone: string,
    weekStart: string,
    entry: Cache | undefined,
  ) {
    return NbaOverviewSchema.parse({
      weekStart,
      nextWeekStart: addLocalDays(weekStart, 7),
      endExclusive: addLocalDays(weekStart, 14),
      timezone,
      settings: this.getSettings(householdId),
      status: !entry?.data ? 'unavailable' : entry.failed ? 'stale' : 'current',
      fetchedAt: entry?.fetchedAt ?? null,
      source: this.provider.source,
      data: entry?.data ?? null,
    });
  }
  reset() {
    this.settings.clear();
    this.receipts.clear();
    this.cache.clear();
    this.database?.exec('DELETE FROM nba_settings_receipts; DELETE FROM nba_settings;');
  }
}
