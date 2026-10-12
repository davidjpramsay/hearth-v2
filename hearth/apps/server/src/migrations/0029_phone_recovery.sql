PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

CREATE UNIQUE INDEX controller_phone_one_owner
  ON controller_phone_connections(household_id) WHERE source='owner' AND revoked_at IS NULL;

CREATE TABLE controller_phone_recovery_policy (
  household_id TEXT PRIMARY KEY REFERENCES households(id),
  owner_member_id TEXT NOT NULL REFERENCES members(id),
  trusted_connection_ids_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(trusted_connection_ids_json)),
  code_generation INTEGER NOT NULL DEFAULT 0 CHECK(code_generation >= 0),
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE controller_phone_recovery_cards (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  owner_connection_id TEXT NOT NULL REFERENCES controller_phone_connections(id),
  creator_connection_id TEXT NOT NULL REFERENCES controller_phone_connections(id),
  request_id TEXT NOT NULL,
  generation INTEGER NOT NULL CHECK(generation > 0),
  secret_hash TEXT NOT NULL UNIQUE CHECK(length(secret_hash) = 64),
  created_at TEXT NOT NULL,
  pending_expires_at TEXT NOT NULL,
  activated_at TEXT,
  consumed_at TEXT,
  revoked_at TEXT,
  claim_context_hash TEXT,
  claim_request_id TEXT,
  claim_phone_name TEXT,
  UNIQUE(household_id, creator_connection_id, request_id),
  UNIQUE(household_id, generation)
) STRICT;
CREATE UNIQUE INDEX controller_phone_one_active_recovery_card
  ON controller_phone_recovery_cards(household_id)
  WHERE activated_at IS NOT NULL AND consumed_at IS NULL AND revoked_at IS NULL;

CREATE TABLE controller_phone_recovery_commands (
  household_id TEXT NOT NULL REFERENCES households(id),
  connection_id TEXT NOT NULL REFERENCES controller_phone_connections(id),
  request_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload_hash TEXT NOT NULL CHECK(length(payload_hash) = 64),
  created_at TEXT NOT NULL,
  PRIMARY KEY(household_id, connection_id, request_id)
) STRICT;

ALTER TABLE controller_phone_invitations ADD COLUMN purpose TEXT NOT NULL DEFAULT 'connect'
  CHECK(purpose IN ('connect', 'recover-owner'));
ALTER TABLE controller_phone_invitations ADD COLUMN replaces_connection_id TEXT
  REFERENCES controller_phone_connections(id);

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (29, 'phone_recovery', '2026-10-12T00:00:00.000Z');
COMMIT;
