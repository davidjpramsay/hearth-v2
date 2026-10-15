PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

-- Short codes only locate an invitation; they never confer adult/device authority.
CREATE TABLE controller_phone_invitation_codes (
  invitation_id TEXT PRIMARY KEY REFERENCES controller_phone_invitations(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE CHECK(length(code_hash) = 64)
) STRICT;

CREATE TABLE home_assistant_bridge_pairings (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL UNIQUE CHECK(length(secret_hash) = 64),
  code_hash TEXT NOT NULL UNIQUE CHECK(length(code_hash) = 64),
  expires_at TEXT NOT NULL,
  record_json TEXT NOT NULL CHECK(json_valid(record_json))
) STRICT;

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (31, 'connection_codes', '2026-10-15T00:00:00.000Z');
COMMIT;
