PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

ALTER TABLE photo_assets ADD COLUMN source_fingerprint TEXT;

CREATE INDEX photo_assets_source_status_idx
  ON photo_assets(source_id, asset_status, hidden, indexed_at);

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (15, 'synology_photo_index', '2026-08-09T10:00:00.000Z');
