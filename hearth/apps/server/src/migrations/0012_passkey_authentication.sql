PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE passkey_credentials (
  id TEXT PRIMARY KEY,
  credential_id TEXT NOT NULL UNIQUE,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  webauthn_user_id TEXT NOT NULL,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL CHECK (counter >= 0),
  device_type TEXT NOT NULL CHECK (device_type IN ('singleDevice', 'multiDevice')),
  backed_up INTEGER NOT NULL CHECK (backed_up IN (0, 1)),
  transports_json TEXT NOT NULL CHECK (json_valid(transports_json)),
  label TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
) STRICT;

CREATE INDEX passkey_credentials_member_idx
  ON passkey_credentials(household_id, member_id, revoked_at);

CREATE TABLE companion_sessions (
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
) STRICT;

CREATE INDEX companion_sessions_member_idx
  ON companion_sessions(household_id, member_id, revoked_at, expires_at);

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (12, 'passkey_authentication', '2026-08-09T04:00:00.000Z');
