import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import {
  addLocalDays,
  assertNoActiveListDuplicate,
  choreRecurrenceRule,
  choreRepeatFromRule,
  localDateInTimezone,
  normaliseListItemText,
  PlanningDomainError,
} from '@hearth/core';
import {
  ChoreTemplateCommandResultSchema,
  ChoreTemplateListSchema,
  ChoreTemplateSchema,
  HouseholdListSchema,
  HouseholdListsSchema,
  ListItemCommandResultSchema,
  ListItemSchema,
  MealCommandResultSchema,
  MealPlanEntrySchema,
  MealPlanSchema,
  MemberSchema,
  SavedMealCommandResultSchema,
  SavedMealSchema,
  type AddListItemRequest,
  type AuditSummary,
  type ChoreTemplate,
  type ChoreTemplateCommandResult,
  type ChoreTemplateList,
  type CreateChoreTemplateRequest,
  type CreateSavedMealRequest,
  type DemoScenario,
  type HouseholdList,
  type HouseholdLists,
  type ListItem,
  type ListItemCommandResult,
  type MealCommandResult,
  type MealPlan,
  type Member,
  type SavedMeal,
  type SavedMealCommandResult,
  type UpdateChoreTemplateRequest,
  type UpsertMealPlanRequest,
} from '@hearth/shared';

import { createDemoSeed, DEMO_HOUSEHOLD_ID, DEMO_LOCAL_DATE, DEMO_NOW } from './demo/seed.js';
import { type CommandActor, RepositoryError } from './repository.js';
import { FixedClock, type HearthClock } from './runtime-context.js';

interface AuditedResult {
  audit: AuditSummary;
  replayed: boolean;
}

export interface PlanningRepository {
  getLists(householdId: string): Promise<HouseholdLists>;
  addListItem(
    householdId: string,
    listId: string,
    input: AddListItemRequest,
    actor: CommandActor,
  ): Promise<ListItemCommandResult>;
  completeListItem(
    householdId: string,
    itemId: string,
    requestId: string,
    actor: CommandActor,
  ): Promise<ListItemCommandResult>;
  undoListItem(
    householdId: string,
    itemId: string,
    requestId: string,
    actor: CommandActor,
  ): Promise<ListItemCommandResult>;
  getMealPlan(householdId: string, startDate: string): Promise<MealPlan>;
  upsertMealPlan(
    householdId: string,
    input: UpsertMealPlanRequest,
    actor: CommandActor,
  ): Promise<MealCommandResult>;
  createSavedMeal(
    householdId: string,
    input: CreateSavedMealRequest,
    actor: CommandActor,
  ): Promise<SavedMealCommandResult>;
  getChoreTemplates(householdId: string, actor: CommandActor): Promise<ChoreTemplateList>;
  createChoreTemplate(
    householdId: string,
    input: CreateChoreTemplateRequest,
    actor: CommandActor,
  ): Promise<ChoreTemplateCommandResult>;
  updateChoreTemplate(
    householdId: string,
    templateId: string,
    input: UpdateChoreTemplateRequest,
    actor: CommandActor,
  ): Promise<ChoreTemplateCommandResult>;
  reset(): void;
  setScenario(scenario: DemoScenario): void;
  close(): void;
}

export class InMemoryPlanningRepository implements PlanningRepository {
  private lists = demoLists();
  private savedMeals = demoSavedMeals();
  private mealEntries = demoMealEntries();
  private templates = demoChoreTemplates();
  private readonly receipts = new Map<string, AuditedResult>();
  private sequence = 100;
  private scenario: DemoScenario = 'healthy';

  async getLists(householdId: string): Promise<HouseholdLists> {
    this.assertHousehold(householdId);
    return HouseholdListsSchema.parse({
      householdId,
      lists: this.scenario === 'empty' ? [] : this.lists,
    });
  }

  async addListItem(
    householdId: string,
    listId: string,
    input: AddListItemRequest,
    actor: CommandActor,
  ): Promise<ListItemCommandResult> {
    this.assertHousehold(householdId);
    this.assertListActor(actor, false);
    return this.replayOrRun('list-item-add', input.requestId, ListItemCommandResultSchema, () => {
      const list = this.list(listId);
      assertNoActiveListDuplicate(list.items, input.text);
      const item = ListItemSchema.parse({
        id: this.id('list_item'),
        text: input.text,
        quantity: input.quantity,
        checked: false,
        checkedAt: null,
        checkedByActorId: null,
      });
      list.items.push(item);
      refreshListCounts(list);
      return {
        list,
        item,
        audit: this.audit('list.item.add', item.id, actor),
        replayed: false,
      };
    });
  }

  async completeListItem(
    householdId: string,
    itemId: string,
    requestId: string,
    actor: CommandActor,
  ): Promise<ListItemCommandResult> {
    return this.changeListItem(householdId, itemId, requestId, actor, true);
  }

  async undoListItem(
    householdId: string,
    itemId: string,
    requestId: string,
    actor: CommandActor,
  ): Promise<ListItemCommandResult> {
    return this.changeListItem(householdId, itemId, requestId, actor, false);
  }

  async getMealPlan(householdId: string, startDate: string): Promise<MealPlan> {
    this.assertHousehold(householdId);
    return mealPlan(
      householdId,
      startDate,
      this.scenario === 'empty' ? [] : this.mealEntries,
      this.scenario === 'empty' ? [] : this.savedMeals,
    );
  }

