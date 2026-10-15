PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

CREATE TABLE home_assistant_bridge_connections (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  request_id TEXT NOT NULL,
  secret_hash TEXT NOT NULL UNIQUE CHECK(length(secret_hash) = 64),
  input_hash TEXT NOT NULL CHECK(length(input_hash) = 64),
  record_json TEXT NOT NULL CHECK(json_valid(record_json)),
  revoked_at TEXT,
  UNIQUE(household_id, request_id)
) STRICT;
CREATE UNIQUE INDEX home_assistant_bridge_active_home
  ON home_assistant_bridge_connections(household_id) WHERE revoked_at IS NULL;

CREATE TABLE home_assistant_bridge_commands (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES home_assistant_bridge_connections(id),
  device_id TEXT NOT NULL REFERENCES paired_devices(id),
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  record_json TEXT NOT NULL CHECK(json_valid(record_json)),
  UNIQUE(connection_id, request_id)
) STRICT;
CREATE TABLE home_assistant_bridge_revocations (
  household_id TEXT NOT NULL REFERENCES households(id),
  request_id TEXT NOT NULL,
  PRIMARY KEY(household_id, request_id)
) STRICT;

-- Bind chore request IDs before domain execution; completed results survive restarts.
CREATE TABLE home_assistant_bridge_chore_receipts (
  connection_id TEXT NOT NULL REFERENCES home_assistant_bridge_connections(id),
  request_id TEXT NOT NULL,
  record_json TEXT NOT NULL CHECK(json_valid(record_json)),
  PRIMARY KEY(connection_id, request_id)
) STRICT;

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (30, 'home_assistant_bridge', '2026-10-15T00:00:00.000Z');
COMMIT;
