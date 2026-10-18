BEGIN IMMEDIATE;
CREATE TABLE household_modules_v33 (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL CHECK (module_id IN ('calendar','weather','reminders','chores','lists','meals','home','photos','games','notices','dailyVerse','nba')),
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id,module_id)
);
INSERT INTO household_modules_v33 SELECT * FROM household_modules;
DROP TABLE household_modules;
ALTER TABLE household_modules_v33 RENAME TO household_modules;
CREATE TABLE nba_settings (
  household_id TEXT PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
  settings_json TEXT NOT NULL
);
CREATE TABLE nba_settings_receipts (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  actor_scope TEXT NOT NULL, request_id TEXT NOT NULL, input_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  PRIMARY KEY (household_id,actor_scope,request_id)
);
INSERT INTO schema_migrations(version,name,applied_at) VALUES (33,'nba_module',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
COMMIT;
