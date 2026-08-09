ALTER TABLE chore_occurrences ADD COLUMN description_snapshot TEXT;
ALTER TABLE chore_occurrences ADD COLUMN due_time_snapshot TEXT;

UPDATE chore_occurrences
SET description_snapshot = (
      SELECT description FROM chore_templates WHERE chore_templates.id = chore_occurrences.template_id
    ),
    due_time_snapshot = (
      SELECT due_time FROM chore_templates WHERE chore_templates.id = chore_occurrences.template_id
    );

CREATE INDEX audit_events_target_history_idx
  ON audit_events(household_id, target_type, target_id, occurred_at DESC);

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (17, 'chore_occurrence_management', '2026-08-09T15:30:00.000Z');
