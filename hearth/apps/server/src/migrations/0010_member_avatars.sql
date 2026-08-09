PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE member_avatars (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL CHECK (mime_type = 'image/jpeg'),
  image_bytes BLOB NOT NULL CHECK (
    typeof(image_bytes) = 'blob' AND length(image_bytes) BETWEEN 4 AND 1000000
  ),
  version_key TEXT NOT NULL CHECK (length(version_key) BETWEEN 12 AND 64),
  original_avatar_key TEXT NOT NULL CHECK (substr(original_avatar_key, 1, 1) = '/'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, member_id)
) STRICT;

CREATE TRIGGER member_avatars_household_guard_insert
BEFORE INSERT ON member_avatars
WHEN NOT EXISTS (
  SELECT 1 FROM members
  WHERE id = NEW.member_id AND household_id = NEW.household_id
)
BEGIN
  SELECT RAISE(ABORT, 'member avatar household mismatch');
END;

CREATE TRIGGER member_avatars_household_guard_update
BEFORE UPDATE ON member_avatars
WHEN NOT EXISTS (
  SELECT 1 FROM members
  WHERE id = NEW.member_id AND household_id = NEW.household_id
)
BEGIN
  SELECT RAISE(ABORT, 'member avatar household mismatch');
END;

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (10, 'member_avatars', '2026-08-08T00:00:00.000Z');
