PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE home_assistant_connection_settings (
  household_id TEXT PRIMARY KEY REFERENCES households(id),
  id TEXT NOT NULL UNIQUE,
  provider_type TEXT NOT NULL CHECK (provider_type = 'home-assistant'),
  label TEXT NOT NULL,
  server_host TEXT NOT NULL,
  instance_name TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready', 'needs-attention')),
  state_mappings_json TEXT NOT NULL CHECK (json_valid(state_mappings_json)),
  action_mappings_json TEXT NOT NULL CHECK (json_valid(action_mappings_json)),
  last_checked_at TEXT NOT NULL,
  last_success_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (19, 'home_assistant_connection_setup', '2026-08-10T12:00:00.000Z');
