PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

DROP INDEX pocket_money_payments_household_week_idx;

CREATE TABLE pocket_money_payments_next (
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
  note TEXT CHECK (note IS NULL OR length(note) BETWEEN 1 AND 240),
  paid_at TEXT NOT NULL,
  paid_by_actor_id TEXT NOT NULL,
  source_channel TEXT NOT NULL CHECK (source_channel IN ('companion', 'system'))
) STRICT;

INSERT INTO pocket_money_payments_next
  (id, household_id, member_id, week_start, week_end, scheduled_count, completed_count,
   completion_percentage, amount_cents, note, paid_at, paid_by_actor_id, source_channel)
SELECT id, household_id, member_id, week_start, week_end, scheduled_count, completed_count,
       completion_percentage, amount_cents, NULL, paid_at, paid_by_actor_id, source_channel
FROM pocket_money_payments;

DROP TABLE pocket_money_payments;
ALTER TABLE pocket_money_payments_next RENAME TO pocket_money_payments;

CREATE INDEX pocket_money_payments_household_week_idx
  ON pocket_money_payments(household_id, week_start DESC, member_id, paid_at DESC);

CREATE TABLE pocket_money_payment_voids (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL UNIQUE REFERENCES pocket_money_payments(id),
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 3 AND 240),
  voided_at TEXT NOT NULL,
  voided_by_actor_id TEXT NOT NULL,
  source_channel TEXT NOT NULL CHECK (source_channel = 'companion')
) STRICT;

CREATE INDEX pocket_money_payment_voids_payment_idx
  ON pocket_money_payment_voids(payment_id);

INSERT INTO schema_migrations(version, name, applied_at)
VALUES (14, 'pocket_money_payment_history', '2026-08-09T08:00:00.000Z');
