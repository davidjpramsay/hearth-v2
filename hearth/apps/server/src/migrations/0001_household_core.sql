PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
) STRICT;

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL,
  locale TEXT NOT NULL,
  week_starts_on INTEGER NOT NULL CHECK (week_starts_on BETWEEN 0 AND 6),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  display_name TEXT NOT NULL,
  colour TEXT NOT NULL,
  avatar_key TEXT,
  role TEXT NOT NULL CHECK (role IN ('adult', 'child')),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX members_household_idx ON members(household_id);

CREATE TABLE calendar_connections (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  provider_type TEXT NOT NULL,
  credential_reference TEXT,
  status TEXT NOT NULL,
  read_allowed INTEGER NOT NULL CHECK (read_allowed IN (0, 1)),
  write_allowed INTEGER NOT NULL CHECK (write_allowed IN (0, 1)),
  last_success_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE calendars (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES calendar_connections(id),
  external_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  colour TEXT NOT NULL,
  owner_member_id TEXT REFERENCES members(id),
  visible INTEGER NOT NULL CHECK (visible IN (0, 1)),
  UNIQUE (connection_id, external_id)
) STRICT;

CREATE TABLE calendar_events (
  id TEXT PRIMARY KEY,
  calendar_id TEXT NOT NULL REFERENCES calendars(id),
  external_id TEXT NOT NULL,
  provider_version TEXT,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  all_day INTEGER NOT NULL CHECK (all_day IN (0, 1)),
  starts_at TEXT,
  ends_at TEXT,
  start_local_date TEXT,
  end_local_date TEXT,
  recurrence_master_external_id TEXT,
  source_modified_at TEXT,
  synced_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (calendar_id, external_id)
) STRICT;

CREATE INDEX calendar_events_range_idx ON calendar_events(starts_at, ends_at);

CREATE TABLE chore_templates (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  title TEXT NOT NULL,
  description TEXT,
  recurrence_rule TEXT NOT NULL,
  routine_label TEXT NOT NULL,
  due_time TEXT,
  points_value INTEGER NOT NULL DEFAULT 0,
  active_from TEXT NOT NULL,
  active_until TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE chore_occurrences (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  template_id TEXT NOT NULL REFERENCES chore_templates(id),
  scheduled_local_date TEXT NOT NULL,
  instance_key TEXT NOT NULL,
  title_snapshot TEXT NOT NULL,
  routine_label_snapshot TEXT NOT NULL,
  assignee_member_id TEXT NOT NULL REFERENCES members(id),
  state TEXT NOT NULL CHECK (state IN ('pending', 'completed', 'skipped', 'excused', 'cancelled')),
  completion_id TEXT,
  completed_at TEXT,
  completed_by_actor_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (template_id, scheduled_local_date, instance_key, assignee_member_id)
) STRICT;

CREATE INDEX chore_occurrences_household_date_idx
  ON chore_occurrences(household_id, scheduled_local_date);

CREATE TABLE command_receipts (
  household_id TEXT NOT NULL REFERENCES households(id),
  request_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (household_id, request_id, command_type)
) STRICT;

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  household_id TEXT NOT NULL REFERENCES households(id),
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  source_channel TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  request_id TEXT,
  result TEXT NOT NULL CHECK (result IN ('succeeded', 'rejected', 'failed', 'reversed')),
  safe_summary_json TEXT NOT NULL
) STRICT;

CREATE INDEX audit_events_household_time_idx ON audit_events(household_id, occurred_at);

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (1, 'household_core', '2026-08-03T00:00:00.000Z');
