import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { SqliteAdminRepository } from './admin-repository.js';
import { openHearthDatabase } from './database.js';
import { DEMO_HOUSEHOLD_ID } from './demo/seed.js';
import { SqlitePlanningRepository } from './planning-repository.js';
import { DEMO_TV_ACTOR, type CommandActor, type RepositoryError } from './repository.js';
import { SqliteHearthRepository } from './sqlite-hearth-repository.js';

const temporaryDirectories: string[] = [];
const openDatabases: InstanceType<typeof Database>[] = [];

afterEach(async () => {
  for (const database of openDatabases.splice(0)) {
    if (database.open) database.close();
  }
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true })),
  );
});

const adult: CommandActor = { id: 'member_maya', type: 'member', source: 'companion' };
const child: CommandActor = { id: 'member_ezra', type: 'member', source: 'companion' };

async function repositories() {
  const directory = await mkdtemp(join(tmpdir(), 'hearth-planning-'));
  temporaryDirectories.push(directory);
  const database = await openHearthDatabase(join(directory, 'hearth.sqlite'));
  openDatabases.push(database);
  new SqliteAdminRepository(database);
  const chores = new SqliteHearthRepository(database);
  const planning = new SqlitePlanningRepository(database);
  return { database, chores, planning };
}

describe('SQLite household planning repository', () => {
  it('adds, checks and undoes a list item idempotently while rejecting a duplicate', async () => {
    const { database, planning } = await repositories();
    const added = await planning.addListItem(
      DEMO_HOUSEHOLD_ID,
      'list_groceries',
      { requestId: 'request_add_apples', text: 'Apples', quantity: null },
      adult,
    );
    const replay = await planning.addListItem(
      DEMO_HOUSEHOLD_ID,
      'list_groceries',
      { requestId: 'request_add_apples', text: 'Apples', quantity: null },
      adult,
    );
    await expect(
      planning.addListItem(
        DEMO_HOUSEHOLD_ID,
        'list_groceries',
        { requestId: 'request_duplicate_apples', text: '  APPLES ', quantity: null },
        child,
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE_ITEM' } satisfies Partial<RepositoryError>);

    const completed = await planning.completeListItem(
      DEMO_HOUSEHOLD_ID,
      added.item.id,
      'request_check_apples',
      DEMO_TV_ACTOR,
    );
    const undone = await planning.undoListItem(
      DEMO_HOUSEHOLD_ID,
      added.item.id,
      'request_uncheck_apples',
      DEMO_TV_ACTOR,
    );

    expect(replay).toMatchObject({ replayed: true, item: { id: added.item.id } });
    expect(completed.item.checked).toBe(true);
    expect(undone.item.checked).toBe(false);
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action_type LIKE 'list.%'")
        .get(),
    ).toEqual({ count: 3 });
  });

  it('persists meal planning and keeps saved meals separately reusable', async () => {
    const { database, planning } = await repositories();
    const saved = await planning.createSavedMeal(
      DEMO_HOUSEHOLD_ID,
      {
        requestId: 'request_save_meal',
        name: 'Maya’s noodle bowls',
        description: 'Fast Thursday dinner',
      },
      adult,
    );
    const planned = await planning.upsertMealPlan(
      DEMO_HOUSEHOLD_ID,
      {
        requestId: 'request_plan_meal',
        localDate: '2026-08-06',
        slot: 'dinner',
        mealName: saved.savedMeal.name,
        savedMealId: saved.savedMeal.id,
        note: 'Prep at 5:45',
      },
      adult,
    );
    const restarted = new SqlitePlanningRepository(database);
    const plan = await restarted.getMealPlan(DEMO_HOUSEHOLD_ID, '2026-08-03');
    expect(planned.entry.mealName).toBe('Maya’s noodle bowls');
    expect(plan.savedMeals.some((meal) => meal.id === saved.savedMeal.id)).toBe(true);
    expect(plan.days[3]?.entries[0]).toMatchObject({ mealName: 'Maya’s noodle bowls' });
  });

  it('keeps reward history through adjustment and reversal and ties chore points to undo', async () => {
    const { database, chores, planning } = await repositories();
    const adjusted = await planning.adjustReward(
      DEMO_HOUSEHOLD_ID,
      {
        requestId: 'request_reward_adjust',
        memberId: 'member_ezra',
        delta: 4,
        reason: 'Kind help',
        rewardId: null,
      },
      adult,
    );
    const replayedAdjustment = await planning.adjustReward(
      DEMO_HOUSEHOLD_ID,
      {
        requestId: 'request_reward_adjust',
        memberId: 'member_ezra',
        delta: 4,
        reason: 'Kind help',
        rewardId: null,
      },
      adult,
    );
    const reversed = await planning.reverseReward(
      DEMO_HOUSEHOLD_ID,
      adjusted.entry.id,
      'request_reward_reverse',
      adult,
    );
    expect(reversed.entry).toMatchObject({ delta: -4, reversalOfEntryId: adjusted.entry.id });
    expect(replayedAdjustment).toMatchObject({ replayed: true, entry: { id: adjusted.entry.id } });

    const before = await planning.getRewards(DEMO_HOUSEHOLD_ID);
    const beforeEzra = before.balances.find(
      (balance) => balance.member.id === 'member_ezra',
    )?.balance;
    const completion = await chores.complete(
      DEMO_HOUSEHOLD_ID,
      'occurrence_school_bag',
      'request_reward_chore',
      DEMO_TV_ACTOR,
    );
    const afterComplete = await planning.getRewards(DEMO_HOUSEHOLD_ID);
    expect(
      afterComplete.balances.find((balance) => balance.member.id === 'member_ezra')?.balance,
    ).toBe((beforeEzra ?? 0) + 2);
    await chores.undo(
      DEMO_HOUSEHOLD_ID,
      'occurrence_school_bag',
      'request_reward_chore_undo',
      completion.completionId,
      DEMO_TV_ACTOR,
    );
    const afterUndo = await planning.getRewards(DEMO_HOUSEHOLD_ID);
    expect(afterUndo.balances.find((balance) => balance.member.id === 'member_ezra')?.balance).toBe(
      beforeEzra,
    );
    expect(
      database
        .prepare(
          'SELECT delta, reversal_of_entry_id FROM reward_ledger_entries WHERE related_chore_occurrence_id = ? OR reversal_of_entry_id IS NOT NULL ORDER BY occurred_at',
        )
        .all('occurrence_school_bag'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ delta: 2 }),
        expect.objectContaining({ delta: -2 }),
      ]),
    );
  });

  it('edits future recurring chores without rewriting generated history and rejects child admin', async () => {
    const { chores, planning } = await repositories();
    await chores.getChores(DEMO_HOUSEHOLD_ID, '2026-08-03');
    const current = await planning.getChoreTemplates(DEMO_HOUSEHOLD_ID, adult);
    const pepper = current.templates.find((template) => template.id === 'template_feed_pepper');
    expect(pepper).toBeDefined();
    await planning.updateChoreTemplate(
      DEMO_HOUSEHOLD_ID,
      'template_feed_pepper',
      {
        requestId: 'request_update_pepper',
        title: 'Give Pepper breakfast',
        description: null,
        assigneeId: 'member_ezra',
        routineLabel: 'Morning',
        repeat: 'daily',
        repeatDays: ['MO', 'TU', 'WE', 'TH', 'FR'],
        pointsValue: 3,
        activeFrom: '2026-08-03',
      },
      adult,
    );
    const oldDay = await chores.getChores(DEMO_HOUSEHOLD_ID, '2026-08-03');
    const nextDay = await chores.getChores(DEMO_HOUSEHOLD_ID, '2026-08-04');
    expect(
      oldDay.groups
        .flatMap((group) => group.occurrences)
        .some((item) => item.title === 'Feed Pepper'),
    ).toBe(true);
    expect(
      nextDay.groups
        .flatMap((group) => group.occurrences)
        .some((item) => item.title === 'Give Pepper breakfast'),
    ).toBe(true);
    await expect(planning.getChoreTemplates(DEMO_HOUSEHOLD_ID, child)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<RepositoryError>);
  });
});