  async upsertMealPlan(
    householdId: string,
    input: UpsertMealPlanRequest,
    actor: CommandActor,
  ): Promise<MealCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun('meal-plan', input.requestId, MealCommandResultSchema, () => {
      const entry = MealPlanEntrySchema.parse({
        id:
          this.mealEntries.find(
            (candidate) => candidate.localDate === input.localDate && candidate.slot === input.slot,
          )?.id ?? this.id('meal_plan'),
        localDate: input.localDate,
        slot: input.slot,
        mealName: input.mealName,
        savedMealId: input.savedMealId,
        note: input.note,
      });
      this.mealEntries = this.mealEntries.filter(
        (candidate) => candidate.localDate !== input.localDate || candidate.slot !== input.slot,
      );
      this.mealEntries.push(entry);
      return {
        entry,
        audit: this.audit('meal.plan', entry.id, actor),
        replayed: false,
      };
    });
  }

  async createSavedMeal(
    householdId: string,
    input: CreateSavedMealRequest,
    actor: CommandActor,
  ): Promise<SavedMealCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun(
      'saved-meal-create',
      input.requestId,
      SavedMealCommandResultSchema,
      () => {
        if (this.savedMeals.some((meal) => sameText(meal.name, input.name))) {
          throw new RepositoryError('CONFLICT', 'That saved meal already exists.');
        }
        const savedMeal = SavedMealSchema.parse({
          id: this.id('saved_meal'),
          name: input.name,
          description: input.description,
          favourite: true,
        });
        this.savedMeals.push(savedMeal);
        return {
          savedMeal,
          audit: this.audit('saved-meal.create', savedMeal.id, actor),
          replayed: false,
        };
      },
    );
  }

  async getChoreTemplates(householdId: string, actor: CommandActor): Promise<ChoreTemplateList> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return ChoreTemplateListSchema.parse({
      householdId,
      templates: this.scenario === 'empty' ? [] : this.templates,
    });
  }

  async createChoreTemplate(
    householdId: string,
    input: CreateChoreTemplateRequest,
    actor: CommandActor,
  ): Promise<ChoreTemplateCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun(
      'chore-template-create',
      input.requestId,
      ChoreTemplateCommandResultSchema,
      () => {
        const template = templateFromInput(this.id('template'), input);
        this.templates.push(template);
        return {
          template,
          audit: this.audit('chore-template.create', template.id, actor),
          replayed: false,
        };
      },
    );
  }

  async updateChoreTemplate(
    householdId: string,
    templateId: string,
    input: UpdateChoreTemplateRequest,
    actor: CommandActor,
  ): Promise<ChoreTemplateCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun(
      'chore-template-update',
      input.requestId,
      ChoreTemplateCommandResultSchema,
      () => {
        const index = this.templates.findIndex((template) => template.id === templateId);
        if (index < 0)
          throw new RepositoryError('NOT_FOUND', 'That recurring chore was not found.');
        const template = templateFromInput(templateId, input);
        this.templates[index] = template;
        return {
          template,
          audit: this.audit('chore-template.update', template.id, actor),
          replayed: false,
        };
      },
    );
  }

  reset(): void {
    this.lists = demoLists();
    this.savedMeals = demoSavedMeals();
    this.mealEntries = demoMealEntries();
    this.templates = demoChoreTemplates();
    this.receipts.clear();
    this.sequence = 100;
    this.scenario = 'healthy';
  }

  setScenario(scenario: DemoScenario): void {
    this.scenario = scenario;
  }

  close(): void {}

  private async changeListItem(
    householdId: string,
    itemId: string,
    requestId: string,
    actor: CommandActor,
    checked: boolean,
  ): Promise<ListItemCommandResult> {
    this.assertHousehold(householdId);
    this.assertListActor(actor, true);
    const command = checked ? 'list-item-complete' : 'list-item-undo';
    return this.replayOrRun(command, requestId, ListItemCommandResultSchema, () => {
      const list = this.lists.find((candidate) =>
        candidate.items.some((item) => item.id === itemId),
      );
      const item = list?.items.find((candidate) => candidate.id === itemId);
      if (list === undefined || item === undefined) {
        throw new RepositoryError('NOT_FOUND', 'That list item was not found.');
      }
      if (item.checked === checked) {
        throw new RepositoryError(
          'CONFLICT',
          checked ? 'That item is already checked.' : 'That item is already waiting.',
        );
      }
      const changed = ListItemSchema.parse({
        ...item,
        checked,
        checkedAt: checked ? new Date().toISOString() : null,
        checkedByActorId: checked ? actor.id : null,
      });
      list.items[list.items.indexOf(item)] = changed;
      refreshListCounts(list);
      return {
        list,
        item: changed,
        audit: this.audit(
          checked ? 'list.item.complete' : 'list.item.undo',
          itemId,
          actor,
          checked ? 'succeeded' : 'reversed',
        ),
        replayed: false,
      };
    });
  }

  private replayOrRun<T extends AuditedResult>(
    command: string,
    requestId: string,
    schema: { parse(value: unknown): T },
    operation: () => T,
  ): T {
    const key = `${command}:${requestId}`;
    const receipt = this.receipts.get(key);
    if (receipt !== undefined) return schema.parse({ ...receipt, replayed: true });
    this.assertScenarioAllowsWrite();
    try {
      const result = schema.parse(operation());
      this.receipts.set(key, structuredClone(result));
      return result;
    } catch (error) {
      if (error instanceof PlanningDomainError) {
        throw new RepositoryError(error.code, error.message);
      }
      throw error;
    }
  }

  private assertScenarioAllowsWrite(): void {
    if (this.scenario === 'permission') {
      throw new RepositoryError('FORBIDDEN', 'Ask an adult to change this.');
    }
    if (this.scenario === 'fail-next') {
      this.scenario = 'healthy';
      throw new RepositoryError('COMMAND_FAILED', 'That change did not save. Try again.', true);
    }
  }

  private list(listId: string): HouseholdList {
    const list = this.lists.find((candidate) => candidate.id === listId);
    if (list === undefined) throw new RepositoryError('NOT_FOUND', 'That list was not found.');
    return list;
  }

  private assertHousehold(householdId: string): void {
    if (householdId !== DEMO_HOUSEHOLD_ID) {
      throw new RepositoryError('NOT_FOUND', 'That household could not be found.');
    }
  }

  private assertAdmin(actor: CommandActor): void {
    if (actor.type !== 'member' || actor.id !== 'member_maya' || actor.source !== 'companion') {
      throw new RepositoryError('FORBIDDEN', 'Only a household administrator can change this.');
    }
  }

  private assertListActor(actor: CommandActor, allowDevice: boolean): void {
    if (actor.type === 'member' && ['member_maya', 'member_ezra'].includes(actor.id)) return;
    if (actor.type === 'service' && actor.id === 'service_home_assistant') return;
    if (allowDevice && actor.type === 'device' && actor.id === 'device_living_room_tv') return;
    throw new RepositoryError('FORBIDDEN', 'You cannot change this list.');
  }

  private audit(
    action: AuditSummary['action'],
    targetId: string,
    actor: CommandActor,
    result: AuditSummary['result'] = 'succeeded',
  ): AuditSummary {
    return {
      id: this.id('audit'),
      actorType: actor.type,
      actorId: actor.id,
      source: actor.source,
      action,
      targetId,
      occurredAt: new Date().toISOString(),
      result,
    };
  }

  private id(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_demo_${this.sequence}`;
  }
}

export class SqlitePlanningRepository implements PlanningRepository {
  private scenario: DemoScenario = 'healthy';
  private readonly demoSeedEnabled: boolean;
  private readonly clock: HearthClock;

  constructor(
    private readonly database: InstanceType<typeof Database>,
    options: { seedDemo?: boolean; clock?: HearthClock } = {},
  ) {
    this.demoSeedEnabled = options.seedDemo ?? true;
    this.clock = options.clock ?? new FixedClock(DEMO_NOW);
    if (this.demoSeedEnabled) this.seedDemo();
  }

  async getLists(householdId: string): Promise<HouseholdLists> {
    this.assertHousehold(householdId);
    const rows = this.database
      .prepare(
        `SELECT * FROM household_lists
         WHERE household_id = ? AND archived_at IS NULL ORDER BY sort_order, id`,
      )
      .all(householdId) as ListRow[];
    return HouseholdListsSchema.parse({
      householdId,
      lists: this.scenario === 'empty' ? [] : rows.map((row) => this.readList(row.id)),
    });
  }

  async addListItem(
    householdId: string,
    listId: string,
    input: AddListItemRequest,
    actor: CommandActor,
  ): Promise<ListItemCommandResult> {
    this.assertHousehold(householdId);
    this.assertListActor(householdId, actor, false);
    return this.execute(
      householdId,
      input.requestId,
      'list-item-add',
      'list_item',
      ListItemCommandResultSchema,
      () => {
        const list = this.readListForHousehold(householdId, listId);
        assertNoActiveListDuplicate(list.items, input.text);
        const now = new Date().toISOString();
        const itemId = id('list_item');
        const position = (
          this.database
            .prepare(
              'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM list_items WHERE list_id = ?',
            )
            .get(listId) as { next: number }
        ).next;
        this.database
          .prepare(
            `INSERT INTO list_items
              (id, list_id, text, normalised_text, quantity, position, checked_at,
               checked_by_actor_id, archived_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)`,
          )
          .run(
            itemId,
            listId,
            input.text,
            normaliseListItemText(input.text),
            input.quantity,
            position,
            now,
            now,
          );
        const item = this.readItem(itemId);
        return {
          list: this.readList(listId),
          item,
          audit: audit('list.item.add', itemId, actor),
          replayed: false,
        };
      },
    );
  }

  async completeListItem(
    householdId: string,
    itemId: string,
    requestId: string,
    actor: CommandActor,
  ): Promise<ListItemCommandResult> {
    return this.changeListItem(householdId, itemId, requestId, actor, true);
  }

  async undoListItem(
    householdId: string,
    itemId: string,
    requestId: string,
    actor: CommandActor,
  ): Promise<ListItemCommandResult> {
    return this.changeListItem(householdId, itemId, requestId, actor, false);
  }

  async getMealPlan(householdId: string, startDate: string): Promise<MealPlan> {
    this.assertHousehold(householdId);
    const endDate = addLocalDays(startDate, 6);
    const entries = this.database
      .prepare(
        `SELECT * FROM meal_plan_entries
         WHERE household_id = ? AND local_date BETWEEN ? AND ? ORDER BY local_date, meal_slot`,
      )
      .all(householdId, startDate, endDate) as MealRow[];
    return mealPlan(
      householdId,
      startDate,
      this.scenario === 'empty' ? [] : entries.map(mealFromRow),
      this.scenario === 'empty' ? [] : this.readSavedMeals(householdId),
      this.currentLocalDate(householdId),
    );
  }

  async upsertMealPlan(
    householdId: string,
    input: UpsertMealPlanRequest,
    actor: CommandActor,
  ): Promise<MealCommandResult> {
    this.assertAdmin(householdId, actor);
    return this.execute(
      householdId,
      input.requestId,
      'meal-plan',
      'meal_plan_entry',
      MealCommandResultSchema,
      () => {
        if (input.savedMealId !== null) this.readSavedMeal(householdId, input.savedMealId);
        const existing = this.database
          .prepare(
            'SELECT id FROM meal_plan_entries WHERE household_id = ? AND local_date = ? AND meal_slot = ?',
          )
          .get(householdId, input.localDate, input.slot) as { id: string } | undefined;
        const entryId = existing?.id ?? id('meal_plan');
        const now = new Date().toISOString();
        this.database
          .prepare(
            `INSERT INTO meal_plan_entries
              (id, household_id, local_date, meal_slot, saved_meal_id, meal_name_snapshot,
               note, planned_by_actor_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(household_id, local_date, meal_slot) DO UPDATE SET
               saved_meal_id = excluded.saved_meal_id,
               meal_name_snapshot = excluded.meal_name_snapshot,
               note = excluded.note,
               planned_by_actor_id = excluded.planned_by_actor_id,
               updated_at = excluded.updated_at`,
          )
          .run(
            entryId,
            householdId,
            input.localDate,
            input.slot,
            input.savedMealId,
            input.mealName,
            input.note,
            actor.id,
            now,
            now,
          );
        const entry = this.readMealEntry(entryId);
        return {
          entry,
          audit: audit('meal.plan', entryId, actor),
          replayed: false,
        };
      },
    );
  }

  async createSavedMeal(
    householdId: string,
    input: CreateSavedMealRequest,
    actor: CommandActor,
  ): Promise<SavedMealCommandResult> {
    this.assertAdmin(householdId, actor);
    return this.execute(
      householdId,
      input.requestId,
      'saved-meal-create',
      'saved_meal',
      SavedMealCommandResultSchema,
      () => {
        const mealId = id('saved_meal');
        const now = new Date().toISOString();
        try {
          this.database
            .prepare(
              `INSERT INTO saved_meals
                (id, household_id, name, description, favourite, archived_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, 1, NULL, ?, ?)`,
            )
            .run(mealId, householdId, input.name, input.description, now, now);
        } catch (error) {
          if (isUniqueError(error))
            throw new RepositoryError('CONFLICT', 'That saved meal already exists.');
          throw error;
        }
        return {
          savedMeal: this.readSavedMeal(householdId, mealId),
          audit: audit('saved-meal.create', mealId, actor),
          replayed: false,
        };
      },
    );
  }

  async getChoreTemplates(householdId: string, actor: CommandActor): Promise<ChoreTemplateList> {
    this.assertAdmin(householdId, actor);
    const rows = this.database
      .prepare(
        `SELECT t.*, a.member_id, m.display_name, m.colour, m.avatar_key, m.role,
                m.capabilities_json
         FROM chore_templates t
         JOIN chore_template_assignees a ON a.template_id = t.id
         JOIN members m ON m.id = a.member_id
         WHERE t.household_id = ? ORDER BY t.archived_at IS NOT NULL, t.created_at, t.id`,
      )
      .all(householdId) as ChoreTemplateRow[];
    return ChoreTemplateListSchema.parse({
      householdId,
      templates: this.scenario === 'empty' ? [] : rows.map(choreTemplateFromRow),
    });
  }

  async createChoreTemplate(
    householdId: string,
    input: CreateChoreTemplateRequest,
    actor: CommandActor,
  ): Promise<ChoreTemplateCommandResult> {
    this.assertAdmin(householdId, actor);
    this.readMember(householdId, input.assigneeId);
    return this.execute(
      householdId,
      input.requestId,
      'chore-template-create',
      'chore_template',
      ChoreTemplateCommandResultSchema,
      () => {
        const templateId = id('template');
        const now = new Date().toISOString();
        this.database
          .prepare(
            `INSERT INTO chore_templates
              (id, household_id, title, description, recurrence_rule, routine_label, due_time,
               points_value, active_from, active_until, archived_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL, ?, ?)`,
          )
          .run(
            templateId,
            householdId,
            input.title,
            input.description,
            choreRecurrenceRule(input.repeat, input.repeatDays),
            input.routineLabel,
            0,
            input.activeFrom,
            now,
            now,
          );
        this.database
          .prepare('INSERT INTO chore_template_assignees (template_id, member_id) VALUES (?, ?)')
          .run(templateId, input.assigneeId);
        return {
          template: this.readChoreTemplate(householdId, templateId),
          audit: audit('chore-template.create', templateId, actor),
          replayed: false,
        };
      },
    );
  }

  async updateChoreTemplate(
    householdId: string,
    templateId: string,
    input: UpdateChoreTemplateRequest,
    actor: CommandActor,
  ): Promise<ChoreTemplateCommandResult> {
    this.assertAdmin(householdId, actor);
    this.readChoreTemplate(householdId, templateId);
    this.readMember(householdId, input.assigneeId);
    return this.execute(
      householdId,
      input.requestId,
      'chore-template-update',
      'chore_template',
      ChoreTemplateCommandResultSchema,
      () => {
        this.database
          .prepare(
            `UPDATE chore_templates
             SET title = ?, description = ?, recurrence_rule = ?, routine_label = ?,
                 points_value = ?, active_from = ?, updated_at = ?
             WHERE id = ? AND household_id = ?`,
          )
          .run(
            input.title,
            input.description,
            choreRecurrenceRule(input.repeat, input.repeatDays),
            input.routineLabel,
            0,
            input.activeFrom,
            new Date().toISOString(),
            templateId,
            householdId,
          );
        this.database
          .prepare('DELETE FROM chore_template_assignees WHERE template_id = ?')
          .run(templateId);
        this.database
          .prepare('INSERT INTO chore_template_assignees (template_id, member_id) VALUES (?, ?)')
          .run(templateId, input.assigneeId);
        return {
          template: this.readChoreTemplate(householdId, templateId),
          audit: audit('chore-template.update', templateId, actor),
          replayed: false,
        };
      },
    );
  }

  reset(): void {
    this.database.exec(
      `DELETE FROM meal_plan_entries;
       DELETE FROM saved_meals;
       DELETE FROM list_items;
       DELETE FROM household_lists;`,
    );
    if (this.demoSeedEnabled) this.seedDemo();
    this.scenario = 'healthy';
  }

  setScenario(scenario: DemoScenario): void {
    this.scenario = scenario;
  }

  close(): void {}

  private async changeListItem(
    householdId: string,
    itemId: string,
    requestId: string,
    actor: CommandActor,
    checked: boolean,
  ): Promise<ListItemCommandResult> {
    this.assertHousehold(householdId);
    this.assertListActor(householdId, actor, true);
    return this.execute(
      householdId,
      requestId,
      checked ? 'list-item-complete' : 'list-item-undo',
      'list_item',
      ListItemCommandResultSchema,
      () => {
        const row = this.database
          .prepare(
            `SELECT i.list_id, i.checked_at FROM list_items i
             JOIN household_lists l ON l.id = i.list_id
             WHERE i.id = ? AND l.household_id = ? AND i.archived_at IS NULL`,
          )
          .get(itemId, householdId) as { list_id: string; checked_at: string | null } | undefined;
        if (row === undefined)
          throw new RepositoryError('NOT_FOUND', 'That list item was not found.');
        if ((row.checked_at !== null) === checked) {
          throw new RepositoryError(
            'CONFLICT',
            checked ? 'That item is already checked.' : 'That item is already waiting.',
          );
        }
        const now = new Date().toISOString();
        this.database
          .prepare(
            `UPDATE list_items SET checked_at = ?, checked_by_actor_id = ?, updated_at = ?
             WHERE id = ?`,
          )
          .run(checked ? now : null, checked ? actor.id : null, now, itemId);
        return {
          list: this.readList(row.list_id),
          item: this.readItem(itemId),
          audit: audit(
            checked ? 'list.item.complete' : 'list.item.undo',
            itemId,
            actor,
            checked ? 'succeeded' : 'reversed',
          ),
          replayed: false,
        };
      },
    );
  }

  private execute<T extends AuditedResult>(
    householdId: string,
    requestId: string,
    commandType: string,
    targetType: string,
    schema: { parse(value: unknown): T },
    operation: () => T,
  ): T {
    const transaction = this.database.transaction(() => {
      const receipt = this.readReceipt(householdId, requestId, commandType, schema);
      if (receipt !== null) return schema.parse({ ...receipt, replayed: true });
      this.assertScenarioAllowsWrite();
      const result = schema.parse(operation());
      this.writeAudit(householdId, result.audit, requestId, targetType);
      this.database
        .prepare(
          `INSERT INTO command_receipts
            (household_id, request_id, command_type, response_json, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(householdId, requestId, commandType, JSON.stringify(result), result.audit.occurredAt);
      return result;
    });
    try {
      return transaction();
    } catch (error) {
      if (error instanceof PlanningDomainError) {
        throw new RepositoryError(error.code, error.message);
      }
      throw error;
    }
  }

  private assertScenarioAllowsWrite(): void {
    if (this.scenario === 'permission') {
      throw new RepositoryError('FORBIDDEN', 'Ask an adult to change this.');
    }
    if (this.scenario === 'fail-next') {
      this.scenario = 'healthy';
      throw new RepositoryError('COMMAND_FAILED', 'That change did not save. Try again.', true);
    }
  }

  private readReceipt<T>(
    householdId: string,
    requestId: string,
    commandType: string,
    schema: { parse(value: unknown): T },
  ): T | null {
    const row = this.database
      .prepare(
        `SELECT response_json FROM command_receipts
         WHERE household_id = ? AND request_id = ? AND command_type = ?`,
      )
      .get(householdId, requestId, commandType) as { response_json: string } | undefined;
    return row === undefined ? null : schema.parse(JSON.parse(row.response_json) as unknown);
  }

  private readListForHousehold(householdId: string, listId: string): HouseholdList {
    const row = this.database
      .prepare(
        'SELECT 1 FROM household_lists WHERE id = ? AND household_id = ? AND archived_at IS NULL',
      )
      .get(listId, householdId);
    if (row === undefined) throw new RepositoryError('NOT_FOUND', 'That list was not found.');
    return this.readList(listId);
  }

  private readList(listId: string): HouseholdList {
    const row = this.database
      .prepare('SELECT * FROM household_lists WHERE id = ? AND archived_at IS NULL')
      .get(listId) as ListRow | undefined;
    if (row === undefined) throw new RepositoryError('NOT_FOUND', 'That list was not found.');
    const items = this.database
      .prepare(
        `SELECT * FROM list_items WHERE list_id = ? AND archived_at IS NULL
         ORDER BY checked_at IS NOT NULL, position, id`,
      )
      .all(listId) as ListItemRow[];
    return listFromRow(row, items.map(listItemFromRow));
  }

  private readItem(itemId: string): ListItem {
    const row = this.database.prepare('SELECT * FROM list_items WHERE id = ?').get(itemId) as
      ListItemRow | undefined;
    if (row === undefined) throw new RepositoryError('NOT_FOUND', 'That list item was not found.');
    return listItemFromRow(row);
  }

  private readSavedMeals(householdId: string): SavedMeal[] {
    const rows = this.database
      .prepare(
        `SELECT * FROM saved_meals WHERE household_id = ? AND archived_at IS NULL
         ORDER BY favourite DESC, name`,
      )
      .all(householdId) as SavedMealRow[];
    return rows.map(savedMealFromRow);
  }

  private readSavedMeal(householdId: string, mealId: string): SavedMeal {
    const row = this.database
      .prepare(
        'SELECT * FROM saved_meals WHERE id = ? AND household_id = ? AND archived_at IS NULL',
      )
      .get(mealId, householdId) as SavedMealRow | undefined;
    if (row === undefined) throw new RepositoryError('NOT_FOUND', 'That saved meal was not found.');
    return savedMealFromRow(row);
  }

  private readMealEntry(entryId: string) {
    const row = this.database
      .prepare('SELECT * FROM meal_plan_entries WHERE id = ?')
      .get(entryId) as MealRow | undefined;
    if (row === undefined) throw new RepositoryError('NOT_FOUND', 'That meal plan was not found.');
    return mealFromRow(row);
  }

  private readChoreTemplate(householdId: string, templateId: string): ChoreTemplate {
    const row = this.database
      .prepare(
        `SELECT t.*, a.member_id, m.display_name, m.colour, m.avatar_key, m.role,
                m.capabilities_json
         FROM chore_templates t
         JOIN chore_template_assignees a ON a.template_id = t.id
         JOIN members m ON m.id = a.member_id
         WHERE t.id = ? AND t.household_id = ?`,
      )
      .get(templateId, householdId) as ChoreTemplateRow | undefined;
    if (row === undefined)
      throw new RepositoryError('NOT_FOUND', 'That recurring chore was not found.');
    return choreTemplateFromRow(row);
  }

  private readMember(householdId: string, memberId: string): Member {
    const row = this.database
      .prepare(
        `SELECT id, display_name, colour, avatar_key, role, capabilities_json
         FROM members WHERE id = ? AND household_id = ? AND archived_at IS NULL`,
      )
      .get(memberId, householdId) as MemberRow | undefined;
    if (row === undefined) throw new RepositoryError('NOT_FOUND', 'That person was not found.');
    return memberFromRow(row);
  }

  private assertAdmin(householdId: string, actor: CommandActor): void {
    if (actor.type !== 'member' || actor.source !== 'companion') {
      throw new RepositoryError('FORBIDDEN', 'Only a household administrator can change this.');
    }
    const member = this.readMember(householdId, actor.id);
    if (!member.capabilities.includes('household.admin')) {
      throw new RepositoryError('FORBIDDEN', 'Only a household administrator can change this.');
    }
  }

  private assertListActor(householdId: string, actor: CommandActor, allowDevice: boolean): void {
    if (actor.type === 'member') {
      const member = this.readMember(householdId, actor.id);
      if (member.capabilities.includes('lists.change')) return;
    }
    if (
      actor.type === 'service' &&
      actor.id === 'service_home_assistant' &&
      ['automation', 'voice'].includes(actor.source)
    ) {
      return;
    }
    if (allowDevice && actor.type === 'device' && actor.source === 'tv') {
      const row = this.database
        .prepare(
          `SELECT scopes_json FROM paired_devices
           WHERE id = ? AND household_id = ? AND revoked_at IS NULL`,
        )
        .get(actor.id, householdId) as { scopes_json: string } | undefined;
      if (row !== undefined && (JSON.parse(row.scopes_json) as string[]).includes('lists.change')) {
        return;
      }
    }
    throw new RepositoryError('FORBIDDEN', 'You cannot change this list.');
  }

  private assertHousehold(householdId: string): void {
    if (
      this.database.prepare('SELECT 1 FROM households WHERE id = ?').get(householdId) === undefined
    ) {
      throw new RepositoryError('NOT_FOUND', 'That household could not be found.');
    }
  }

  private writeAudit(
    householdId: string,
    summary: AuditSummary,
    requestId: string,
    targetType: string,
  ): void {
    this.database
      .prepare(
        `INSERT INTO audit_events
          (id, occurred_at, household_id, actor_type, actor_id, source_channel, action_type,
           target_type, target_id, request_id, result, safe_summary_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')`,
      )
      .run(
        summary.id,
        summary.occurredAt,
        householdId,
        summary.actorType,
        summary.actorId,
        summary.source,
        summary.action,
        targetType,
        summary.targetId,
        requestId,
        summary.result,
      );
  }

  private seedDemo(): void {
    this.updateDemoCapabilities();
    const insertList = this.database.prepare(
      `INSERT OR IGNORE INTO household_lists
        (id, household_id, name, list_type, colour, sort_order, archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    );
    const insertItem = this.database.prepare(
      `INSERT OR IGNORE INTO list_items
        (id, list_id, text, normalised_text, quantity, position, checked_at, checked_by_actor_id,
         archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?)`,
    );
    for (const [listIndex, list] of demoLists().entries()) {
      insertList.run(
        list.id,
        DEMO_HOUSEHOLD_ID,
        list.name,
        list.type,
        list.color,
        listIndex,
        DEMO_NOW,
        DEMO_NOW,
      );
      for (const [itemIndex, item] of list.items.entries()) {
        insertItem.run(
          item.id,
          list.id,
          item.text,
          normaliseListItemText(item.text),
          itemIndex,
          item.checkedAt,
          item.checkedByActorId,
          DEMO_NOW,
          DEMO_NOW,
        );
      }
    }

    const insertSavedMeal = this.database.prepare(
      `INSERT OR IGNORE INTO saved_meals
        (id, household_id, name, description, favourite, archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, NULL, ?, ?)`,
    );
    for (const meal of demoSavedMeals()) {
      insertSavedMeal.run(
        meal.id,
        DEMO_HOUSEHOLD_ID,
        meal.name,
        meal.description,
        DEMO_NOW,
        DEMO_NOW,
      );
    }
    const insertMeal = this.database.prepare(
      `INSERT OR IGNORE INTO meal_plan_entries
        (id, household_id, local_date, meal_slot, saved_meal_id, meal_name_snapshot, note,
         planned_by_actor_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'member_maya', ?, ?)`,
    );
    for (const entry of demoMealEntries()) {
      insertMeal.run(
        entry.id,
        DEMO_HOUSEHOLD_ID,
        entry.localDate,
        entry.slot,
        entry.savedMealId,
        entry.mealName,
        entry.note,
        DEMO_NOW,
        DEMO_NOW,
      );
    }
  }

  private updateDemoCapabilities(): void {
    for (const member of createDemoSeed().household.members) {
      this.database
        .prepare('UPDATE members SET capabilities_json = ? WHERE id = ? AND household_id = ?')
        .run(JSON.stringify(member.capabilities), member.id, DEMO_HOUSEHOLD_ID);
    }
    const device = this.database
      .prepare('SELECT scopes_json FROM paired_devices WHERE id = ?')
      .get('device_living_room_tv') as { scopes_json: string } | undefined;
    if (device !== undefined) {
      const scopes = new Set(JSON.parse(device.scopes_json) as string[]);
      scopes.add('lists.change');
      this.database
        .prepare('UPDATE paired_devices SET scopes_json = ? WHERE id = ?')
        .run(JSON.stringify([...scopes]), 'device_living_room_tv');
    }
  }

  private currentLocalDate(householdId: string): string {
    const row = this.database
      .prepare('SELECT timezone FROM households WHERE id = ?')
      .get(householdId) as { timezone: string } | undefined;
    if (row === undefined) throw new RepositoryError('NOT_FOUND', 'That household was not found.');
    return localDateInTimezone(this.clock.now().toISOString(), row.timezone);
  }
}

function demoLists(): HouseholdList[] {
  return [
    list('list_groceries', 'Groceries', 'grocery', '#3f7251', [
      item('list_item_milk', 'Milk'),
      item('list_item_bananas', 'Bananas'),
      item('list_item_pasta', 'Pasta'),
      item('list_item_yoghurt', 'Yoghurt'),
      item('list_item_tomatoes', 'Tomatoes'),
      item('list_item_bread', 'Bread'),
      item('list_item_oats', 'Oats', true),
    ]),
    list('list_weekend_away', 'Weekend away', 'packing', '#1668b7', [
      item('list_item_towels', 'Beach towels'),
      item('list_item_chargers', 'Phone chargers'),
    ]),
    list('list_hardware', 'Hardware', 'shopping', '#c97900', [
      item('list_item_picture_hooks', 'Picture hooks'),
    ]),
  ];
}

function demoSavedMeals(): SavedMeal[] {
  const names = [
    'Lemon chicken & roast vegetables',
    'Tacos',
    'Salmon bowls',
    'Pizza night',
    'Vegetable curry',
    "Nan's roast",
    'Beef stir-fry',
    'Pumpkin soup',
    'Chicken pasta',
    'Baked potatoes',
    'Fish and salad',
    'Homemade burgers',
  ];
  return names.map((name, index) =>
    SavedMealSchema.parse({
      id: `saved_meal_demo_${index + 1}`,
      name,
      description: index === 0 ? 'Prep at 5:30' : null,
      favourite: true,
    }),
  );
}

function demoMealEntries() {
  const names = [
    'Lemon chicken & roast vegetables',
    'Tacos',
    'Leftovers',
    'Salmon bowls',
    'Pizza night',
    'Vegetable curry',
    "Nan's roast",
  ];
  return names.map((mealName, index) =>
    MealPlanEntrySchema.parse({
      id: `meal_plan_demo_${index + 1}`,
      localDate: addLocalDays(DEMO_LOCAL_DATE, index),
      slot: 'dinner',
      mealName,
      savedMealId: index === 2 ? null : `saved_meal_demo_${Math.min(index + 1, 12)}`,
      note: index === 0 ? 'Prep at 5:30' : null,
    }),
  );
}

function demoChoreTemplates(): ChoreTemplate[] {
  const seed = createDemoSeed();
  const rules = new Map([
    ['occurrence_school_bag', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'],
    ['occurrence_feed_pepper', 'FREQ=DAILY'],
    ['occurrence_dishes', 'FREQ=DAILY'],
    ['occurrence_laundry', 'FREQ=WEEKLY;BYDAY=MO,TH'],
    ['occurrence_herbs', 'FREQ=DAILY'],
    ['occurrence_make_bed', 'FREQ=DAILY'],
  ]);
  return seed.chores.map((occurrence) => {
    const parsed = choreRepeatFromRule(rules.get(occurrence.id) ?? 'FREQ=DAILY');
    return ChoreTemplateSchema.parse({
      id: `template_${occurrence.id.replace('occurrence_', '')}`,
      title: occurrence.title,
      description: null,
      assignee: occurrence.assignee,
      routineLabel: occurrence.routineLabel,
      ...parsed,
      activeFrom: DEMO_LOCAL_DATE,
      archived: false,
    });
  });
}

function mealPlan(
  householdId: string,
  startDate: string,
  entries: readonly ReturnType<typeof mealFromRow>[],
  savedMeals: readonly SavedMeal[],
  today = DEMO_LOCAL_DATE,
): MealPlan {
  const endDate = addLocalDays(startDate, 6);
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  return MealPlanSchema.parse({
    householdId,
    startDate,
    endDate,
    displayRange: `${start.getUTCDate()}–${end.getUTCDate()} ${new Intl.DateTimeFormat('en-AU', {
      month: 'long',
      timeZone: 'UTC',
    }).format(end)}`,
    days: Array.from({ length: 7 }, (_, index) => {
      const localDate = addLocalDays(startDate, index);
      const date = new Date(`${localDate}T12:00:00Z`);
      return {
        localDate,
        dayLabel: new Intl.DateTimeFormat('en-AU', {
          weekday: 'short',
          timeZone: 'UTC',
        }).format(date),
        dateLabel: new Intl.DateTimeFormat('en-AU', {
          day: 'numeric',
          timeZone: 'UTC',
        }).format(date),
        isToday: localDate === today,
        entries: entries.filter((entry) => entry.localDate === localDate),
      };
    }),
    savedMeals,
  });
}

function templateFromInput(
  idValue: string,
  input: CreateChoreTemplateRequest | UpdateChoreTemplateRequest,
): ChoreTemplate {
  return ChoreTemplateSchema.parse({
    id: idValue,
    title: input.title,
    description: input.description,
    assignee: demoMember(input.assigneeId),
    routineLabel: input.routineLabel,
    repeat: input.repeat,
    repeatDays: input.repeatDays,
    activeFrom: input.activeFrom,
    archived: false,
  });
}

function demoMember(memberId: string): Member {
  const member = createDemoSeed().household.members.find((candidate) => candidate.id === memberId);
  if (member === undefined) throw new RepositoryError('NOT_FOUND', 'That person was not found.');
  return member;
}

function list(
  idValue: string,
  name: string,
  type: HouseholdList['type'],
  color: string,
  items: ListItem[],
): HouseholdList {
  return HouseholdListSchema.parse({
    id: idValue,
    name,
    type,
    color,
    remainingCount: items.filter((entry) => !entry.checked).length,
    totalCount: items.length,
    items,
  });
}

function item(idValue: string, text: string, checked = false): ListItem {
  return ListItemSchema.parse({
    id: idValue,
    text,
    quantity: null,
    checked,
    checkedAt: checked ? '2026-08-03T07:12:00+08:00' : null,
    checkedByActorId: checked ? 'member_maya' : null,
  });
}

function refreshListCounts(listValue: HouseholdList): void {
  listValue.remainingCount = listValue.items.filter((entry) => !entry.checked).length;
  listValue.totalCount = listValue.items.length;
}

function sameText(left: string, right: string): boolean {
  return normaliseListItemText(left) === normaliseListItemText(right);
}

function audit(
  action: AuditSummary['action'],
  targetId: string,
  actor: CommandActor,
  result: AuditSummary['result'] = 'succeeded',
): AuditSummary {
  return {
    id: id('audit'),
    actorType: actor.type,
    actorId: actor.id,
    source: actor.source,
    action,
    targetId,
    occurredAt: new Date().toISOString(),
    result,
  };
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '_')}`;
}

function listFromRow(row: ListRow, items: ListItem[]): HouseholdList {
  return HouseholdListSchema.parse({
    id: row.id,
    name: row.name,
    type: row.list_type,
    color: row.colour,
    remainingCount: items.filter((itemValue) => !itemValue.checked).length,
    totalCount: items.length,
    items,
  });
}

function listItemFromRow(row: ListItemRow): ListItem {
  return ListItemSchema.parse({
    id: row.id,
    text: row.text,
    quantity: row.quantity,
    checked: row.checked_at !== null,
    checkedAt: row.checked_at,
    checkedByActorId: row.checked_by_actor_id,
  });
}

function savedMealFromRow(row: SavedMealRow): SavedMeal {
  return SavedMealSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description,
    favourite: row.favourite === 1,
  });
}

