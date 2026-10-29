BEGIN IMMEDIATE;
-- Preserve the original settings revision, school IDs, text, selections and times exactly.
UPDATE morning_routine_settings
SET configuration_json = json_object(
  'schoolDays', json_object(
    'days', json('["mon","tue","wed","thu","fri"]'),
    'countdownEnabled', json('true'),
    'configuration', json(configuration_json)
  ),
  'weekends', json_object(
    'days', json('["sat","sun"]'),
    'countdownEnabled', json('false'),
    'configuration', json_object(
      'startTime', json_extract(configuration_json, '$.startTime'),
      'endTime', json_extract(configuration_json, '$.endTime'),
      'selectedMemberIds', json(json_extract(configuration_json, '$.selectedMemberIds')),
      'routines', json((SELECT json_group_array(json_object(
        'memberId', json_extract(value, '$.memberId'), 'steps', json('[]')
      )) FROM json_each(configuration_json, '$.routines')))
    )
  )
)
WHERE json_type(configuration_json, '$.schoolDays') IS NULL;
CREATE TABLE morning_routine_progress_v35 (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  profile_id TEXT NOT NULL CHECK (profile_id IN ('schoolDays','weekends')),
  member_id TEXT NOT NULL, step_id TEXT NOT NULL,
  completed INTEGER NOT NULL CHECK (completed IN (0,1)),
  version INTEGER NOT NULL CHECK (version >= 1), updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id,local_date,profile_id,member_id,step_id)
);
INSERT INTO morning_routine_progress_v35
  SELECT household_id,local_date,'schoolDays',member_id,step_id,completed,version,updated_at
  FROM morning_routine_progress;
DROP TABLE morning_routine_progress;
ALTER TABLE morning_routine_progress_v35 RENAME TO morning_routine_progress;
-- Existing actor-scoped receipts/hashes are deliberately untouched for exact retries.
INSERT INTO schema_migrations(version,name,applied_at)
  VALUES (35,'morning_routine_profiles',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
