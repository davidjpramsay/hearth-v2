PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

ALTER TABLE members
  ADD COLUMN capabilities_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(capabilities_json));

CREATE TABLE pairing_requests (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  device_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'expired', 'cancelled')),
  expires_at TEXT NOT NULL,
  approved_device_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE paired_devices (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  device_type TEXT NOT NULL CHECK (device_type = 'television'),
  credential_reference TEXT NOT NULL,
  scopes_json TEXT NOT NULL CHECK (json_valid(scopes_json)),
  paired_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT,
  application_version TEXT,
  capabilities_json TEXT NOT NULL CHECK (json_valid(capabilities_json))
) STRICT;

CREATE INDEX paired_devices_household_idx ON paired_devices(household_id, revoked_at);
CREATE INDEX pairing_requests_status_expiry_idx ON pairing_requests(status, expires_at);

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (2, 'admin_and_pairing', '2026-08-03T01:00:00.000Z');