function mealFromRow(row: MealRow) {
  return MealPlanEntrySchema.parse({
    id: row.id,
    localDate: row.local_date,
    slot: row.meal_slot,
    mealName: row.meal_name_snapshot,
    savedMealId: row.saved_meal_id,
    note: row.note,
  });
}

function choreTemplateFromRow(row: ChoreTemplateRow): ChoreTemplate {
  return ChoreTemplateSchema.parse({
    id: row.id,
    title: row.title,
    description: row.description,
    assignee: memberFromRow(row),
    routineLabel: row.routine_label,
    ...choreRepeatFromRule(row.recurrence_rule),
    activeFrom: row.active_from,
    archived: row.archived_at !== null,
  });
}

function memberFromRow(row: MemberRow): Member {
  return MemberSchema.parse({
    id: row.member_id ?? row.id,
    displayName: row.display_name,
    color: row.colour,
    avatarUrl: row.avatar_key ?? '/brand/hearth-mark.png',
    role: row.role,
    capabilities: JSON.parse(row.capabilities_json) as unknown,
  });
}

function isUniqueError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}

interface ListRow {
  id: string;
  name: string;
  list_type: HouseholdList['type'];
  colour: string;
}

interface ListItemRow {
  id: string;
  text: string;
  quantity: string | null;
  checked_at: string | null;
  checked_by_actor_id: string | null;
}

interface SavedMealRow {
  id: string;
  name: string;
  description: string | null;
  favourite: 0 | 1;
}

interface MealRow {
  id: string;
  local_date: string;
  meal_slot: 'breakfast' | 'lunch' | 'dinner';
  meal_name_snapshot: string;
  saved_meal_id: string | null;
  note: string | null;
}

interface MemberRow {
  id?: string;
  member_id?: string;
  display_name: string;
  colour: string;
  avatar_key: string | null;
  role: 'adult' | 'child';
  capabilities_json: string;
}

interface ChoreTemplateRow extends MemberRow {
  id: string;
  title: string;
  description: string | null;
  recurrence_rule: string;
  routine_label: string;
  points_value: number;
  active_from: string;
  archived_at: string | null;
}
