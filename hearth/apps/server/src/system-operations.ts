import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, chmod, mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import Database from 'better-sqlite3';

import {
  AuditSummarySchema,
  SystemBackupCommandResultSchema,
  SystemStatusSchema,
  type AuditSummary,
  type RuntimeMode,
  type SystemBackupCommandResult,
  type SystemBackupStatus,
  type SystemStatus,
} from '@hearth/shared';

import type { AdminRepository } from './admin-repository.js';
import { LATEST_MIGRATION_VERSION } from './database.js';
import { RepositoryError } from './repository.js';
import type { HearthClock } from './runtime-context.js';

const BACKUP_COMMAND = 'system.backup.create';
const BACKUP_PREFIX = 'hearth-';
const BACKUP_PATTERN = /^hearth-(\d{8}T\d{9}Z)-[a-f0-9]{12}\.sqlite$/;

export interface SystemOperationsRepository {
  getStatus(householdId: string, actorId: string): Promise<SystemStatus>;
  createBackup(
    householdId: string,
    actorId: string,
    requestId: string,
  ): Promise<SystemBackupCommandResult>;
  reset(): void;
  close(): void;
}

interface SystemOperationsOptions {
  version: string;
  mode: RuntimeMode;
  clock: HearthClock;
  retentionCount?: number;
}

export class InMemorySystemOperations implements SystemOperationsRepository {
  private lastSuccessfulAt = '2026-08-03T05:00:00.000Z';
  private readonly receipts = new Map<string, SystemBackupCommandResult>();
  private sequence = 1;

  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly options: SystemOperationsOptions,
  ) {}

  async getStatus(householdId: string, actorId: string): Promise<SystemStatus> {
    await this.adminRepository.getOverview(householdId, actorId);
    return this.status();
  }

  async createBackup(
    householdId: string,
    actorId: string,
    requestId: string,
  ): Promise<SystemBackupCommandResult> {
    await this.adminRepository.getOverview(householdId, actorId);
    const receiptKey = `${householdId}:${requestId}`;
    const replay = this.receipts.get(receiptKey);
    if (replay !== undefined) return { ...replay, replayed: true };
    this.lastSuccessfulAt = this.options.clock.now().toISOString();
    const audit = AuditSummarySchema.parse({
      id: `audit_system_backup_${this.sequence++}`,
      actorType: 'member',
      actorId,
      source: 'companion',
      action: BACKUP_COMMAND,
      targetId: `backup_demo_${digest(requestId).slice(0, 20)}`,
      occurredAt: this.lastSuccessfulAt,
      result: 'succeeded',
    });
    const result = SystemBackupCommandResultSchema.parse({
      status: this.status(),
      audit,
      replayed: false,
    });
    this.receipts.set(receiptKey, result);
    this.adminRepository.recordActivity(householdId, audit, requestId);
    return result;
  }

  reset(): void {
    this.lastSuccessfulAt = '2026-08-03T05:00:00.000Z';
    this.receipts.clear();
    this.sequence = 1;
  }

  close(): void {}

  private status(): SystemStatus {
    return SystemStatusSchema.parse({
      version: this.options.version,
      mode: this.options.mode,
      generatedAt: this.options.clock.now().toISOString(),
      database: {
        state: 'ready',
        migrationVersion: LATEST_MIGRATION_VERSION,
        message: 'Household data is ready.',
      },
      backup: {
        state: 'ready',
        scheduled: true,
        retentionCount: this.options.retentionCount ?? 14,
        lastSuccessfulAt: this.lastSuccessfulAt,
        sizeBytes: 2_457_600,
        message: 'The latest local recovery copy is ready.',
      },
    });
  }
}

export interface SqliteSystemOperationsOptions extends SystemOperationsOptions {
  database: InstanceType<typeof Database>;
  backupDirectory: string | null;
  retentionCount: number;
  intervalHours: number;
}

