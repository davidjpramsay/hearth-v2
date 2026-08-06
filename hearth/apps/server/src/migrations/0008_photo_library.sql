PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE photo_sources (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('synology-folder')),
  display_name TEXT NOT NULL,
  source_config_ref TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready', 'unconfigured', 'unavailable')),
  last_indexed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (household_id)
) STRICT;

CREATE TABLE photo_assets (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES photo_sources(id) ON DELETE CASCADE,
  provider_asset_id TEXT NOT NULL,
  derivative_key TEXT NOT NULL,
  thumbnail_key TEXT NOT NULL,
  alternative_text TEXT NOT NULL,
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  orientation TEXT NOT NULL CHECK (orientation IN ('landscape', 'portrait', 'square')),
  captured_at TEXT,
  favourite INTEGER NOT NULL CHECK (favourite IN (0, 1)),
  hidden INTEGER NOT NULL CHECK (hidden IN (0, 1)),
  asset_status TEXT NOT NULL CHECK (asset_status IN ('ready', 'unsupported', 'corrupt')),
  last_shown_at TEXT,
  indexed_at TEXT NOT NULL,
  UNIQUE (source_id, provider_asset_id),
  UNIQUE (derivative_key),
  UNIQUE (thumbnail_key)
) STRICT;

CREATE INDEX photo_assets_gallery_idx
  ON photo_assets(source_id, hidden, asset_status, favourite, captured_at);

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (8, 'photo_library', '2026-08-05T01:00:00.000Z');
