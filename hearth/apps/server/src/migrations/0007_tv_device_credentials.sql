PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

ALTER TABLE pairing_requests
  ADD COLUMN credential_hash TEXT
  CHECK (credential_hash IS NULL OR length(credential_hash) = 64);

ALTER TABLE pairing_requests
  ADD COLUMN application_version TEXT;

ALTER TABLE pairing_requests
  ADD COLUMN credential_exchanged_at TEXT;

CREATE INDEX pairing_requests_credential_idx
  ON pairing_requests(credential_hash)
  WHERE credential_hash IS NOT NULL;

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (7, 'tv_device_credentials', '2026-08-04T00:00:00.000Z');
