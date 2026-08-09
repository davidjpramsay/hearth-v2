ALTER TABLE chore_templates ADD COLUMN available_from_time TEXT;
ALTER TABLE chore_templates ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE chore_templates AS current
SET sort_order = (
  SELECT COUNT(*)
  FROM chore_templates AS earlier
  WHERE earlier.household_id = current.household_id
    AND (
      earlier.created_at < current.created_at
      OR (earlier.created_at = current.created_at AND earlier.id < current.id)
    )
);

ALTER TABLE chore_occurrences ADD COLUMN available_from_time_snapshot TEXT;
ALTER TABLE chore_occurrences ADD COLUMN sort_order_snapshot INTEGER NOT NULL DEFAULT 0;

UPDATE chore_occurrences AS occurrence
SET available_from_time_snapshot = (
      SELECT available_from_time
      FROM chore_templates
      WHERE chore_templates.id = occurrence.template_id
    ),
    sort_order_snapshot = (
      SELECT sort_order
      FROM chore_templates
      WHERE chore_templates.id = occurrence.template_id
    );

CREATE INDEX chore_templates_household_order_idx
  ON chore_templates(household_id, archived_at, sort_order, id);

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (18, 'chore_windows_and_order', '2026-08-10T11:00:00.000Z');
