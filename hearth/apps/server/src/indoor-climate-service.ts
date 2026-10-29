import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import type Database from 'better-sqlite3';
import {
  IndoorClimateSchema,
  IndoorSettingsSchema,
  IndoorSettingsResultSchema,
  type IndoorClimate,
  type IndoorDiscovery,
  type IndoorPeriod,
  type IndoorSettingsResult,
  type SaveIndoorSettings,
  type HomeAssistantConnectionTestRequest,
} from '@hearth/shared';
import type { AdminRepository } from './admin-repository.js';
import { RepositoryError } from './repository.js';
import {
  DemoIndoorProvider,
  IndoorRuntimeSchema,
  indoorWindow,
  type IndoorCandidate,
  type IndoorProvider,
  type IndoorRuntime,
} from './integrations/indoor-climate-provider.js';

type Pending = {
  householdId: string;
  actorId: string;
  credentials: HomeAssistantConnectionTestRequest;
  options: IndoorCandidate[];
  expires: number;
};
type Cache = { attempted: number; data?: IndoorClimate; pending?: Promise<IndoorClimate> };
type Receipt = { hash: string; result: IndoorSettingsResult };
export class IndoorClimateService {
  private config: IndoorRuntime | null;
  private readonly initialConfig: IndoorRuntime | null;
  private readonly pending = new Map<string, Pending>();
  private readonly cache = new Map<IndoorPeriod, Cache>();
  private readonly receipts = new Map<string, Receipt>();
  private saving: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly provider: IndoorProvider,
    private readonly options: {
      admin?: AdminRepository;
      database?: Database.Database;
      config?: IndoorRuntime | null;
      configPath?: string;
      now?: () => Date;
      demo?: boolean;
    } = {},
  ) {
    this.config = options.config ?? null;
    this.initialConfig = structuredClone(this.config);
  }
  private now() {
    return this.options.now?.() ?? new Date();
  }
  reset() {
    if (!this.options.demo) return;
    this.config = structuredClone(this.initialConfig);
    this.cache.clear();
    this.pending.clear();
    this.receipts.clear();
  }
  private assertHousehold(householdId: string) {
    if (this.config !== null && this.config.householdId !== householdId)
      throw new RepositoryError('FORBIDDEN', 'Indoor sensors belong to another home.');
  }
  settings(householdId: string) {
    this.assertHousehold(householdId);
    return IndoorSettingsSchema.parse({
      configured: this.config !== null,
      revision: this.config?.revision ?? 0,
      rooms:
        this.config?.rooms.map((room) => ({
          id: room.id,
          label: room.label,
          temperatureId: room.temperature === null ? null : optionId(householdId, room.temperature),
          humidityId: room.humidity === null ? null : optionId(householdId, room.humidity),
        })) ?? [],
    });
  }
  async discover(
    householdId: string,
    actorId: string,
    input?: HomeAssistantConnectionTestRequest,
  ): Promise<IndoorDiscovery> {
    await this.options.admin?.getOverview(householdId, actorId);
    this.assertHousehold(householdId);
    const now = this.now().getTime();
    for (const [id, item] of this.pending) if (item.expires <= now) this.pending.delete(id);
    if (this.pending.size >= 8)
      throw new RepositoryError(
        'CONFLICT',
        'Wait a moment before testing more indoor connections.',
        true,
      );
    const credentials = input ?? this.config;
    if (credentials === null)
      throw new RepositoryError(
        'CONFLICT',
        'Connect Home Assistant before choosing indoor sensors.',
      );
    const testId = `indoor_test_${randomUUID()}`;
    const record: Pending = {
      householdId,
      actorId,
      credentials: { serverUrl: credentials.serverUrl, accessToken: credentials.accessToken },
      options: [],
      expires: now + 600_000,
    };
    this.pending.set(testId, record);
    try {
      record.options = await this.provider.discover(record.credentials);
      await this.options.admin?.getOverview(householdId, actorId);
      if (record.expires <= this.now().getTime()) throw new Error('expired');
      return {
        testId,
        expiresAt: new Date(record.expires).toISOString(),
        options: record.options.map((option) => ({
          id: optionId(householdId, option.externalId),
          label: option.label,
          metric: option.metric,
        })),
      };
    } catch {
      this.pending.delete(testId);
      throw new RepositoryError(
        'INTEGRATION_UNAVAILABLE',
        'Could not discover indoor sensors. Check the Home Assistant address and access token.',
        true,
      );
    }
  }
  async save(
    householdId: string,
    actorId: string,
    input: SaveIndoorSettings,
    guard: () => void = () => undefined,
  ): Promise<IndoorSettingsResult> {
    const operation = this.saving
      .catch(() => undefined)
      .then(() => this.saveOnce(householdId, actorId, input, guard));
    this.saving = operation;
    return operation;
  }
  private async saveOnce(
    householdId: string,
    actorId: string,
    input: SaveIndoorSettings,
    guard: () => void,
  ): Promise<IndoorSettingsResult> {
    await this.options.admin?.getOverview(householdId, actorId);
    guard();
    this.assertHousehold(householdId);
    const command = `indoor-climate.settings.save:${actorId}`;
    const key = JSON.stringify([householdId, command, input.requestId]);
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const stored = this.options.database
      ?.prepare(
        'SELECT response_json FROM command_receipts WHERE household_id=? AND command_type=? AND request_id=?',
      )
      .get(householdId, command, input.requestId) as { response_json: string } | undefined;
    const previous = stored
      ? (JSON.parse(stored.response_json) as Receipt)
      : this.receipts.get(key);
    if (previous) {
      if (previous.hash !== hash)
        throw new RepositoryError(
          'CONFLICT',
          'That request was already used for different indoor settings.',
        );
      return { ...IndoorSettingsResultSchema.parse(previous.result), replayed: true };
    }
    if (input.revision !== (this.config?.revision ?? 0))
      throw new RepositoryError('CONFLICT', 'Indoor settings changed. Reload before saving.');
    const pending = this.pending.get(input.testId);
    if (
      !pending ||
      pending.householdId !== householdId ||
      pending.actorId !== actorId ||
      pending.expires <= this.now().getTime()
    )
      throw new RepositoryError('CONFLICT', 'Check the sensors again before saving.');
    const external = (id: string | null, metric: 'temperature' | 'humidity') => {
      if (id === null) return null;
      const option = pending.options.find(
        (option) => option.metric === metric && optionId(householdId, option.externalId) === id,
      );
      if (!option)
        throw new RepositoryError('VALIDATION_ERROR', 'Choose a sensor from this connection.');
      return option.externalId;
    };
    const next = IndoorRuntimeSchema.parse({
      version: 1,
      householdId,
      revision: input.revision + 1,
      ...pending.credentials,
      rooms: input.rooms.map((room) => ({
        id: room.id,
        label: room.label,
        temperature: external(room.temperatureId, 'temperature'),
        humidity: external(room.humidityId, 'humidity'),
      })),
    });
    const old = this.config;
    if (!this.options.configPath && !this.options.demo)
      throw new RepositoryError(
        'COMMAND_FAILED',
        'Indoor sensor storage is not configured on this server.',
      );
    guard();
    if (this.options.configPath) await writeIndoorRuntime(this.options.configPath, next);
    try {
      await this.options.admin?.getOverview(householdId, actorId);
      guard();
      const result: IndoorSettingsResult = {
        settings: {
          configured: true,
          revision: next.revision,
          rooms: structuredClone(input.rooms),
        },
        replayed: false,
      };
      const commit = () => {
        if (this.options.database) {
          this.options.database
            .prepare(
              'INSERT INTO command_receipts(household_id,request_id,command_type,response_json,created_at) VALUES (?,?,?,?,?)',
            )
            .run(
              householdId,
              input.requestId,
              command,
              JSON.stringify({ hash, result }),
              this.now().toISOString(),
            );
          this.options.database
            .prepare(
              `INSERT INTO audit_events(id,occurred_at,household_id,actor_type,actor_id,source_channel,action_type,target_type,target_id,request_id,result,safe_summary_json) VALUES (?,?,?,'member',?,'companion','indoor-climate.settings.update','indoor_climate',?,?,'succeeded',?)`,
            )
            .run(
              `audit_${randomUUID()}`,
              this.now().toISOString(),
              householdId,
              actorId,
              householdId,
              input.requestId,
              JSON.stringify({ roomCount: next.rooms.length }),
            );
        } else this.receipts.set(key, { hash, result });
        this.config = next;
        this.cache.clear();
      };
      if (this.options.database) this.options.database.transaction(commit)();
      else commit();
      this.pending.delete(input.testId);
      return result;
    } catch (error) {
      this.config = old;
      this.cache.clear();
      if (this.options.configPath) {
        if (old) await writeIndoorRuntime(this.options.configPath, old);
        else await rm(this.options.configPath, { force: true });
      }
      throw error;
    }
  }
  async read(householdId: string, timezone: string, period: IndoorPeriod): Promise<IndoorClimate> {
    this.assertHousehold(householdId);
    const now = this.now();
    const config = this.config;
    const base = {
      source: this.options.demo ? ('demo' as const) : ('home-assistant' as const),
      period,
      timezone,
      ...indoorWindow(period, now),
    };
    if (config === null) return { ...base, status: 'not-configured', fetchedAt: null, rooms: [] };
    const cached = this.cache.get(period);
    if (cached?.pending) {
      const result = await cached.pending;
      return this.config === config
        ? structuredClone(result)
        : { ...base, status: 'unavailable', fetchedAt: null, rooms: [] };
    }
    if (cached?.data && now.getTime() - cached.attempted < 60_000)
      return structuredClone({ ...cached.data, timezone });
    const entry: Cache = {
      attempted: now.getTime(),
      ...(cached?.data ? { data: cached.data } : {}),
    };
    this.cache.set(period, entry);
    const pending = this.provider
      .read(config, period, now)
      .then((result) => {
        if (result.status === 'unavailable' && entry.data) {
          entry.data = IndoorClimateSchema.parse({ ...entry.data, status: 'stale', timezone });
          return entry.data;
        }
        const data = IndoorClimateSchema.parse({
          ...base,
          ...result,
          fetchedAt: now.toISOString(),
        });
        if (this.config === config) entry.data = data;
        return data;
      })
      .catch(() => {
        entry.data = entry.data
          ? IndoorClimateSchema.parse({ ...entry.data, status: 'stale', timezone })
          : IndoorClimateSchema.parse({
              ...base,
              status: 'unavailable',
              fetchedAt: null,
              rooms: [],
            });
        return entry.data;
      })
      .finally(() => {
        delete entry.pending;
      });
    entry.pending = pending;
    const result = await pending;
    if (this.config !== config)
      return { ...base, status: 'unavailable', fetchedAt: null, rooms: [] };
    return structuredClone(result);
  }
}
export function createDemoIndoorService(
  admin?: AdminRepository,
  now = () => new Date('2026-08-03T00:30:00.000Z'),
) {
  return new IndoorClimateService(new DemoIndoorProvider(), {
    ...(admin ? { admin } : {}),
    now,
    demo: true,
    config: {
      version: 1,
      householdId: 'household_hearth_demo',
      revision: 1,
      serverUrl: 'http://homeassistant.local',
      accessToken: 'fictional-demo-token-only',
      rooms: [
        {
          id: 'indoor_family_room',
          label: 'Family room',
          temperature: 'sensor.demo_room_temperature',
          humidity: 'sensor.demo_room_humidity',
        },
      ],
    },
  });
}
export async function loadIndoorRuntime(path: string | undefined): Promise<IndoorRuntime | null> {
  if (!path) return null;
  try {
    return IndoorRuntimeSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  } catch {
    return null;
  }
}
async function writeIndoorRuntime(path: string, config: IndoorRuntime) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(config), { mode: 0o600 });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
function optionId(householdId: string, entity: string) {
  return `indoor_sensor_${createHash('sha256').update(`${householdId}\0${entity}`).digest('hex').slice(0, 24)}`;
}
