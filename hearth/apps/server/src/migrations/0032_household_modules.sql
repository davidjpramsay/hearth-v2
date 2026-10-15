BEGIN IMMEDIATE;

CREATE TABLE household_modules (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL CHECK(module_id IN ('calendar','weather','reminders','chores','lists','meals','home','photos','games','notices','dailyVerse')),
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(household_id,module_id)
);

CREATE TABLE household_module_receipts (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  actor_scope TEXT NOT NULL,
  request_id TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(household_id,actor_scope,request_id)
);

INSERT INTO schema_migrations (version,name,applied_at)
VALUES (32,'household_modules','2026-10-15T00:00:00.000Z');
COMMIT;
