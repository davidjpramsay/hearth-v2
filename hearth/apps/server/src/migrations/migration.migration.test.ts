import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { applyMigrations } from '../database.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true })),
  );
});

describe('0001 household core migration', () => {
  it('runs forward on a WAL database and enforces occurrence uniqueness', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-migration-'));
    temporaryDirectories.push(directory);
    const database = new Database(join(directory, 'hearth.sqlite'));
    const migrationPath = fileURLToPath(new URL('./0001_household_core.sql', import.meta.url));
    database.exec(readFileSync(migrationPath, 'utf8'));

    expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(database.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(database.prepare('SELECT name FROM schema_migrations WHERE version = 1').get()).toEqual({
      name: 'household_core',
    });

    database.exec(`
      INSERT INTO households VALUES ('household_test', 'Test', 'Australia/Perth', 'en-AU', 1, 'now', 'now');
      INSERT INTO members VALUES ('member_test', 'household_test', 'Tester', '#000000', NULL, 'adult', NULL, 'now', 'now');
      INSERT INTO chore_templates VALUES ('template_test', 'household_test', 'Test chore', NULL, 'FREQ=DAILY', 'Morning', NULL, 0, '2026-08-03', NULL, NULL, 'now', 'now');
      INSERT INTO chore_occurrences VALUES ('occurrence_one', 'household_test', 'template_test', '2026-08-03', 'default', 'Test chore', 'Morning', 'member_test', 'pending', NULL, NULL, NULL, 'now', 'now');
    `);
    expect(() =>
      database.exec(`
        INSERT INTO chore_occurrences VALUES ('occurrence_two', 'household_test', 'template_test', '2026-08-03', 'default', 'Test chore', 'Morning', 'member_test', 'pending', NULL, NULL, NULL, 'now', 'now');
      `),
    ).toThrow(/UNIQUE/);
    expect(() =>
      database.exec(`
        INSERT INTO members VALUES ('member_orphan', 'household_missing', 'Orphan', '#000000', NULL, 'adult', NULL, 'now', 'now');
      `),
    ).toThrow(/FOREIGN KEY/);
    database.close();
  });

  it('applies the admin/pairing migration forward with strict device constraints', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-migration-'));
    temporaryDirectories.push(directory);
    const database = new Database(join(directory, 'hearth.sqlite'));
    applyMigrations(database);

    expect(database.prepare('SELECT name FROM schema_migrations WHERE version = 2').get()).toEqual({
      name: 'admin_and_pairing',
    });
    database.exec(`
      INSERT INTO households VALUES ('household_pair', 'Pair', 'Australia/Perth', 'en-AU', 1, 'now', 'now');
      INSERT INTO paired_devices VALUES (
        'device_pair', 'household_pair', 'TV', 'television', 'secure-reference',
        '["household.read"]', '2026-08-03T00:00:00.000Z', NULL, NULL, 'test', '["dpad"]'
      );
    `);
    expect(() =>
      database.exec(`
        INSERT INTO paired_devices VALUES (
          'device_bad', 'household_pair', 'Bad', 'phone', 'secure-reference',
          '[]', '2026-08-03T00:00:00.000Z', NULL, NULL, 'test', '[]'
        );
      `),
    ).toThrow(/CHECK/);
    expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(database.pragma('journal_mode', { simple: true })).toBe('wal');
    database.close();
  });

  it('applies the chore runtime migration with assignee integrity and skip metadata', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-migration-'));
    temporaryDirectories.push(directory);
    const database = new Database(join(directory, 'hearth.sqlite'));
    applyMigrations(database);

    expect(database.prepare('SELECT name FROM schema_migrations WHERE version = 3').get()).toEqual({
      name: 'chore_runtime',
    });
    database.exec(`
      INSERT INTO households VALUES ('household_chore', 'Chore', 'Australia/Perth', 'en-AU', 1, 'now', 'now');
      INSERT INTO members VALUES ('member_chore', 'household_chore', 'Tester', '#000000', NULL, 'adult', NULL, 'now', 'now', '["chores.complete"]');
      INSERT INTO chore_templates VALUES ('template_chore', 'household_chore', 'Test chore', NULL, 'FREQ=DAILY', 'Morning', NULL, 0, '2026-08-03', NULL, NULL, 'now', 'now');
      INSERT INTO chore_template_assignees VALUES ('template_chore', 'member_chore');
      INSERT INTO chore_occurrences VALUES ('occurrence_chore', 'household_chore', 'template_chore', '2026-08-03', 'default', 'Test chore', 'Morning', 'member_chore', 'skipped', NULL, NULL, NULL, 'now', 'now', 'now', 'member_chore');
    `);
    expect(
      database
        .prepare('SELECT skipped_by_actor_id FROM chore_occurrences WHERE id = ?')
        .get('occurrence_chore'),
    ).toEqual({ skipped_by_actor_id: 'member_chore' });
    expect(() =>
      database.exec(
        "INSERT INTO chore_template_assignees VALUES ('template_chore', 'member_missing');",
      ),
    ).toThrow(/FOREIGN KEY/);
    database.close();
  });

  it('adds durable provider cursor, bounded window and local-date cache indexes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-migration-'));
    temporaryDirectories.push(directory);
    const database = new Database(join(directory, 'hearth.sqlite'));
    applyMigrations(database);

    expect(database.prepare('SELECT name FROM schema_migrations WHERE version = 4').get()).toEqual({
      name: 'calendar_projection',
    });
    const columns = database.prepare('PRAGMA table_info(calendar_connections)').all() as Array<{
      name: string;
    }>;
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'sync_cursor',
        'last_attempt_at',
        'last_error_code',
        'sync_window_start',
        'sync_window_end',
      ]),
    );
    const indexes = database.prepare('PRAGMA index_list(calendar_events)').all() as Array<{
      name: string;
    }>;
    expect(indexes.map((index) => index.name)).toContain('calendar_events_local_range_idx');
    const eventColumns = database.prepare('PRAGMA table_info(calendar_events)').all() as Array<{
      name: string;
    }>;
    expect(eventColumns.map((column) => column.name)).toContain('is_recurrence_exception');
    expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(database.pragma('journal_mode', { simple: true })).toBe('wal');
    database.close();
  });

  it('adds strict list, meal and reversal-safe reward planning tables', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-migration-'));
    temporaryDirectories.push(directory);
    const database = new Database(join(directory, 'hearth.sqlite'));
    applyMigrations(database);

    expect(database.prepare('SELECT name FROM schema_migrations WHERE version = 5').get()).toEqual({
      name: 'household_planning',
    });
    database.exec(`
      INSERT INTO households VALUES ('household_plan', 'Plan', 'Australia/Perth', 'en-AU', 1, 'now', 'now');
      INSERT INTO members VALUES ('member_plan', 'household_plan', 'Planner', '#000000', NULL, 'adult', NULL, 'now', 'now', '["household.admin"]');
      INSERT INTO household_lists VALUES ('list_plan', 'household_plan', 'Groceries', 'grocery', '#000000', 0, NULL, 'now', 'now');
      INSERT INTO list_items VALUES ('item_plan', 'list_plan', 'Milk', 'milk', NULL, 0, NULL, NULL, NULL, 'now', 'now');
      INSERT INTO reward_definitions VALUES ('reward_plan', 'household_plan', 'Movie', NULL, 10, 1, NULL, 'now', 'now');
      INSERT INTO reward_ledger_entries VALUES ('entry_plan', 'household_plan', 'member_plan', 10, 'Award', NULL, NULL, NULL, 'member_plan', 'companion', 'now');
      INSERT INTO reward_ledger_entries VALUES ('entry_reverse', 'household_plan', 'member_plan', -10, 'Award reversed', NULL, NULL, 'entry_plan', 'member_plan', 'companion', 'later');
    `);
    expect(() =>
      database.exec(
        "INSERT INTO reward_ledger_entries VALUES ('entry_reverse_twice', 'household_plan', 'member_plan', -10, 'Again', NULL, NULL, 'entry_plan', 'member_plan', 'companion', 'later');",
      ),
    ).toThrow(/UNIQUE/);
    expect(() =>
      database.exec(
        "INSERT INTO household_lists VALUES ('list_bad', 'household_plan', 'Bad', 'unknown', '#000000', 1, NULL, 'now', 'now');",
      ),
    ).toThrow(/CHECK/);
    expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(database.pragma('journal_mode', { simple: true })).toBe('wal');
    database.close();
  });

  it('adds a constrained Home Assistant cache without media metadata', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-migration-'));
    temporaryDirectories.push(directory);
    const database = new Database(join(directory, 'hearth.sqlite'));
    applyMigrations(database);

    expect(database.prepare('SELECT name FROM schema_migrations WHERE version = 6').get()).toEqual({
      name: 'home_assistant_projection',
    });
    database.exec(`
      INSERT INTO households VALUES ('household_home', 'Home', 'Australia/Perth', 'en-AU', 1, 'now', 'now');
      INSERT INTO households VALUES ('household_bad', 'Bad', 'Australia/Perth', 'en-AU', 1, 'now', 'now');
      INSERT INTO home_state_cache VALUES ('household_home', 1, 'on', 1, 0, 'observed', 'cached');
    `);
    const columns = database.prepare('PRAGMA table_info(home_state_cache)').all() as Array<{
      name: string;
    }>;
    expect(columns.map((column) => column.name)).toEqual([
      'household_id',
      'occupied',
      'television_power',
      'hearth_foreground',
      'protected_media_active',
      'observed_at',
      'cached_at',
    ]);
    expect(() =>
      database.exec(
        "INSERT INTO home_state_cache VALUES ('household_bad', 1, 'playing-music', 1, 0, 'observed', 'cached');",
      ),
    ).toThrow(/CHECK/);
    expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(database.pragma('journal_mode', { simple: true })).toBe('wal');
    database.close();
  });

  it('adds hash-only native television credential exchange fields', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-migration-'));
    temporaryDirectories.push(directory);
    const database = new Database(join(directory, 'hearth.sqlite'));
    applyMigrations(database);

    expect(database.prepare('SELECT name FROM schema_migrations WHERE version = 7').get()).toEqual({
      name: 'tv_device_credentials',
    });
    const columns = database.prepare('PRAGMA table_info(pairing_requests)').all() as Array<{
      name: string;
    }>;
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['credential_hash', 'application_version', 'credential_exchanged_at']),
    );
    expect(() =>
      database.exec(`
        INSERT INTO pairing_requests
          (id, request_id, code, device_name, status, expires_at, created_at, updated_at, credential_hash)
        VALUES ('pair_bad', 'request_bad', 'BAD123', 'Bad', 'pending', 'later', 'now', 'now', 'plaintext');
      `),
    ).toThrow(/CHECK/);
    expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(database.pragma('journal_mode', { simple: true })).toBe('wal');
    database.close();
  });

  it('adds one approved photo source with opaque, orientation-safe asset records', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-migration-'));
    temporaryDirectories.push(directory);
    const database = new Database(join(directory, 'hearth.sqlite'));
    applyMigrations(database);

    expect(database.prepare('SELECT name FROM schema_migrations WHERE version = 8').get()).toEqual({
      name: 'photo_library',
    });
    database.exec(`
      INSERT INTO households VALUES ('household_photo', 'Photo', 'Australia/Perth', 'en-AU', 1, 'now', 'now');
      INSERT INTO photo_sources VALUES (
        'source_photo', 'household_photo', 'synology-folder', 'Family favourites',
        'config:family-favourites', 'ready', 'now', 'now', 'now'
      );
      INSERT INTO photo_assets VALUES (
        'asset_photo', 'source_photo', 'opaque:1', 'derivative:1', 'thumbnail:1',
        'A family photo.', 1600, 1067, 'landscape', NULL, 1, 0, 'ready', NULL, 'now'
      );
    `);
    expect(() =>
      database.exec(`
        INSERT INTO photo_assets VALUES (
          'asset_duplicate', 'source_photo', 'opaque:1', 'derivative:2', 'thumbnail:2',
          'Duplicate.', 1600, 1067, 'landscape', NULL, 0, 0, 'ready', NULL, 'now'
        );
      `),
    ).toThrow(/UNIQUE/);
    expect(() =>
      database.exec(`
        INSERT INTO photo_assets VALUES (
          'asset_bad', 'source_photo', 'opaque:bad', 'derivative:bad', 'thumbnail:bad',
          'Bad.', 0, 1067, 'upside-down', NULL, 0, 0, 'ready', NULL, 'now'
        );
      `),
    ).toThrow(/CHECK/);
    const columns = database.prepare('PRAGMA table_info(photo_assets)').all() as Array<{
      name: string;
    }>;
    expect(columns.map((column) => column.name)).not.toContain('filesystem_path');
    expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(database.pragma('journal_mode', { simple: true })).toBe('wal');
    database.close();
  });

  it('adds required child pocket-money settings and one payment snapshot per week', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-migration-'));
    temporaryDirectories.push(directory);
    const database = new Database(join(directory, 'hearth.sqlite'));
    applyMigrations(database);

    expect(database.prepare('SELECT name FROM schema_migrations WHERE version = 9').get()).toEqual({
      name: 'pocket_money',
    });
    database.exec(`
      INSERT INTO households VALUES ('household_money', 'Money', 'Australia/Perth', 'en-AU', 1, 'now', 'now');
      INSERT INTO members VALUES ('member_child', 'household_money', 'Child', '#000000', NULL, 'child', NULL, 'now', 'now', '["pocket-money.view"]');
      INSERT INTO members VALUES ('member_adult', 'household_money', 'Adult', '#111111', NULL, 'adult', NULL, 'now', 'now', '["household.admin"]');
      INSERT INTO pocket_money_settings VALUES ('household_money', 'member_child', 1200, 'AUD', 'friday', 'now', 'now');
      INSERT INTO pocket_money_payments VALUES (
        'payment_one', 'household_money', 'member_child', '2026-08-03', '2026-08-09',
        6, 4, 67, 800, 'now', 'member_adult', 'companion'
      );
    `);
    expect(() =>
      database.exec(
        "INSERT INTO pocket_money_settings VALUES ('household_money', 'member_adult', 1000, 'AUD', 'friday', 'now', 'now');",
      ),
    ).toThrow(/active child/);
    expect(() =>
      database.exec(
        "INSERT INTO pocket_money_payments VALUES ('payment_two', 'household_money', 'member_child', '2026-08-03', '2026-08-09', 6, 4, 67, 800, 'later', 'member_adult', 'companion');",
      ),
    ).toThrow(/UNIQUE/);
    expect(() =>
      database.exec(
        "INSERT INTO pocket_money_settings VALUES ('household_money', 'member_child', 0, 'AUD', 'friday', 'now', 'now');",
      ),
    ).toThrow();
    database.close();
  });

  it('adds bounded local member avatars with household integrity', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-migration-'));
    temporaryDirectories.push(directory);
    const database = new Database(join(directory, 'hearth.sqlite'));
    applyMigrations(database);

    expect(database.prepare('SELECT name FROM schema_migrations WHERE version = 10').get()).toEqual(
      {
        name: 'member_avatars',
      },
    );
    database.exec(`
      INSERT INTO households VALUES ('household_avatar', 'Avatar', 'Australia/Perth', 'en-AU', 1, 'now', 'now');
      INSERT INTO households VALUES ('household_other', 'Other', 'Australia/Perth', 'en-AU', 1, 'now', 'now');
      INSERT INTO members VALUES ('member_avatar', 'household_avatar', 'Person', '#000000', '/original.jpg', 'adult', NULL, 'now', 'now', '["household.admin"]');
    `);
    database
      .prepare(
        `INSERT INTO member_avatars
          (household_id, member_id, mime_type, image_bytes, version_key, original_avatar_key,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'household_avatar',
        'member_avatar',
        'image/jpeg',
        Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
        '123456789abc',
        '/original.jpg',
        'now',
        'now',
      );
    expect(
      database.prepare('SELECT length(image_bytes) AS size FROM member_avatars').get(),
    ).toEqual({ size: 4 });
    expect(() =>
      database
        .prepare(
          `INSERT INTO member_avatars
            (household_id, member_id, mime_type, image_bytes, version_key, original_avatar_key,
             created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          'household_other',
          'member_avatar',
          'image/jpeg',
          Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
          'abcdef123456',
          '/original.jpg',
          'now',
          'now',
        ),
    ).toThrow(/household mismatch/);
    database.close();
  });

  it('adds credential-free calendar setup metadata with strict selected-calendar JSON', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-migration-'));
    temporaryDirectories.push(directory);
    const database = new Database(join(directory, 'hearth.sqlite'));
    applyMigrations(database);

    expect(database.prepare('SELECT name FROM schema_migrations WHERE version = 11').get()).toEqual(
      { name: 'calendar_connection_setup' },
    );
    const columns = database
      .prepare('PRAGMA table_info(calendar_connection_settings)')
      .all() as Array<{
      name: string;
    }>;
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['server_host', 'account_hint', 'selected_calendars_json']),
    );
    expect(columns.map((column) => column.name)).not.toEqual(
      expect.arrayContaining(['password', 'username', 'server_url', 'credential']),
    );
    database.exec(`
      INSERT INTO households VALUES ('household_calendar_setup', 'Calendar', 'Australia/Perth', 'en-AU', 1, 'now', 'now');
      INSERT INTO calendar_connection_settings VALUES (
        'household_calendar_setup', 'calendar_setup_test', 'caldav', 'Family calendars',
        'caldav.icloud.com', 'f•••@example.com', 'ready',
        '[{"displayName":"Family","color":"#2f766d","ownerMemberId":null}]',
        'now', 'now', NULL, 'now', 'now'
      );
    `);
    expect(() =>
      database.exec(`
        UPDATE calendar_connection_settings
        SET selected_calendars_json = 'not-json'
        WHERE household_id = 'household_calendar_setup';
      `),
    ).toThrow(/CHECK/);
    expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(database.pragma('journal_mode', { simple: true })).toBe('wal');
    database.close();
  });

  it('adds public-key passkeys and hash-only companion sessions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-migration-'));
    temporaryDirectories.push(directory);
    const database = new Database(join(directory, 'hearth.sqlite'));
    applyMigrations(database);

    expect(database.prepare('SELECT name FROM schema_migrations WHERE version = 12').get()).toEqual(
      { name: 'passkey_authentication' },
    );
    database.exec(`
      INSERT INTO households VALUES ('household_auth', 'Auth home', 'Australia/Perth', 'en-AU', 1, 'now', 'now');
      INSERT INTO members VALUES (
        'member_auth', 'household_auth', 'Adult', '#2f766d', NULL, 'adult', NULL,
        'now', 'now', '["household.admin"]'
      );
    `);
    database
      .prepare(
        `INSERT INTO passkey_credentials
          (id, credential_id, household_id, member_id, webauthn_user_id, public_key, counter,
           device_type, backed_up, transports_json, label, created_at, last_used_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'multiDevice', 1, ?, ?, ?, NULL, NULL)`,
      )
      .run(
        'passkey_auth',
        'credential_auth',
        'household_auth',
        'member_auth',
        'webauthn_user_auth',
        Buffer.from([1, 2, 3]),
        '["internal"]',
        'iPhone',
        'now',
      );
    database
      .prepare(
        `INSERT INTO companion_sessions
          (token_hash, household_id, member_id, created_at, last_seen_at, expires_at, revoked_at)
         VALUES (?, ?, ?, 'now', 'now', 'later', NULL)`,
      )
      .run('a'.repeat(64), 'household_auth', 'member_auth');
    expect(
      database.prepare('SELECT length(public_key) AS bytes FROM passkey_credentials').get(),
    ).toEqual({ bytes: 3 });
    expect(() =>
      database
        .prepare(
          `INSERT INTO companion_sessions
            (token_hash, household_id, member_id, created_at, last_seen_at, expires_at, revoked_at)
           VALUES ('plain-token', 'household_auth', 'member_auth', 'now', 'now', 'later', NULL)`,
        )
        .run(),
    ).toThrow(/CHECK/);
    database.close();
  });
});
