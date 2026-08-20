PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

ALTER TABLE today_section_preferences
  ADD COLUMN show_daily_verse INTEGER NOT NULL DEFAULT 0
  CHECK (show_daily_verse IN (0, 1));

CREATE TABLE daily_verse_cache (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  passage_reference TEXT NOT NULL,
  verse_text TEXT NOT NULL CHECK (length(trim(verse_text)) BETWEEN 1 AND 1200),
  source_url TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (household_id, passage_reference)
) STRICT;

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (24, 'daily_bible_verse', '2026-08-20T13:00:00.000Z');
