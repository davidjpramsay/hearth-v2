PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- Retire the external Apple/EventKit projection, including its credential hashes.
DROP TABLE IF EXISTS reminder_snapshot_receipts;
DROP TABLE IF EXISTS reminder_items;
DROP TABLE IF EXISTS reminder_lists;
DROP TABLE IF EXISTS reminder_source_devices;
DROP TABLE IF EXISTS reminder_source_pairing_requests;
DROP TABLE IF EXISTS reminder_sources;

-- Preserve the fact that the retired integration changed, without retaining
-- Apple-specific action names in the active application contract.
UPDATE audit_events
SET action_type = 'reminder.integration.retired',
    target_type = 'household',
    target_id = household_id
WHERE action_type IN (
  'reminder-source.pair',
  'reminder-source.revoke',
  'reminders.snapshot.replace'
);

CREATE TABLE hearth_reminder_lists (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
) STRICT;

CREATE INDEX hearth_reminder_lists_household_active_idx
  ON hearth_reminder_lists(household_id, archived_at, created_at);

INSERT INTO hearth_reminder_lists (id, household_id, title, created_at, updated_at, archived_at)
SELECT
  'reminder_list_' || lower(hex(randomblob(16))),
  id,
  'Reminders',
  '2026-08-27T10:00:00.000Z',
  '2026-08-27T10:00:00.000Z',
  NULL
FROM households;

CREATE TABLE hearth_reminders (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  list_id TEXT NOT NULL REFERENCES hearth_reminder_lists(id),
  title TEXT NOT NULL,
  due_local_date TEXT,
  due_at TEXT,
  has_due_time INTEGER NOT NULL CHECK (has_due_time IN (0, 1)),
  is_completed INTEGER NOT NULL CHECK (is_completed IN (0, 1)),
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (has_due_time = 0 OR (due_local_date IS NOT NULL AND due_at IS NOT NULL)),
  CHECK (has_due_time = 1 OR due_at IS NULL),
  CHECK (due_local_date IS NOT NULL OR (due_at IS NULL AND has_due_time = 0)),
  CHECK (is_completed = 1 OR completed_at IS NULL)
) STRICT;

CREATE INDEX hearth_reminders_household_active_due_idx
  ON hearth_reminders(household_id, deleted_at, is_completed, due_local_date, due_at);

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (27, 'native_reminders', '2026-08-27T10:00:00.000Z');
