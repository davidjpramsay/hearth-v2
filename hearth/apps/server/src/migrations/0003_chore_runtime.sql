PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE chore_template_assignees (
  template_id TEXT NOT NULL REFERENCES chore_templates(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id),
  PRIMARY KEY (template_id, member_id)
) STRICT;

ALTER TABLE chore_occurrences ADD COLUMN skipped_at TEXT;
ALTER TABLE chore_occurrences ADD COLUMN skipped_by_actor_id TEXT;

CREATE INDEX chore_template_assignees_member_idx
  ON chore_template_assignees(member_id, template_id);

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (3, 'chore_runtime', '2026-08-03T02:00:00.000Z');
