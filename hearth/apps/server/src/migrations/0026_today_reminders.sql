PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

ALTER TABLE today_section_preferences
  ADD COLUMN show_reminders INTEGER NOT NULL DEFAULT 1
  CHECK (show_reminders IN (0, 1));

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (26, 'today_reminders', '2026-08-26T10:00:00.000Z');
