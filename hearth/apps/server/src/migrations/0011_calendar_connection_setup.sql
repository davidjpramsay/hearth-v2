PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE calendar_connection_settings (
  household_id TEXT PRIMARY KEY REFERENCES households(id),
  id TEXT NOT NULL UNIQUE,
  provider_type TEXT NOT NULL CHECK (provider_type = 'caldav'),
  label TEXT NOT NULL,
  server_host TEXT NOT NULL,
  account_hint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready', 'needs-attention')),
  selected_calendars_json TEXT NOT NULL CHECK (json_valid(selected_calendars_json)),
  last_checked_at TEXT NOT NULL,
  last_success_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (11, 'calendar_connection_setup', '2026-08-08T00:00:00.000Z');
