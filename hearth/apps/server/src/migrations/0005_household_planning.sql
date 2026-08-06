PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE household_lists (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  list_type TEXT NOT NULL CHECK (list_type IN ('grocery', 'packing', 'shopping', 'wish', 'custom')),
  colour TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (household_id, name)
) STRICT;

CREATE TABLE list_items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES household_lists(id),
  text TEXT NOT NULL,
  normalised_text TEXT NOT NULL,
  quantity TEXT,
  position INTEGER NOT NULL,
  checked_at TEXT,
  checked_by_actor_id TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX household_lists_household_idx
  ON household_lists(household_id, archived_at, sort_order);
CREATE INDEX list_items_list_idx
  ON list_items(list_id, archived_at, checked_at, position);

CREATE TABLE saved_meals (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  description TEXT,
  favourite INTEGER NOT NULL CHECK (favourite IN (0, 1)),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (household_id, name)
) STRICT;

CREATE TABLE meal_plan_entries (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  local_date TEXT NOT NULL,
  meal_slot TEXT NOT NULL CHECK (meal_slot IN ('breakfast', 'lunch', 'dinner')),
  saved_meal_id TEXT REFERENCES saved_meals(id),
  meal_name_snapshot TEXT NOT NULL,
  note TEXT,
  planned_by_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (household_id, local_date, meal_slot)
) STRICT;

CREATE INDEX meal_plan_household_date_idx
  ON meal_plan_entries(household_id, local_date, meal_slot);

CREATE TABLE reward_definitions (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  name TEXT NOT NULL,
  description TEXT,
  cost INTEGER NOT NULL CHECK (cost > 0),
  approval_required INTEGER NOT NULL CHECK (approval_required IN (0, 1)),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (household_id, name)
) STRICT;

CREATE TABLE reward_ledger_entries (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  delta INTEGER NOT NULL CHECK (delta <> 0),
  reason TEXT NOT NULL,
  reward_id TEXT REFERENCES reward_definitions(id),
  related_chore_occurrence_id TEXT REFERENCES chore_occurrences(id),
  reversal_of_entry_id TEXT REFERENCES reward_ledger_entries(id),
  actor_id TEXT NOT NULL,
  source_channel TEXT NOT NULL CHECK (source_channel IN ('tv', 'companion', 'voice', 'automation', 'system')),
  occurred_at TEXT NOT NULL,
  UNIQUE (reversal_of_entry_id)
) STRICT;

CREATE INDEX reward_ledger_household_member_time_idx
  ON reward_ledger_entries(household_id, member_id, occurred_at);
CREATE UNIQUE INDEX reward_ledger_chore_award_idx
  ON reward_ledger_entries(related_chore_occurrence_id)
  WHERE related_chore_occurrence_id IS NOT NULL AND reversal_of_entry_id IS NULL;

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (5, 'household_planning', '2026-08-03T04:00:00.000Z');
