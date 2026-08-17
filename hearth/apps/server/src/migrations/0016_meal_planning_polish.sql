PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

ALTER TABLE saved_meals
  ADD COLUMN preparation_minutes INTEGER
  CHECK (preparation_minutes IS NULL OR preparation_minutes BETWEEN 1 AND 600);

CREATE INDEX saved_meals_household_active_favourite_idx
  ON saved_meals(household_id, archived_at, favourite DESC, name);

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (16, 'meal_planning_polish', '2026-08-09T12:00:00.000Z');
