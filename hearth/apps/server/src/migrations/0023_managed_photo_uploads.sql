PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE photo_managed_uploads (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL UNIQUE REFERENCES photo_assets(id) ON DELETE CASCADE,
  master_key TEXT NOT NULL UNIQUE,
  content_hash TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  uploaded_at TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  source_channel TEXT NOT NULL CHECK (source_channel = 'companion'),
  UNIQUE (household_id, content_hash)
) STRICT;

CREATE INDEX photo_managed_uploads_household_idx
  ON photo_managed_uploads(household_id, uploaded_at DESC);

CREATE TABLE photo_folder_import_status (
  household_id TEXT PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ready', 'unconfigured', 'unavailable')),
  last_checked_at TEXT,
  imported_photo_count INTEGER NOT NULL CHECK (imported_photo_count >= 0),
  updated_at TEXT NOT NULL
) STRICT;

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (23, 'managed_photo_uploads', '2026-08-20T12:00:00.000Z');
