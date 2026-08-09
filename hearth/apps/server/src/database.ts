import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';

const migrations = [
  { version: 1, url: new URL('./migrations/0001_household_core.sql', import.meta.url) },
  { version: 2, url: new URL('./migrations/0002_admin_and_pairing.sql', import.meta.url) },
  { version: 3, url: new URL('./migrations/0003_chore_runtime.sql', import.meta.url) },
  { version: 4, url: new URL('./migrations/0004_calendar_projection.sql', import.meta.url) },
  { version: 5, url: new URL('./migrations/0005_household_planning.sql', import.meta.url) },
  { version: 6, url: new URL('./migrations/0006_home_assistant_projection.sql', import.meta.url) },
  { version: 7, url: new URL('./migrations/0007_tv_device_credentials.sql', import.meta.url) },
  { version: 8, url: new URL('./migrations/0008_photo_library.sql', import.meta.url) },
  { version: 9, url: new URL('./migrations/0009_pocket_money.sql', import.meta.url) },
  { version: 10, url: new URL('./migrations/0010_member_avatars.sql', import.meta.url) },
  { version: 11, url: new URL('./migrations/0011_calendar_connection_setup.sql', import.meta.url) },
] as const;

export async function openHearthDatabase(path: string): Promise<InstanceType<typeof Database>> {
  await mkdir(dirname(path), { recursive: true });
  const database = new Database(path);
  database.pragma('foreign_keys = ON');
  database.pragma('journal_mode = WAL');
  applyMigrations(database);
  return database;
}

export function applyMigrations(database: InstanceType<typeof Database>): void {
  const hasMigrationTable = database
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get();
  const applied = new Set<number>();
  if (hasMigrationTable !== undefined) {
    const rows = database.prepare('SELECT version FROM schema_migrations').all() as {
      version: number;
    }[];
    for (const row of rows) applied.add(row.version);
  }

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    database.exec(readFileSync(fileURLToPath(migration.url), 'utf8'));
  }
}
