PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE today_section_preferences (
  household_id TEXT PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
  show_dinner INTEGER NOT NULL DEFAULT 1 CHECK (show_dinner IN (0, 1)),
  show_list_summary INTEGER NOT NULL DEFAULT 1 CHECK (show_list_summary IN (0, 1)),
  show_notice INTEGER NOT NULL DEFAULT 1 CHECK (show_notice IN (0, 1)),
  show_photo INTEGER NOT NULL DEFAULT 1 CHECK (show_photo IN (0, 1)),
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE announcements (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (length(trim(message)) BETWEEN 1 AND 240),
  priority TEXT NOT NULL CHECK (priority IN ('standard', 'important')),
  starts_at TEXT NOT NULL,
  expires_at TEXT CHECK (expires_at IS NULL OR expires_at > starts_at),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX announcements_household_window_idx
  ON announcements(household_id, archived_at, starts_at, expires_at, priority);

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (13, 'notices_and_today_sections', '2026-08-09T06:30:00.000Z');