export class SqliteSystemOperations implements SystemOperationsRepository {
  private initialTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private backupInFlight: Promise<SystemBackupStatus> | null = null;
  private failedSince: string | null = null;

  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly options: SqliteSystemOperationsOptions,
  ) {}

  async getStatus(householdId: string, actorId: string): Promise<SystemStatus> {
    await this.adminRepository.getOverview(householdId, actorId);
    return this.status();
  }

  async createBackup(
    householdId: string,
    actorId: string,
    requestId: string,
  ): Promise<SystemBackupCommandResult> {
    await this.adminRepository.getOverview(householdId, actorId);
    const replay = this.readReceipt(householdId, requestId);
    if (replay !== null) return { ...replay, replayed: true };
    const occurredAt = this.options.clock.now().toISOString();
    const targetId = `backup_${digest(requestId).slice(0, 32)}`;
    await this.performBackup(requestId);
    const audit = AuditSummarySchema.parse({
      id: `audit_${digest(`${householdId}:${requestId}:${occurredAt}`).slice(0, 40)}`,
      actorType: 'member',
      actorId,
      source: 'companion',
      action: BACKUP_COMMAND,
      targetId,
      occurredAt,
      result: 'succeeded',
    });
    const result = SystemBackupCommandResultSchema.parse({
      status: await this.status(),
      audit,
      replayed: false,
    });
    this.writeReceiptAndAudit(householdId, requestId, result, audit);
    return result;
  }

  startScheduler(householdId: () => string | null): void {
    if (this.options.backupDirectory === null || this.intervalTimer !== null) return;
    const run = () => void this.runScheduledBackup(householdId()).catch(() => undefined);
    this.initialTimer = setTimeout(run, 60_000);
    this.initialTimer.unref?.();
    this.intervalTimer = setInterval(run, this.options.intervalHours * 60 * 60_000);
    this.intervalTimer.unref?.();
  }

  reset(): void {}

  close(): void {
    if (this.initialTimer !== null) clearTimeout(this.initialTimer);
    if (this.intervalTimer !== null) clearInterval(this.intervalTimer);
    this.initialTimer = null;
    this.intervalTimer = null;
  }

  private async runScheduledBackup(householdId: string | null): Promise<void> {
    if (householdId === null) return;
    const now = this.options.clock.now();
    const latest = await latestBackup(this.options.backupDirectory);
    if (
      latest !== null &&
      now.getTime() - Date.parse(latest.completedAt) < this.options.intervalHours * 60 * 60_000
    ) {
      return;
    }
    const requestId = `scheduled_backup_${compactTimestamp(now.toISOString())}`;
    if (this.readReceipt(householdId, requestId) !== null) return;
    try {
      await this.performBackup(requestId);
      const occurredAt = now.toISOString();
      const audit = AuditSummarySchema.parse({
        id: `audit_${digest(`${householdId}:${requestId}`).slice(0, 40)}`,
        actorType: 'service',
        actorId: 'service_hearth_backup',
        source: 'automation',
        action: BACKUP_COMMAND,
        targetId: `backup_${digest(requestId).slice(0, 32)}`,
        occurredAt,
        result: 'succeeded',
      });
      const result = SystemBackupCommandResultSchema.parse({
        status: await this.status(),
        audit,
        replayed: false,
      });
      this.writeReceiptAndAudit(householdId, requestId, result, audit);
    } catch {
      // Status changes to a family-safe failure; the interval retries without exposing paths.
    }
  }

  private async status(): Promise<SystemStatus> {
    const row = this.options.database
      .prepare('SELECT MAX(version) AS version FROM schema_migrations')
      .get() as { version: number | null };
    return SystemStatusSchema.parse({
      version: this.options.version,
      mode: this.options.mode,
      generatedAt: this.options.clock.now().toISOString(),
      database: {
        state: row.version === LATEST_MIGRATION_VERSION ? 'ready' : 'needs-attention',
        migrationVersion: row.version ?? 1,
        message:
          row.version === LATEST_MIGRATION_VERSION
            ? 'Household data is ready.'
            : 'A database update still needs attention.',
      },
      backup: await this.backupStatus(),
    });
  }

  private async backupStatus(): Promise<SystemBackupStatus> {
    if (this.options.backupDirectory === null) {
      return {
        state: 'not-configured',
        scheduled: false,
        retentionCount: this.options.retentionCount,
        lastSuccessfulAt: null,
        sizeBytes: null,
        message: 'Choose a private backup folder before household use.',
      };
    }
    let latest: Awaited<ReturnType<typeof latestBackup>>;
    try {
      latest = await latestBackup(this.options.backupDirectory);
    } catch {
      this.failedSince ??= this.options.clock.now().toISOString();
      return {
        state: 'failed',
        scheduled: true,
        retentionCount: this.options.retentionCount,
        lastSuccessfulAt: null,
        sizeBytes: null,
        message: 'Hearth cannot read the backup storage. Check Synology storage and try again.',
      };
    }
    if (this.failedSince !== null) {
      return {
        state: 'failed',
        scheduled: true,
        retentionCount: this.options.retentionCount,
        lastSuccessfulAt: latest?.completedAt ?? null,
        sizeBytes: latest?.sizeBytes ?? null,
        message: 'The latest backup attempt failed. Check Synology storage and try again.',
      };
    }
    if (latest === null) {
      return {
        state: 'never-run',
        scheduled: true,
        retentionCount: this.options.retentionCount,
        lastSuccessfulAt: null,
        sizeBytes: null,
        message: 'No recovery copy has been created yet.',
      };
    }
    return {
      state: 'ready',
      scheduled: true,
      retentionCount: this.options.retentionCount,
      lastSuccessfulAt: latest.completedAt,
      sizeBytes: latest.sizeBytes,
      message: 'The latest local recovery copy is ready.',
    };
  }

  private async performBackup(requestId: string): Promise<SystemBackupStatus> {
    if (this.options.backupDirectory === null) {
      throw new RepositoryError(
        'INTEGRATION_UNAVAILABLE',
        'Backups are not configured on this Hearth yet.',
      );
    }
    if (this.backupInFlight !== null) return this.backupInFlight;
    this.backupInFlight = this.writeBackup(requestId);
    try {
      const result = await this.backupInFlight;
      this.failedSince = null;
      return result;
    } catch {
      this.failedSince = this.options.clock.now().toISOString();
      throw new RepositoryError(
        'INTEGRATION_UNAVAILABLE',
        'Hearth could not create a backup. Check Synology storage and try again.',
        true,
      );
    } finally {
      this.backupInFlight = null;
    }
  }

  private async writeBackup(requestId: string): Promise<SystemBackupStatus> {
    const backupDirectory = this.options.backupDirectory;
    if (backupDirectory === null) throw new Error('Backup directory is not configured.');
    await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    await chmod(backupDirectory, 0o700);
    const completedAt = this.options.clock.now().toISOString();
    const fileName = `${BACKUP_PREFIX}${compactTimestamp(completedAt)}-${digest(requestId).slice(0, 12)}.sqlite`;
    const destination = join(backupDirectory, fileName);
    const partial = `${destination}.partial`;
    await rm(partial, { force: true });
    await rm(destination, { force: true });
    await this.options.database.backup(partial);
    await verifyHearthDatabaseFile(partial);
    await chmod(partial, 0o600);
    await rename(partial, destination);
    await pruneBackups(backupDirectory, this.options.retentionCount);
    const details = await stat(destination);
    return {
      state: 'ready',
      scheduled: true,
      retentionCount: this.options.retentionCount,
      lastSuccessfulAt: completedAt,
      sizeBytes: details.size,
      message: 'The latest local recovery copy is ready.',
    };
  }

  private readReceipt(householdId: string, requestId: string): SystemBackupCommandResult | null {
    const row = this.options.database
      .prepare(
        `SELECT response_json FROM command_receipts
         WHERE household_id = ? AND request_id = ? AND command_type = ?`,
      )
      .get(householdId, requestId, BACKUP_COMMAND) as { response_json: string } | undefined;
    return row === undefined
      ? null
      : SystemBackupCommandResultSchema.parse(JSON.parse(row.response_json));
  }

  private writeReceiptAndAudit(
    householdId: string,
    requestId: string,
    result: SystemBackupCommandResult,
    audit: AuditSummary,
  ): void {
    this.options.database.transaction(() => {
      this.options.database
        .prepare(
          `INSERT INTO command_receipts
             (household_id, request_id, command_type, response_json, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(householdId, requestId, BACKUP_COMMAND, JSON.stringify(result), audit.occurredAt);
      this.options.database
        .prepare(
          `INSERT INTO audit_events
             (id, occurred_at, household_id, actor_type, actor_id, source_channel,
              action_type, target_type, target_id, request_id, result, safe_summary_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'system-backup', ?, ?, ?, '{}')`,
        )
        .run(
          audit.id,
          audit.occurredAt,
          householdId,
          audit.actorType,
          audit.actorId,
          audit.source,
          audit.action,
          audit.targetId,
          requestId,
          audit.result,
        );
    })();
  }
}

export function resolveSystemOperationsConfiguration(environment: NodeJS.ProcessEnv): {
  backupDirectory: string | null;
  retentionCount: number;
  intervalHours: number;
  version: string;
} {
  const configuredDirectory = environment.HEARTH_BACKUP_DIR?.trim() ?? '';
  if (configuredDirectory !== '' && !isAbsolute(configuredDirectory)) {
    throw new Error('HEARTH_BACKUP_DIR must be an absolute path.');
  }
  if (configuredDirectory !== '' && resolve(configuredDirectory) === '/') {
    throw new Error('HEARTH_BACKUP_DIR must be a dedicated directory, not the filesystem root.');
  }
  const retentionCount = boundedInteger(
    environment.HEARTH_BACKUP_RETENTION,
    14,
    2,
    90,
    'HEARTH_BACKUP_RETENTION',
  );
  const intervalHours = boundedInteger(
    environment.HEARTH_BACKUP_INTERVAL_HOURS,
    24,
    1,
    168,
    'HEARTH_BACKUP_INTERVAL_HOURS',
  );
  const version = environment.HEARTH_VERSION?.trim() || 'development';
  if (version.length > 80) throw new Error('HEARTH_VERSION must be at most 80 characters.');
  return {
    backupDirectory: configuredDirectory === '' ? null : resolve(configuredDirectory),
    retentionCount,
    intervalHours,
    version,
  };
}

export async function verifyHearthDatabaseFile(path: string): Promise<{
  migrationVersion: number;
  sizeBytes: number;
}> {
  if (!isAbsolute(path)) throw new Error('Backup path must be absolute.');
  const details = await stat(path);
  if (!details.isFile() || details.size === 0)
    throw new Error('Backup is not a regular database file.');
  const sidecars = [`${path}-wal`, `${path}-shm`];
  if ((await Promise.all(sidecars.map(fileExists))).some(Boolean)) {
    throw new Error('Backup must be one self-contained database file.');
  }
  const database = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const quickCheck = database.prepare('PRAGMA quick_check').get() as { quick_check: string };
    if (quickCheck.quick_check !== 'ok') throw new Error('SQLite quick check failed.');
    const foreignKeyProblems = database.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeyProblems.length > 0) throw new Error('SQLite foreign key check failed.');
    const migration = database
      .prepare('SELECT MAX(version) AS version FROM schema_migrations')
      .get() as { version: number | null };
    if (migration.version === null) throw new Error('Backup has no schema version.');
    return { migrationVersion: migration.version, sizeBytes: details.size };
  } finally {
    database.close();
    await Promise.all(sidecars.map((sidecar) => rm(sidecar, { force: true })));
  }
}

export async function restoreHearthBackup(
  source: string,
  destination: string,
): Promise<{
  migrationVersion: number;
  sizeBytes: number;
}> {
  if (!isAbsolute(source) || !isAbsolute(destination)) {
    throw new Error('Backup source and restore destination must be absolute paths.');
  }
  if (resolve(source) === resolve(destination)) {
    throw new Error('Restore destination must be different from the backup source.');
  }
  await verifyHearthDatabaseFile(source);
  try {
    await access(destination, constants.F_OK);
    throw new Error('Restore destination already exists; Hearth will not overwrite it.');
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const partial = `${destination}.restore-partial`;
  try {
    await access(partial, constants.F_OK);
    throw new Error('Restore work file already exists; Hearth will not overwrite it.');
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
  const sourceDatabase = new Database(source, { readonly: true, fileMustExist: true });
  try {
    await sourceDatabase.backup(partial);
  } finally {
    sourceDatabase.close();
    await removeSQLiteSidecars(source);
  }
  const verified = await verifyHearthDatabaseFile(partial);
  await chmod(partial, 0o600);
  await rename(partial, destination);
  return verified;
}

async function latestBackup(directory: string | null): Promise<{
  completedAt: string;
  sizeBytes: number;
} | null> {
  if (directory === null) return null;
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
  const candidates = names
    .filter((name) => BACKUP_PATTERN.test(name))
    .sort()
    .reverse();
  const name = candidates[0];
  if (name === undefined) return null;
  const match = BACKUP_PATTERN.exec(name);
  if (match === null) return null;
  const details = await stat(join(directory, name));
  return { completedAt: expandTimestamp(match[1]!), sizeBytes: details.size };
}

async function pruneBackups(directory: string, retentionCount: number): Promise<void> {
  const names = (await readdir(directory))
    .filter((name) => BACKUP_PATTERN.test(name))
    .sort()
    .reverse();
  for (const staleName of names.slice(retentionCount)) {
    await rm(join(directory, staleName), { force: true });
  }
}

function compactTimestamp(timestamp: string): string {
  return timestamp.replaceAll('-', '').replaceAll(':', '').replace('.', '');
}

function expandTimestamp(compact: string): string {
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T${compact.slice(9, 11)}:${compact.slice(11, 13)}:${compact.slice(13, 15)}.${compact.slice(15, 18)}Z`;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (isMissingFile(error)) return false;
    throw error;
  }
}

async function removeSQLiteSidecars(path: string): Promise<void> {
  await Promise.all([`${path}-wal`, `${path}-shm`].map((sidecar) => rm(sidecar, { force: true })));
}
