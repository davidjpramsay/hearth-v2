PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

ALTER TABLE companion_sessions
  ADD COLUMN credential_id TEXT REFERENCES passkey_credentials(credential_id) ON DELETE SET NULL;

-- Before this migration each adult could have only one active passkey. Link those existing
-- sessions where the relationship is unambiguous so revoking that credential also revokes its
-- pre-upgrade sessions. Leave ambiguous or already-revoked accounts fail-safe for explicit
-- recovery rather than guessing.
UPDATE companion_sessions
SET credential_id = (
  SELECT credential_id
  FROM passkey_credentials
  WHERE passkey_credentials.household_id = companion_sessions.household_id
    AND passkey_credentials.member_id = companion_sessions.member_id
    AND passkey_credentials.revoked_at IS NULL
  LIMIT 1
)
WHERE credential_id IS NULL
  AND 1 = (
    SELECT COUNT(*)
    FROM passkey_credentials
    WHERE passkey_credentials.household_id = companion_sessions.household_id
      AND passkey_credentials.member_id = companion_sessions.member_id
      AND passkey_credentials.revoked_at IS NULL
  );

CREATE INDEX companion_sessions_credential_idx
  ON companion_sessions(credential_id, revoked_at, expires_at);

CREATE TABLE companion_recovery_codes (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE CHECK (length(code_hash) = 64),
  created_by_member_id TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  revoked_at TEXT
) STRICT;

CREATE UNIQUE INDEX companion_recovery_codes_active_member_idx
  ON companion_recovery_codes(household_id, member_id)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE INDEX companion_recovery_codes_expiry_idx
  ON companion_recovery_codes(expires_at, consumed_at, revoked_at);

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (20, 'adult_access_recovery', '2026-08-15T00:00:00.000Z');
