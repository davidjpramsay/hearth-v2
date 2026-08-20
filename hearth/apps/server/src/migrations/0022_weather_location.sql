PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE weather_locations (
  household_id TEXT PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  latitude REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  source TEXT NOT NULL CHECK (source IN ('search', 'device')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (22, 'weather_location', '2026-08-20T00:00:00.000Z');
