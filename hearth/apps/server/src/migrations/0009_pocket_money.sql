PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE pocket_money_settings (
  household_id TEXT NOT NULL REFERENCES households(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  weekly_amount_cents INTEGER NOT NULL CHECK (weekly_amount_cents BETWEEN 100 AND 100000),
  currency TEXT NOT NULL CHECK (currency = 'AUD'),
  payday TEXT NOT NULL CHECK (
    payday IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, member_id)
) STRICT;

CREATE TABLE pocket_money_payments (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES households(id),
  member_id TEXT NOT NULL REFERENCES members(id),
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  scheduled_count INTEGER NOT NULL CHECK (scheduled_count >= 0),
  completed_count INTEGER NOT NULL CHECK (
    completed_count >= 0 AND completed_count <= scheduled_count
  ),
  completion_percentage INTEGER NOT NULL CHECK (completion_percentage BETWEEN 0 AND 100),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  paid_at TEXT NOT NULL,
  paid_by_actor_id TEXT NOT NULL,
  source_channel TEXT NOT NULL CHECK (source_channel IN ('companion', 'system')),
  UNIQUE (household_id, member_id, week_start)
) STRICT;

CREATE INDEX pocket_money_payments_household_week_idx
  ON pocket_money_payments(household_id, week_start, member_id);

CREATE TRIGGER pocket_money_settings_child_guard
BEFORE INSERT ON pocket_money_settings
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM members
    WHERE id = NEW.member_id AND household_id = NEW.household_id
      AND role = 'child' AND archived_at IS NULL
  ) THEN RAISE(ABORT, 'pocket money requires an active child') END;
END;

UPDATE members
SET capabilities_json = replace(capabilities_json, '"rewards.view"', '"pocket-money.view"')
WHERE capabilities_json LIKE '%"rewards.view"%';

INSERT INTO pocket_money_settings
  (household_id, member_id, weekly_amount_cents, currency, payday, created_at, updated_at)
SELECT 'household_hearth_demo', 'member_ezra', 1200, 'AUD', 'friday',
       '2026-08-03T07:42:00+08:00', '2026-08-03T07:42:00+08:00'
WHERE EXISTS (
  SELECT 1 FROM members
  WHERE id = 'member_ezra' AND household_id = 'household_hearth_demo' AND role = 'child'
);

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (9, 'pocket_money', '2026-08-06T00:00:00.000Z');
