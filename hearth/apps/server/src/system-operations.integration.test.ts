import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { SqliteAdminRepository } from './admin-repository.js';
import { LATEST_MIGRATION_VERSION, openHearthDatabase } from './database.js';
import { DEMO_HOUSEHOLD_ID } from './demo/seed.js';
import type { HearthClock } from './runtime-context.js';
import {
  SqliteSystemOperations,
  resolveSystemOperationsConfiguration,
  restoreHearthBackup,
  verifyHearthDatabaseFile,
} from './system-operations.js';

const directories: string[] = [];
const databases: Array<InstanceType<typeof Database>> = [];

afterEach(async () => {
  for (const database of databases.splice(0)) {
    if (database.open) database.close();
  }
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

class MutableClock implements HearthClock {
  constructor(private timestamp: string) {}

  now(): Date {
    return new Date(this.timestamp);
  }

  set(timestamp: string): void {
    this.timestamp = timestamp;
  }
}

describe('SQLite system operations', () => {
  it('creates, verifies, replays, prunes and restores private online backups', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-system-operations-'));
    directories.push(directory);
    const databasePath = join(directory, 'source', 'hearth.sqlite');
    const backupDirectory = join(directory, 'backups');
    const database = await openHearthDatabase(databasePath);
    databases.push(database);
    const adminRepository = new SqliteAdminRepository(database, { seedDemo: true });
    const clock = new MutableClock('2026-08-03T07:42:00.000Z');
    const service = new SqliteSystemOperations(adminRepository, {
      database,
      backupDirectory,
      retentionCount: 2,
      intervalHours: 24,
      version: 'test-release',
      mode: 'test',
      clock,
    });

    await expect(service.getStatus(DEMO_HOUSEHOLD_ID, 'member_maya')).resolves.toMatchObject({
      version: 'test-release',
      database: { state: 'ready', migrationVersion: LATEST_MIGRATION_VERSION },
      backup: { state: 'never-run', scheduled: true, retentionCount: 2 },
    });

    const first = await service.createBackup(
      DEMO_HOUSEHOLD_ID,
      'member_maya',
      'request_backup_first',
    );
    expect(first).toMatchObject({
      replayed: false,
      status: { backup: { state: 'ready', lastSuccessfulAt: clock.now().toISOString() } },
      audit: { action: 'system.backup.create', actorId: 'member_maya' },
    });
    const replay = await service.createBackup(
      DEMO_HOUSEHOLD_ID,
      'member_maya',
      'request_backup_first',
    );
    expect(replay.replayed).toBe(true);
    expect(await readdir(backupDirectory)).toHaveLength(1);

    clock.set('2026-08-04T07:42:00.000Z');
    await service.createBackup(DEMO_HOUSEHOLD_ID, 'member_maya', 'request_backup_second');
    clock.set('2026-08-05T07:42:00.000Z');
    await service.createBackup(DEMO_HOUSEHOLD_ID, 'member_maya', 'request_backup_third');
    const backupNames = (await readdir(backupDirectory)).sort();
    expect(backupNames).toHaveLength(2);
    expect(backupNames[0]).toContain('20260804T074200000Z');
    expect(backupNames[1]).toContain('20260805T074200000Z');

    const latestPath = join(backupDirectory, backupNames[1]!);
    await expect(verifyHearthDatabaseFile(latestPath)).resolves.toMatchObject({
      migrationVersion: LATEST_MIGRATION_VERSION,
    });
    expect((await stat(latestPath)).mode & 0o777).toBe(0o600);

    const restorePath = join(directory, 'restore-test', 'hearth.sqlite');
    await expect(restoreHearthBackup(latestPath, restorePath)).resolves.toMatchObject({
      migrationVersion: LATEST_MIGRATION_VERSION,
    });
    const restored = new Database(restorePath, { readonly: true, fileMustExist: true });
    expect(
      restored.prepare('SELECT name FROM households WHERE id = ?').get(DEMO_HOUSEHOLD_ID),
    ).toEqual({ name: 'Hearth Demo Home' });
    restored.close();
    await expect(restoreHearthBackup(latestPath, restorePath)).rejects.toThrow(
      'Restore destination already exists',
    );
    const guardedRestorePath = join(directory, 'restore-test', 'guarded.sqlite');
    await writeFile(`${guardedRestorePath}.restore-partial`, 'operator-owned work file');
    await expect(restoreHearthBackup(latestPath, guardedRestorePath)).rejects.toThrow(
      'Restore work file already exists',
    );
    await expect(verifyHearthDatabaseFile('relative-backup.sqlite')).rejects.toThrow(
      'Backup path must be absolute',
    );

    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM audit_events WHERE action_type = 'system.backup.create'",
        )
        .get(),
    ).toEqual({ count: 3 });
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM command_receipts WHERE command_type = 'system.backup.create'",
        )
        .get(),
    ).toEqual({ count: 3 });
    service.close();
    adminRepository.close();
  });

  it('keeps unconfigured backups family-readable and validates deployment settings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-system-unconfigured-'));
    directories.push(directory);
    const database = await openHearthDatabase(join(directory, 'hearth.sqlite'));
    databases.push(database);
    const adminRepository = new SqliteAdminRepository(database, { seedDemo: true });
    const service = new SqliteSystemOperations(adminRepository, {
      database,
      backupDirectory: null,
      retentionCount: 14,
      intervalHours: 24,
      version: 'test-release',
      mode: 'private',
      clock: new MutableClock('2026-08-03T07:42:00.000Z'),
    });

    await expect(service.getStatus(DEMO_HOUSEHOLD_ID, 'member_maya')).resolves.toMatchObject({
      backup: { state: 'not-configured', scheduled: false },
    });
    await expect(
      service.createBackup(DEMO_HOUSEHOLD_ID, 'member_maya', 'request_backup_unconfigured'),
    ).rejects.toMatchObject({
      code: 'INTEGRATION_UNAVAILABLE',
      message: 'Backups are not configured on this Hearth yet.',
    });
    expect(
      resolveSystemOperationsConfiguration({
        HEARTH_BACKUP_DIR: '/data/backups',
        HEARTH_BACKUP_RETENTION: '21',
        HEARTH_BACKUP_INTERVAL_HOURS: '12',
        HEARTH_VERSION: 'release-42',
      }),
    ).toEqual({
      backupDirectory: '/data/backups',
      retentionCount: 21,
      intervalHours: 12,
      version: 'release-42',
    });
    expect(() =>
      resolveSystemOperationsConfiguration({ HEARTH_BACKUP_DIR: 'relative/backups' }),
    ).toThrow('HEARTH_BACKUP_DIR must be an absolute path');
    expect(() => resolveSystemOperationsConfiguration({ HEARTH_BACKUP_DIR: '/' })).toThrow(
      'HEARTH_BACKUP_DIR must be a dedicated directory',
    );
    expect(() => resolveSystemOperationsConfiguration({ HEARTH_BACKUP_RETENTION: '1' })).toThrow(
      'HEARTH_BACKUP_RETENTION must be an integer from 2 to 90',
    );

    const blockedBackupPath = join(directory, 'not-a-backup-directory');
    await writeFile(blockedBackupPath, 'occupied');
    const blockedService = new SqliteSystemOperations(adminRepository, {
      database,
      backupDirectory: blockedBackupPath,
      retentionCount: 14,
      intervalHours: 24,
      version: 'test-release',
      mode: 'private',
      clock: new MutableClock('2026-08-03T07:42:00.000Z'),
    });
    const blockedStatus = await blockedService.getStatus(DEMO_HOUSEHOLD_ID, 'member_maya');
    expect(blockedStatus.backup).toMatchObject({
      state: 'failed',
      message: 'Hearth cannot read the backup storage. Check Synology storage and try again.',
    });
    expect(JSON.stringify(blockedStatus)).not.toContain(directory);
    await expect(
      blockedService.createBackup(
        DEMO_HOUSEHOLD_ID,
        'member_maya',
        'request_backup_storage_failure',
      ),
    ).rejects.toMatchObject({
      code: 'INTEGRATION_UNAVAILABLE',
      message: 'Hearth could not create a backup. Check Synology storage and try again.',
    });
    blockedService.close();
    service.close();
    adminRepository.close();
  });
});
