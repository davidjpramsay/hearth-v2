PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

ALTER TABLE calendar_connections ADD COLUMN sync_cursor TEXT;
ALTER TABLE calendar_connections ADD COLUMN last_attempt_at TEXT;
ALTER TABLE calendar_connections ADD COLUMN last_error_code TEXT;
ALTER TABLE calendar_connections ADD COLUMN sync_window_start TEXT;
ALTER TABLE calendar_connections ADD COLUMN sync_window_end TEXT;
ALTER TABLE calendar_events
  ADD COLUMN is_recurrence_exception INTEGER NOT NULL DEFAULT 0
  CHECK (is_recurrence_exception IN (0, 1));

CREATE INDEX calendar_connections_household_idx
  ON calendar_connections(household_id, provider_type);

CREATE INDEX calendar_events_local_range_idx
  ON calendar_events(start_local_date, end_local_date, deleted_at);

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (4, 'calendar_projection', '2026-08-03T03:00:00.000Z');
