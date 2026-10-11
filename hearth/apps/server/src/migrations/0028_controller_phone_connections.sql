PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

CREATE TABLE controller_phone_connections (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 80),
  source TEXT NOT NULL CHECK(source IN ('owner', 'qr', 'legacy')),
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
) STRICT;
CREATE INDEX controller_phone_household_idx
  ON controller_phone_connections(household_id, revoked_at, expires_at);

ALTER TABLE companion_sessions ADD COLUMN phone_connection_id TEXT
  REFERENCES controller_phone_connections(id);
ALTER TABLE companion_sessions ADD COLUMN phone_confirmed_at TEXT;
CREATE INDEX companion_sessions_phone_idx ON companion_sessions(phone_connection_id, revoked_at);

-- One earlier-browser grant per already verified session, not per synced credential or handset.
CREATE TEMP TABLE legacy_phone_links(token_hash TEXT PRIMARY KEY, connection_id TEXT NOT NULL);
INSERT INTO legacy_phone_links SELECT s.token_hash, 'phone_legacy_' || lower(hex(randomblob(16)))
FROM companion_sessions s JOIN passkey_credentials p
  ON p.credential_id = s.credential_id AND p.household_id = s.household_id
  AND p.member_id = s.member_id
WHERE s.revoked_at IS NULL AND p.revoked_at IS NULL;
INSERT INTO controller_phone_connections
  (id, household_id, member_id, label, source, created_at, last_seen_at, expires_at)
SELECT l.connection_id, s.household_id, s.member_id,
       'Earlier browser', 'legacy', s.created_at, s.last_seen_at, s.expires_at
FROM companion_sessions s JOIN legacy_phone_links l ON l.token_hash = s.token_hash;
-- Session hash is used only for the private mapping, never as the public connection identifier.
UPDATE companion_sessions SET phone_connection_id = (
  SELECT connection_id FROM legacy_phone_links l WHERE l.token_hash = companion_sessions.token_hash
) WHERE token_hash IN (SELECT token_hash FROM legacy_phone_links);
DROP TABLE legacy_phone_links;

CREATE TABLE controller_phone_owner_grants (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  key_hash TEXT NOT NULL UNIQUE CHECK(length(key_hash) = 64),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  revoked_at TEXT
) STRICT;
CREATE TABLE controller_phone_invitations (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  creator_connection_id TEXT NOT NULL REFERENCES controller_phone_connections(id),
  creator_session_hash TEXT NOT NULL,
  request_id TEXT NOT NULL,
  secret_hash TEXT NOT NULL UNIQUE CHECK(length(secret_hash) = 64),
  claim_hash TEXT UNIQUE,
  phone_label TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  approved_at TEXT,
  consumed_at TEXT,
  cancelled_at TEXT,
  issued_session_hash TEXT,
  UNIQUE(household_id, creator_connection_id, request_id)
) STRICT;
CREATE INDEX controller_phone_invitation_expiry_idx ON controller_phone_invitations(expires_at);
INSERT INTO schema_migrations(version, name, applied_at)
VALUES (28, 'controller_phone_connections', '2026-10-12T00:00:00.000Z');
COMMIT;
