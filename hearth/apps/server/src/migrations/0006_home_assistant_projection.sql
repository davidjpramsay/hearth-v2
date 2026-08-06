PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE home_state_cache (
  household_id TEXT PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
  occupied INTEGER NOT NULL CHECK (occupied IN (0, 1)),
  television_power TEXT NOT NULL CHECK (television_power IN ('on', 'standby')),
  hearth_foreground INTEGER NOT NULL CHECK (hearth_foreground IN (0, 1)),
  protected_media_active INTEGER NOT NULL CHECK (protected_media_active IN (0, 1)),
  observed_at TEXT NOT NULL,
  cached_at TEXT NOT NULL
) STRICT;

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (6, 'home_assistant_projection', '2026-08-03T06:00:00.000Z');
