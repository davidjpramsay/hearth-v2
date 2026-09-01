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
  const admin = new SqliteAdminRepository(database);
  const chores = new SqliteHearthRepository(database);
  const planning = new SqlitePlanningRepository(database);
  return { admin, database, chores, planning };
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

  it('manages saved meals and replay-safe whole-week planning without losing history', async () => {
    const { database, planning } = await repositories();
    const saved = await planning.createSavedMeal(
      DEMO_HOUSEHOLD_ID,
      {
        requestId: 'request_save_meal',
        name: 'Maya’s noodle bowls',
        description: 'Fast Thursday dinner',
        preparationMinutes: 25,
        favourite: true,
      },
      adult,
    );
    await expect(
      planning.createSavedMeal(
        DEMO_HOUSEHOLD_ID,
        {
          requestId: 'request_save_meal_case_duplicate',
          name: '  MAYA’S NOODLE BOWLS ',
          description: null,
          preparationMinutes: null,
          favourite: false,
        },
        adult,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' } satisfies Partial<RepositoryError>);
    const updated = await planning.updateSavedMeal(
      DEMO_HOUSEHOLD_ID,
      saved.savedMeal.id,
      {
        requestId: 'request_update_saved_meal',
        name: 'Maya’s sesame noodle bowls',
        description: 'Fast Thursday dinner',
        preparationMinutes: 20,
        favourite: true,
      },
      adult,
    );
    const archived = await planning.archiveSavedMeal(
      DEMO_HOUSEHOLD_ID,
      saved.savedMeal.id,
      'request_archive_saved_meal',
      adult,
    );
    const archiveReplay = await planning.archiveSavedMeal(
      DEMO_HOUSEHOLD_ID,
      saved.savedMeal.id,
      'request_archive_saved_meal',
      adult,
    );
    const archivedLibrary = await planning.getSavedMealLibrary(DEMO_HOUSEHOLD_ID, adult);
    await planning.restoreSavedMeal(
      DEMO_HOUSEHOLD_ID,
      saved.savedMeal.id,
      'request_restore_saved_meal',
      adult,
    );
    const week = await planning.updateMealPlanWeek(
      DEMO_HOUSEHOLD_ID,
      {
        requestId: 'request_plan_week',
        startDate: '2026-08-03',
        entries: [
          {
            localDate: '2026-08-03',
            slot: 'dinner',
            mealName: updated.savedMeal.name,
            savedMealId: updated.savedMeal.id,
            note: 'Prep at 5:45',
          },
          {
            localDate: '2026-08-04',
            slot: 'dinner',
            mealName: 'Leftovers',
            savedMealId: null,
            note: null,
          },
        ],
      },
      adult,
    );
    const weekReplay = await planning.updateMealPlanWeek(
      DEMO_HOUSEHOLD_ID,
      {
        requestId: 'request_plan_week',
        startDate: '2026-08-03',
        entries: [
          {
            localDate: '2026-08-03',
            slot: 'dinner',
            mealName: updated.savedMeal.name,
            savedMealId: updated.savedMeal.id,
            note: 'Prep at 5:45',
          },
          {
            localDate: '2026-08-04',
            slot: 'dinner',
            mealName: 'Leftovers',
            savedMealId: null,
            note: null,
          },
        ],
      },
      adult,
    );
    const copied = await planning.copyMealPlanWeek(
      DEMO_HOUSEHOLD_ID,
      {
        requestId: 'request_copy_week',
        sourceStartDate: '2026-08-03',
        targetStartDate: '2026-08-10',
        replaceExisting: false,
      },
      adult,
    );
    await expect(
      planning.copyMealPlanWeek(
        DEMO_HOUSEHOLD_ID,
        {
          requestId: 'request_copy_week_requires_confirmation',
          sourceStartDate: '2026-08-03',
          targetStartDate: '2026-08-10',
          replaceExisting: false,
        },
        adult,
      ),
    ).rejects.toMatchObject({
      code: 'CONFIRMATION_REQUIRED',
    } satisfies Partial<RepositoryError>);
    const cleared = await planning.clearMealPlanWeek(
      DEMO_HOUSEHOLD_ID,
      { requestId: 'request_clear_week', startDate: '2026-08-03' },
      adult,
    );
    const restarted = new SqlitePlanningRepository(database, { seedDemo: false });
    const plan = await restarted.getMealPlan(DEMO_HOUSEHOLD_ID, '2026-08-03');
    const copiedPlan = await restarted.getMealPlan(DEMO_HOUSEHOLD_ID, '2026-08-10');

    expect(updated.savedMeal).toMatchObject({
      name: 'Maya’s sesame noodle bowls',
      preparationMinutes: 20,
    });
    expect(archived.savedMeal.archivedAt).not.toBeNull();
    expect(archiveReplay.replayed).toBe(true);
    expect(archivedLibrary.archivedMeals).toContainEqual(
      expect.objectContaining({ id: saved.savedMeal.id }),
    );
    expect(week.plan.days[0]?.entries[0]).toMatchObject({
      mealName: 'Maya’s sesame noodle bowls',
    });
    expect(weekReplay).toMatchObject({ replayed: true, plan: { startDate: '2026-08-03' } });
    expect(copied.plan.days[0]?.entries[0]).toMatchObject({ localDate: '2026-08-10' });
    expect(cleared.plan.days.every((day) => day.entries.length === 0)).toBe(true);
    expect(plan.days.every((day) => day.entries.length === 0)).toBe(true);
    expect(copiedPlan.days[1]?.entries[0]).toMatchObject({ mealName: 'Leftovers' });
    expect(plan.savedMeals.some((meal) => meal.id === saved.savedMeal.id)).toBe(true);
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM audit_events WHERE action_type LIKE 'meal.%' OR action_type LIKE 'saved-meal.%'",
        )
        .get(),
    ).toEqual({ count: 7 });
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
        assigneeIds: ['member_ezra'],
        routineLabel: 'Morning',
        availableFromTime: null,
        dueTime: '07:15',
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

  it('expands a multi-assignee template into one independently completable chore per person', async () => {
    const { admin, chores, database, planning } = await repositories();
    const alex = await admin.createMember(DEMO_HOUSEHOLD_ID, adult.id, {
      requestId: 'request_add_alex_for_shared_chore',
      displayName: 'Alex',
      role: 'child',
      color: '#7a5b8f',
      administrator: false,
    });
    const created = await planning.createChoreTemplate(
      DEMO_HOUSEHOLD_ID,
      {
        requestId: 'request_create_shared_sports_gear',
        title: 'Put sports gear away',
        description: 'Each person puts away their own gear.',
        assigneeIds: ['member_ezra', alex.id],
        routineLabel: 'After school',
        availableFromTime: '15:45',
        dueTime: '16:15',
        repeat: 'daily',
        repeatDays: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
        activeFrom: '2026-08-04',
      },
      adult,
    );

    expect(created.template.assignees.map((member) => member.displayName)).toEqual([
      'Ezra',
      'Alex',
    ]);
    expect(created.template).toMatchObject({
      availableFromTime: '15:45',
      dueTime: '16:15',
    });
    expect(
      database
        .prepare(
          'SELECT member_id FROM chore_template_assignees WHERE template_id = ? ORDER BY member_id',
        )
        .all(created.template.id),
    ).toHaveLength(2);
    const schedules = await planning.getChoreTemplates(DEMO_HOUSEHOLD_ID, adult);
    expect(
      schedules.templates.filter((template) => template.id === created.template.id),
    ).toHaveLength(1);

    const day = await chores.getChores(DEMO_HOUSEHOLD_ID, '2026-08-04');
    const occurrences = day.groups
      .flatMap((group) => group.occurrences)
      .filter((occurrence) => occurrence.title === 'Put sports gear away');
    expect(occurrences.map((occurrence) => occurrence.assignee.displayName).sort()).toEqual([
      'Alex',
      'Ezra',
    ]);
    expect(new Set(occurrences.map((occurrence) => occurrence.id))).toHaveProperty('size', 2);
    expect(occurrences[0]).toMatchObject({
      availableFromTime: '15:45',
      dueTime: '16:15',
      sortOrder: created.template.sortOrder,
    });

    const ezraOccurrence = occurrences.find(
      (occurrence) => occurrence.assignee.id === 'member_ezra',
    );
    expect(ezraOccurrence).toBeDefined();
    await chores.complete(
      DEMO_HOUSEHOLD_ID,
      ezraOccurrence!.id,
      'request_complete_shared_sports_gear_ezra',
      adult,
    );
    const afterCompletion = await chores.getChores(DEMO_HOUSEHOLD_ID, '2026-08-04');
    const sharedStates = afterCompletion.groups
      .flatMap((group) => group.occurrences)
      .filter((occurrence) => occurrence.title === 'Put sports gear away')
      .map((occurrence) => [occurrence.assignee.displayName, occurrence.state]);
    expect(sharedStates).toContainEqual(['Ezra', 'completed']);
    expect(sharedStates).toContainEqual(['Alex', 'pending']);

    const updated = await planning.updateChoreTemplate(
      DEMO_HOUSEHOLD_ID,
      created.template.id,
      {
        requestId: 'request_update_shared_sports_gear',
        title: 'Put sports gear away',
        description: 'Each person puts away their own gear.',
        assigneeIds: [alex.id],
        routineLabel: 'After school',
        availableFromTime: '15:45',
        dueTime: '16:15',
        repeat: 'daily',
        repeatDays: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
        activeFrom: '2026-08-04',
      },
      adult,
    );
    expect(updated.template.assignees.map((member) => member.displayName)).toEqual(['Alex']);
    const preservedDay = await chores.getChores(DEMO_HOUSEHOLD_ID, '2026-08-04');
    expect(
      preservedDay.groups
        .flatMap((group) => group.occurrences)
        .filter((occurrence) => occurrence.title === 'Put sports gear away'),
    ).toHaveLength(2);
    const nextDay = await chores.getChores(DEMO_HOUSEHOLD_ID, '2026-08-05');
    expect(
      nextDay.groups
        .flatMap((group) => group.occurrences)
        .filter((occurrence) => occurrence.title === 'Put sports gear away')
        .map((occurrence) => occurrence.assignee.displayName),
    ).toEqual(['Alex']);
  });

  it('reorders future chore occurrences without changing an already generated day', async () => {
    const { chores, database, planning } = await repositories();
    const original = await planning.getChoreTemplates(DEMO_HOUSEHOLD_ID, adult);
    const active = original.templates.filter((template) => !template.archived);
    const dishes = active.find((template) => template.id === 'template_dishes');
    expect(dishes).toBeDefined();
    const before = await chores.getChores(DEMO_HOUSEHOLD_ID, '2026-08-03');
    const previousEzraOrder = before.groups
      .find((group) => group.member.id === 'member_ezra')!
      .occurrences.map((occurrence) => occurrence.title);
    const orderedTemplateIds = [
      dishes!.id,
      ...active.filter((template) => template.id !== dishes!.id).map((template) => template.id),
    ];

    const reordered = await planning.reorderChoreTemplates(
      DEMO_HOUSEHOLD_ID,
      { requestId: 'request_reorder_chores', orderedTemplateIds },
      adult,
    );
    const replay = await planning.reorderChoreTemplates(
      DEMO_HOUSEHOLD_ID,
      { requestId: 'request_reorder_chores', orderedTemplateIds },
      adult,
    );
    expect(reordered).toMatchObject({
      replayed: false,
      audit: { action: 'chore-template.reorder' },
    });
    expect(reordered.list.templates.filter((template) => !template.archived)[0]?.id).toBe(
      dishes!.id,
    );
    expect(replay.replayed).toBe(true);
    await expect(
      planning.reorderChoreTemplates(
        DEMO_HOUSEHOLD_ID,
        { requestId: 'request_invalid_chore_order', orderedTemplateIds: [dishes!.id] },
        adult,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' } satisfies Partial<RepositoryError>);

    const preserved = await chores.getChores(DEMO_HOUSEHOLD_ID, '2026-08-03');
    expect(
      preserved.groups
        .find((group) => group.member.id === 'member_ezra')!
        .occurrences.map((occurrence) => occurrence.title),
    ).toEqual(previousEzraOrder);
    const future = await chores.getChores(DEMO_HOUSEHOLD_ID, '2026-08-04');
    expect(
      future.groups.find((group) => group.member.id === 'member_ezra')!.occurrences[0],
    ).toMatchObject({ title: 'Dishwasher', sortOrder: 0 });
    expect(
      database
        .prepare(
          `SELECT sort_order_snapshot FROM chore_occurrences
           WHERE id = 'occurrence_dishes'`,
        )
        .get(),
    ).toEqual({ sort_order_snapshot: 2 });
  });

  it('schedules a one-off chore and archives or restores it without rewriting generated history', async () => {
    const { chores, planning } = await repositories();
    const created = await planning.createChoreTemplate(
      DEMO_HOUSEHOLD_ID,
      {
        requestId: 'request_create_one_off_bins',
        title: 'Bring bins in',
        description: 'After the truck has passed',
        assigneeIds: ['member_ezra'],
        routineLabel: 'Anytime',
        availableFromTime: null,
        dueTime: '16:30',
        repeat: 'once',
        repeatDays: [],
        activeFrom: '2026-08-04',
      },
      adult,
    );
    const createReplay = await planning.createChoreTemplate(
      DEMO_HOUSEHOLD_ID,
      {
        requestId: 'request_create_one_off_bins',
        title: 'Bring bins in',
        description: 'After the truck has passed',
        assigneeIds: ['member_ezra'],
        routineLabel: 'Anytime',
        availableFromTime: null,
        dueTime: '16:30',
        repeat: 'once',
        repeatDays: [],
        activeFrom: '2026-08-04',
      },
      adult,
    );
    expect(created.template).toMatchObject({
      repeat: 'once',
      repeatDays: [],
      activeFrom: '2026-08-04',
      activeUntil: '2026-08-04',
      archived: false,
    });
    expect(createReplay).toMatchObject({ replayed: true, template: { id: created.template.id } });

    const firstDay = await chores.getChores(DEMO_HOUSEHOLD_ID, '2026-08-04');
    expect(
      firstDay.groups
        .flatMap((group) => group.occurrences)
        .find((occurrence) => occurrence.title === 'Bring bins in'),
    ).toMatchObject({ localDate: '2026-08-04', state: 'pending' });

    const archived = await planning.archiveChoreTemplate(
      DEMO_HOUSEHOLD_ID,
      created.template.id,
      'request_archive_one_off_bins',
      adult,
    );
    const archiveReplay = await planning.archiveChoreTemplate(
      DEMO_HOUSEHOLD_ID,
      created.template.id,
      'request_archive_one_off_bins',
      adult,
    );
    expect(archived).toMatchObject({ template: { archived: true }, replayed: false });
    expect(archiveReplay).toMatchObject({ template: { archived: true }, replayed: true });

    const preserved = await chores.getChores(DEMO_HOUSEHOLD_ID, '2026-08-04');
    expect(
      preserved.groups
        .flatMap((group) => group.occurrences)
        .some((occurrence) => occurrence.title === 'Bring bins in'),
    ).toBe(true);

    const restored = await planning.restoreChoreTemplate(
      DEMO_HOUSEHOLD_ID,
      created.template.id,
      { requestId: 'request_restore_one_off_bins', resumeFrom: '2026-08-05' },
      adult,
    );
    const restoreReplay = await planning.restoreChoreTemplate(
      DEMO_HOUSEHOLD_ID,
      created.template.id,
      { requestId: 'request_restore_one_off_bins', resumeFrom: '2026-08-05' },
      adult,
    );
    expect(restored).toMatchObject({
      template: { archived: false, activeFrom: '2026-08-05', activeUntil: '2026-08-05' },
      replayed: false,
    });
    expect(restoreReplay).toMatchObject({ replayed: true });
    const resumedDay = await chores.getChores(DEMO_HOUSEHOLD_ID, '2026-08-05');
    expect(
      resumedDay.groups
        .flatMap((group) => group.occurrences)
        .some((occurrence) => occurrence.title === 'Bring bins in'),
    ).toBe(true);
  });

  it('withdraws unfinished chores due today when their schedule is archived', async () => {
    const { chores, database, planning } = await repositories();
    const created = await planning.createChoreTemplate(
      DEMO_HOUSEHOLD_ID,
      {
        requestId: 'request_create_shared_archive_today',
        title: 'Pack sports bags',
        description: null,
        assigneeIds: ['member_ezra', 'member_maya'],
        routineLabel: 'Morning',
        availableFromTime: null,
        dueTime: null,
        repeat: 'daily',
        repeatDays: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'],
        activeFrom: '2026-08-03',
      },
      adult,
    );
    const before = await chores.getChores(DEMO_HOUSEHOLD_ID, '2026-08-03');
    const occurrences = before.groups
      .flatMap((group) => group.occurrences)
      .filter((occurrence) => occurrence.title === 'Pack sports bags');
    expect(occurrences).toHaveLength(2);

    await chores.complete(
      DEMO_HOUSEHOLD_ID,
      occurrences[0]!.id,
      'request_complete_shared_archive_today',
      adult,
    );
    await planning.archiveChoreTemplate(
      DEMO_HOUSEHOLD_ID,
      created.template.id,
      'request_archive_shared_today',
      adult,
    );

    const archivedDay = await chores.getChores(DEMO_HOUSEHOLD_ID, '2026-08-03');
    expect(
      archivedDay.groups
        .flatMap((group) => group.occurrences)
        .filter((occurrence) => occurrence.title === 'Pack sports bags'),
    ).toMatchObject([{ state: 'completed' }]);
    expect(
      (await chores.getToday(DEMO_HOUSEHOLD_ID, '2026-08-03')).chores.filter(
        (occurrence) => occurrence.title === 'Pack sports bags',
      ),
    ).toMatchObject([{ state: 'completed' }]);
    expect(
      database
        .prepare(
          `SELECT state FROM chore_occurrences
           WHERE household_id = ? AND template_id = ? AND scheduled_local_date = ?
           ORDER BY state`,
        )
        .all(DEMO_HOUSEHOLD_ID, created.template.id, '2026-08-03'),
    ).toEqual([{ state: 'cancelled' }, { state: 'completed' }]);

    await planning.restoreChoreTemplate(
      DEMO_HOUSEHOLD_ID,
      created.template.id,
      { requestId: 'request_restore_shared_today', resumeFrom: '2026-08-03' },
      adult,
    );
    const restoredDay = await chores.getChores(DEMO_HOUSEHOLD_ID, '2026-08-03');
    expect(
      restoredDay.groups
        .flatMap((group) => group.occurrences)
        .filter((occurrence) => occurrence.title === 'Pack sports bags')
        .map((occurrence) => occurrence.state)
        .sort(),
    ).toEqual(['completed', 'pending']);
  });
});
