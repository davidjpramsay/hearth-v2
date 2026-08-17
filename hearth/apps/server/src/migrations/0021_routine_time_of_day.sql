PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

UPDATE chore_templates
SET routine_label = CASE
  WHEN lower(trim(routine_label)) LIKE '%morning%'
    OR lower(trim(routine_label)) LIKE '%before school%'
    THEN 'Morning'
  WHEN lower(trim(routine_label)) LIKE '%after school%'
    OR lower(trim(routine_label)) LIKE '%afternoon%'
    THEN 'After school'
  WHEN lower(trim(routine_label)) LIKE '%bed%'
    THEN 'Bedtime'
  WHEN lower(trim(routine_label)) LIKE '%evening%'
    OR lower(trim(routine_label)) LIKE '%dinner%'
    THEN 'Evening'
  ELSE 'Anytime'
END;

UPDATE chore_occurrences
SET routine_label_snapshot = CASE
  WHEN lower(trim(routine_label_snapshot)) LIKE '%morning%'
    OR lower(trim(routine_label_snapshot)) LIKE '%before school%'
    THEN 'Morning'
  WHEN lower(trim(routine_label_snapshot)) LIKE '%after school%'
    OR lower(trim(routine_label_snapshot)) LIKE '%afternoon%'
    THEN 'After school'
  WHEN lower(trim(routine_label_snapshot)) LIKE '%bed%'
    THEN 'Bedtime'
  WHEN lower(trim(routine_label_snapshot)) LIKE '%evening%'
    OR lower(trim(routine_label_snapshot)) LIKE '%dinner%'
    THEN 'Evening'
  ELSE 'Anytime'
END;

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (21, 'routine_time_of_day', '2026-08-17T00:00:00.000Z');
