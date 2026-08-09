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

  it('manages lists and items with replay-safe archive, restore, ordering and clear commands', async () => {
    const { database, planning } = await repositories();
    const created = await planning.createList(
      DEMO_HOUSEHOLD_ID,
      {
        requestId: 'request_list_create_camp',
        name: 'School camp',
        type: 'packing',
        color: '#6d5b8f',
      },
      adult,
    );
    const listId = created.audit.targetId;
    const replay = await planning.createList(
      DEMO_HOUSEHOLD_ID,
      {
        requestId: 'request_list_create_camp',
        name: 'School camp',
        type: 'packing',
        color: '#6d5b8f',
      },
      adult,
    );
    expect(replay).toMatchObject({ replayed: true, audit: { targetId: listId } });

    const first = await planning.addListItem(
      DEMO_HOUSEHOLD_ID,
      listId,
      { requestId: 'request_list_add_sleeping_bag', text: 'Sleeping bag', quantity: '1' },
      adult,
    );
    const second = await planning.addListItem(
      DEMO_HOUSEHOLD_ID,
      listId,
      { requestId: 'request_list_add_socks', text: 'Socks', quantity: '4 pairs' },
      adult,
    );
    await planning.updateListItem(
      DEMO_HOUSEHOLD_ID,
      first.item.id,
      { requestId: 'request_list_update_sleeping_bag', text: 'Warm sleeping bag', quantity: '1' },
      adult,
    );
    await planning.reorderListItems(
      DEMO_HOUSEHOLD_ID,
      listId,
      {
        requestId: 'request_list_reorder_items',
        orderedItemIds: [second.item.id, first.item.id],
      },
      adult,
    );
    await planning.completeListItem(
      DEMO_HOUSEHOLD_ID,
      second.item.id,
      'request_list_complete_socks',
      adult,
    );
    const cleared = await planning.clearCheckedListItems(
      DEMO_HOUSEHOLD_ID,
      listId,
      'request_list_clear_checked',
      adult,
    );
    expect(cleared.settings.activeLists.find((list) => list.id === listId)?.items).toEqual([
      expect.objectContaining({ text: 'Warm sleeping bag', quantity: '1' }),
    ]);
    const removable = await planning.addListItem(
      DEMO_HOUSEHOLD_ID,
      listId,
      { requestId: 'request_list_add_torch', text: 'Torch', quantity: null },
      adult,
    );
    const removed = await planning.archiveListItem(
      DEMO_HOUSEHOLD_ID,
      removable.item.id,
      'request_list_remove_torch',
      adult,
    );
    expect(
      removed.settings.activeLists
        .find((list) => list.id === listId)
        ?.items.some((item) => item.id === removable.item.id),
    ).toBe(false);

    const current = await planning.getListSettings(DEMO_HOUSEHOLD_ID, adult);
    const reorderedIds = [
      listId,
      ...current.activeLists.map((list) => list.id).filter((id) => id !== listId),
    ];
    await planning.reorderLists(
      DEMO_HOUSEHOLD_ID,
      { requestId: 'request_list_reorder_lists', orderedListIds: reorderedIds },
      adult,
    );
    await planning.updateList(
      DEMO_HOUSEHOLD_ID,
      listId,
      {
        requestId: 'request_list_update_camp',
        name: 'Year 8 camp',
        type: 'packing',
        color: '#1668b7',
      },
      adult,
    );
    const archived = await planning.archiveList(
      DEMO_HOUSEHOLD_ID,
      listId,
      'request_list_archive_camp',
      adult,
    );
    expect(archived.settings.archivedLists).toContainEqual(
      expect.objectContaining({ id: listId, name: 'Year 8 camp' }),
    );
    const restored = await planning.restoreList(
      DEMO_HOUSEHOLD_ID,
      listId,
      'request_list_restore_camp',
      adult,
    );
    expect(restored.settings.activeLists.at(-1)).toMatchObject({ id: listId, name: 'Year 8 camp' });
    await expect(planning.getListSettings(DEMO_HOUSEHOLD_ID, child)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<RepositoryError>);
    await expect(
      planning.reorderLists(
        DEMO_HOUSEHOLD_ID,
        { requestId: 'request_bad_list_order', orderedListIds: [listId] },
        adult,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' } satisfies Partial<RepositoryError>);
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action_type LIKE 'list.%'")
        .get(),
    ).toEqual({ count: 13 });
  });

  it('keeps the final household list active', async () => {
    const { planning } = await repositories();
    await planning.archiveList(
      DEMO_HOUSEHOLD_ID,
      'list_weekend_away',
      'request_archive_weekend',
      adult,
    );
    await planning.archiveList(
      DEMO_HOUSEHOLD_ID,
      'list_hardware',
      'request_archive_hardware',
      adult,
    );
    await expect(
      planning.archiveList(
        DEMO_HOUSEHOLD_ID,
        'list_groceries',
        'request_archive_final_list',
        adult,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' } satisfies Partial<RepositoryError>);
    expect((await planning.getLists(DEMO_HOUSEHOLD_ID)).lists).toHaveLength(1);
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

  it('does not create legacy star awards when chores are completed or undone', async () => {
    const { database, chores } = await repositories();
    const completion = await chores.complete(
      DEMO_HOUSEHOLD_ID,
      'occurrence_school_bag',
      'request_reward_chore',
      DEMO_TV_ACTOR,
    );
    await chores.undo(
      DEMO_HOUSEHOLD_ID,
      'occurrence_school_bag',
      'request_reward_chore_undo',
      completion.completionId,
      DEMO_TV_ACTOR,
    );
    expect(
      database
        .prepare(
          'SELECT delta, reversal_of_entry_id FROM reward_ledger_entries WHERE related_chore_occurrence_id = ? OR reversal_of_entry_id IS NOT NULL ORDER BY occurred_at',
        )
        .all('occurrence_school_bag'),
    ).toEqual([]);
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
