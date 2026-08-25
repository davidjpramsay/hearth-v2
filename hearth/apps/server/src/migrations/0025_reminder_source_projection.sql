CREATE TABLE reminder_source_pairing_requests (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform = 'ios'),
  application_version TEXT NOT NULL,
  credential_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'approved', 'exchanged', 'expired', 'cancelled')
  ),
  expires_at TEXT NOT NULL,
  approved_household_id TEXT REFERENCES households(id),
  approved_by_member_id TEXT REFERENCES members(id),
  approval_request_id TEXT,
  approved_device_id TEXT,
  approved_source_id TEXT REFERENCES reminder_sources(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  exchanged_at TEXT
) STRICT;

CREATE INDEX reminder_source_pairing_status_idx
  ON reminder_source_pairing_requests(status, expires_at);

CREATE TABLE reminder_sources (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  display_name TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind = 'eventkit'),
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  revoked_request_id TEXT,
  last_snapshot_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_snapshot_sequence >= 0),
  last_snapshot_id TEXT,
  last_snapshot_generated_at TEXT,
  last_snapshot_received_at TEXT
) STRICT;

CREATE UNIQUE INDEX reminder_sources_one_active_per_household_idx
  ON reminder_sources(household_id)
  WHERE revoked_at IS NULL;

CREATE TABLE reminder_source_devices (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES reminder_sources(id),
  household_id TEXT NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform = 'ios'),
  application_version TEXT NOT NULL,
  credential_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL CHECK (json_valid(scopes_json)),
  approved_by_member_id TEXT NOT NULL REFERENCES members(id),
  paired_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT
) STRICT;

CREATE UNIQUE INDEX reminder_source_devices_one_active_per_source_idx
  ON reminder_source_devices(source_id)
  WHERE revoked_at IS NULL;

CREATE INDEX reminder_source_devices_household_idx
  ON reminder_source_devices(household_id, revoked_at);

CREATE TABLE reminder_lists (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES reminder_sources(id),
  external_id_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  removed_at TEXT,
  UNIQUE (source_id, external_id_hash)
) STRICT;

CREATE INDEX reminder_lists_source_active_idx
  ON reminder_lists(source_id, removed_at, title);

CREATE TABLE reminder_items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES reminder_sources(id),
  list_id TEXT NOT NULL REFERENCES reminder_lists(id),
  external_id_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  due_local_date TEXT,
  due_at TEXT,
  has_due_time INTEGER NOT NULL CHECK (has_due_time IN (0, 1)),
  is_completed INTEGER NOT NULL CHECK (is_completed IN (0, 1)),
  completed_at TEXT,
  source_updated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  removed_at TEXT,
  UNIQUE (source_id, external_id_hash),
  CHECK (has_due_time = 0 OR (due_local_date IS NOT NULL AND due_at IS NOT NULL)),
  CHECK (has_due_time = 1 OR due_at IS NULL),
  CHECK (due_local_date IS NOT NULL OR (due_at IS NULL AND has_due_time = 0)),
  CHECK (is_completed = 1 OR completed_at IS NULL)
) STRICT;

CREATE INDEX reminder_items_source_active_due_idx
  ON reminder_items(source_id, removed_at, is_completed, due_local_date, due_at);

CREATE TABLE reminder_snapshot_receipts (
  source_id TEXT NOT NULL REFERENCES reminder_sources(id),
  snapshot_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  payload_hash TEXT NOT NULL,
  response_json TEXT NOT NULL CHECK (json_valid(response_json)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (source_id, snapshot_id),
  UNIQUE (source_id, request_id),
  UNIQUE (source_id, sequence)
) STRICT;

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (25, 'reminder_source_projection', '2026-08-25T10:00:00.000Z');
