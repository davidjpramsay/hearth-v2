import {
  assertNoActiveListDuplicate,
  assertListAdditionCapacity,
  PlanningDomainError,
} from '@hearth/core';
import {
  ChoreTemplateCommandResultSchema,
  ChoreTemplateListSchema,
  ChoreTemplateOrderCommandResultSchema,
  ChoreTemplateSchema,
  HouseholdListSettingsSchema,
  HouseholdListsSchema,
  ListItemCommandResultSchema,
  ListItemSchema,
  ListSettingsCommandResultSchema,
  MealCommandResultSchema,
  MealPlanEntrySchema,
  MealPlanWeekCommandResultSchema,
  SavedMealCommandResultSchema,
  SavedMealLibrarySchema,
  SavedMealSchema,
  type AddListItemRequest,
  type AuditSummary,
  type ChoreTemplateCommandResult,
  type ChoreTemplateList,
  type ChoreTemplateOrderCommandResult,
  type CreateHouseholdListRequest,
  type CreateChoreTemplateRequest,
  type CreateSavedMealRequest,
  type ClearMealPlanWeekRequest,
  type CopyMealPlanWeekRequest,
  type DemoScenario,
  type HouseholdList,
  type HouseholdListSettings,
  type HouseholdLists,
  type ListItem,
  type ListItemCommandResult,
  type ListSettingsCommandResult,
  type MealCommandResult,
  type MealPlan,
  type MealPlanWeekCommandResult,
  type SavedMeal,
  type SavedMealCommandResult,
  type SavedMealLibrary,
  type UpdateChoreTemplateRequest,
  type UpdateHouseholdListRequest,
  type UpdateListItemRequest,
  type ReorderHouseholdListsRequest,
  type ReorderChoreTemplatesRequest,
  type ReorderListItemsRequest,
  type RestoreChoreTemplateRequest,
  type UpsertMealPlanRequest,
  type UpdateMealPlanWeekRequest,
  type UpdateSavedMealRequest,
} from '@hearth/shared';

import { DEMO_HOUSEHOLD_ID, DEMO_NOW } from './demo/seed.js';
import { type CommandActor, RepositoryError } from './repository.js';
import { FixedClock, type HearthClock } from './runtime-context.js';

import type { PlanningRepository, AuditedResult } from './planning-repository.js';
import {
  demoLists,
  demoSavedMeals,
  demoMealEntries,
  demoChoreTemplates,
  mealPlan,
  templateFromInput,
  list,
  refreshListCounts,
  sameText,
  assertExactOrder,
  sortSavedMeals,
  localDateInWeek,
  shiftLocalDateBetweenWeeks,
  mealWeekTargetId,
} from './planning-records.js';
export class InMemoryPlanningRepository implements PlanningRepository {
  private lists = demoLists();
  private archivedLists: Array<{ list: HouseholdList; archivedAt: string }> = [];
  private savedMeals = demoSavedMeals();
  private archivedSavedMeals: SavedMeal[] = [];
  private mealEntries = demoMealEntries();
  private templates = demoChoreTemplates();
  private readonly receipts = new Map<string, AuditedResult>();
  private sequence = 100;
  private scenario: DemoScenario = 'healthy';

  constructor(private readonly clock: HearthClock = new FixedClock(DEMO_NOW)) {}

  async getLists(householdId: string): Promise<HouseholdLists> {
    this.assertHousehold(householdId);
    return HouseholdListsSchema.parse({
      householdId,
      lists: this.scenario === 'empty' ? [] : this.lists,
    });
  }

  async getListSettings(householdId: string, actor: CommandActor): Promise<HouseholdListSettings> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.listSettings(householdId);
  }

  async createList(
    householdId: string,
    input: CreateHouseholdListRequest,
    actor: CommandActor,
  ): Promise<ListSettingsCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun('list-create', input.requestId, ListSettingsCommandResultSchema, () => {
      this.assertUniqueListName(input.name);
      const created = list(this.id('list'), input.name, input.type, input.color, []);
      this.lists.push(created);
      return this.settingsResult(householdId, 'list.create', created.id, actor);
    });
  }

  async updateList(
    householdId: string,
    listId: string,
    input: UpdateHouseholdListRequest,
    actor: CommandActor,
  ): Promise<ListSettingsCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun('list-update', input.requestId, ListSettingsCommandResultSchema, () => {
      const current = this.list(listId);
      this.assertUniqueListName(input.name, listId);
      current.name = input.name;
      current.type = input.type;
      current.color = input.color;
      return this.settingsResult(householdId, 'list.update', listId, actor);
    });
  }

  async archiveList(
    householdId: string,
    listId: string,
    requestId: string,
    actor: CommandActor,
  ): Promise<ListSettingsCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun('list-archive', requestId, ListSettingsCommandResultSchema, () => {
      if (this.lists.length <= 1) {
        throw new RepositoryError('CONFLICT', 'Keep at least one household list active.');
      }
      const index = this.lists.findIndex((candidate) => candidate.id === listId);
      if (index < 0) throw new RepositoryError('NOT_FOUND', 'That list was not found.');
      const [removed] = this.lists.splice(index, 1);
      if (removed === undefined) throw new RepositoryError('NOT_FOUND', 'That list was not found.');
      this.archivedLists.push({ list: removed, archivedAt: this.now() });
      return this.settingsResult(householdId, 'list.archive', listId, actor);
    });
  }

  async restoreList(
    householdId: string,
    listId: string,
    requestId: string,
    actor: CommandActor,
  ): Promise<ListSettingsCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun('list-restore', requestId, ListSettingsCommandResultSchema, () => {
      const index = this.archivedLists.findIndex((candidate) => candidate.list.id === listId);
      if (index < 0) throw new RepositoryError('NOT_FOUND', 'That archived list was not found.');
      const [restored] = this.archivedLists.splice(index, 1);
      if (restored === undefined)
        throw new RepositoryError('NOT_FOUND', 'That archived list was not found.');
      this.lists.push(restored.list);
      return this.settingsResult(householdId, 'list.restore', listId, actor, 'reversed');
    });
  }

  async reorderLists(
    householdId: string,
    input: ReorderHouseholdListsRequest,
    actor: CommandActor,
  ): Promise<ListSettingsCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun(
      'list-reorder',
      input.requestId,
      ListSettingsCommandResultSchema,
      () => {
        assertExactOrder(
          this.lists.map((candidate) => candidate.id),
          input.orderedListIds,
          'List order must include every active list exactly once.',
        );
        const byId = new Map(this.lists.map((candidate) => [candidate.id, candidate]));
        this.lists = input.orderedListIds.map((idValue) => byId.get(idValue)!);
        return this.settingsResult(householdId, 'list.reorder', householdId, actor);
      },
    );
  }

  async updateListItem(
    householdId: string,
    itemId: string,
    input: UpdateListItemRequest,
    actor: CommandActor,
  ): Promise<ListSettingsCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun(
      'list-item-update',
      input.requestId,
      ListSettingsCommandResultSchema,
      () => {
        const owner = this.listContainingItem(itemId);
        assertNoActiveListDuplicate(
          owner.list.items.filter((candidate) => candidate.id !== itemId),
          input.text,
        );
        owner.item.text = input.text;
        owner.item.quantity = input.quantity;
        return this.settingsResult(householdId, 'list.item.update', itemId, actor);
      },
    );
  }

  async archiveListItem(
    householdId: string,
    itemId: string,
    requestId: string,
    actor: CommandActor,
  ): Promise<ListSettingsCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun('list-item-archive', requestId, ListSettingsCommandResultSchema, () => {
      const owner = this.listContainingItem(itemId);
      owner.list.items.splice(owner.list.items.indexOf(owner.item), 1);
      refreshListCounts(owner.list);
      return this.settingsResult(householdId, 'list.item.archive', itemId, actor);
    });
  }

  async reorderListItems(
    householdId: string,
    listId: string,
    input: ReorderListItemsRequest,
    actor: CommandActor,
  ): Promise<ListSettingsCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun(
      'list-item-reorder',
      input.requestId,
      ListSettingsCommandResultSchema,
      () => {
        const current = this.list(listId);
        assertExactOrder(
          current.items.map((candidate) => candidate.id),
          input.orderedItemIds,
          'Item order must include every item exactly once.',
        );
        const byId = new Map(current.items.map((candidate) => [candidate.id, candidate]));
        current.items = input.orderedItemIds.map((idValue) => byId.get(idValue)!);
        return this.settingsResult(householdId, 'list.item.reorder', listId, actor);
      },
    );
  }

  async clearCheckedListItems(
    householdId: string,
    listId: string,
    requestId: string,
    actor: CommandActor,
  ): Promise<ListSettingsCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun(
      'list-item-clear-checked',
      requestId,
      ListSettingsCommandResultSchema,
      () => {
        const current = this.list(listId);
        if (!current.items.some((itemValue) => itemValue.checked)) {
          throw new RepositoryError('CONFLICT', 'There are no checked items to clear.');
        }
        current.items = current.items.filter((itemValue) => !itemValue.checked);
        refreshListCounts(current);
        return this.settingsResult(householdId, 'list.item.clear-checked', listId, actor);
      },
    );
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
      assertListAdditionCapacity(list.items.length);
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
      this.assertSavedMealReferences([input.savedMealId]);
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
        if (
          this.savedMeals.some((meal) => sameText(meal.name, input.name)) ||
          this.archivedSavedMeals.some((meal) => sameText(meal.name, input.name))
        ) {
          throw new RepositoryError('CONFLICT', 'That saved meal already exists.');
        }
        const savedMeal = SavedMealSchema.parse({
          id: this.id('saved_meal'),
          name: input.name,
          description: input.description,
          preparationMinutes: input.preparationMinutes,
          favourite: input.favourite,
          archivedAt: null,
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

  async getSavedMealLibrary(householdId: string, actor: CommandActor): Promise<SavedMealLibrary> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return SavedMealLibrarySchema.parse({
      householdId,
      activeMeals: this.scenario === 'empty' ? [] : sortSavedMeals(this.savedMeals),
      archivedMeals: this.scenario === 'empty' ? [] : sortSavedMeals(this.archivedSavedMeals),
    });
  }

  async updateSavedMeal(
    householdId: string,
    mealId: string,
    input: UpdateSavedMealRequest,
    actor: CommandActor,
  ): Promise<SavedMealCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun(
      'saved-meal-update',
      input.requestId,
      SavedMealCommandResultSchema,
      () => {
        const index = this.savedMeals.findIndex((meal) => meal.id === mealId);
        if (index < 0) throw new RepositoryError('NOT_FOUND', 'That saved meal was not found.');
        if (
          this.savedMeals.some((meal) => meal.id !== mealId && sameText(meal.name, input.name)) ||
          this.archivedSavedMeals.some((meal) => sameText(meal.name, input.name))
        ) {
          throw new RepositoryError('CONFLICT', 'That saved meal already exists.');
        }
        const savedMeal = SavedMealSchema.parse({
          id: mealId,
          name: input.name,
          description: input.description,
          preparationMinutes: input.preparationMinutes,
          favourite: input.favourite,
          archivedAt: null,
        });
        this.savedMeals[index] = savedMeal;
        return {
          savedMeal,
          audit: this.audit('saved-meal.update', mealId, actor),
          replayed: false,
        };
      },
    );
  }

  async archiveSavedMeal(
    householdId: string,
    mealId: string,
    requestId: string,
    actor: CommandActor,
  ): Promise<SavedMealCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun('saved-meal-archive', requestId, SavedMealCommandResultSchema, () => {
      const index = this.savedMeals.findIndex((meal) => meal.id === mealId);
      const current = this.savedMeals[index];
      if (current === undefined)
        throw new RepositoryError('NOT_FOUND', 'That saved meal was not found.');
      const savedMeal = SavedMealSchema.parse({ ...current, archivedAt: this.now() });
      this.savedMeals.splice(index, 1);
      this.archivedSavedMeals.push(savedMeal);
      return {
        savedMeal,
        audit: this.audit('saved-meal.archive', mealId, actor),
        replayed: false,
      };
    });
  }

  async restoreSavedMeal(
    householdId: string,
    mealId: string,
    requestId: string,
    actor: CommandActor,
  ): Promise<SavedMealCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun('saved-meal-restore', requestId, SavedMealCommandResultSchema, () => {
      const index = this.archivedSavedMeals.findIndex((meal) => meal.id === mealId);
      const current = this.archivedSavedMeals[index];
      if (current === undefined)
        throw new RepositoryError('NOT_FOUND', 'That archived meal was not found.');
      const savedMeal = SavedMealSchema.parse({ ...current, archivedAt: null });
      this.archivedSavedMeals.splice(index, 1);
      this.savedMeals.push(savedMeal);
      return {
        savedMeal,
        audit: this.audit('saved-meal.restore', mealId, actor, 'reversed'),
        replayed: false,
      };
    });
  }

  async updateMealPlanWeek(
    householdId: string,
    input: UpdateMealPlanWeekRequest,
    actor: CommandActor,
  ): Promise<MealPlanWeekCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun(
      'meal-week-update',
      input.requestId,
      MealPlanWeekCommandResultSchema,
      () => {
        this.assertSavedMealReferences(input.entries.map((entry) => entry.savedMealId));
        this.mealEntries = this.mealEntries.filter(
          (entry) => !localDateInWeek(entry.localDate, input.startDate),
        );
        this.mealEntries.push(
          ...input.entries.map((entry) =>
            MealPlanEntrySchema.parse({ ...entry, id: this.id('meal_plan') }),
          ),
        );
        return this.weekResult(householdId, input.startDate, 'meal.week.update', actor);
      },
    );
  }

  async clearMealPlanWeek(
    householdId: string,
    input: ClearMealPlanWeekRequest,
    actor: CommandActor,
  ): Promise<MealPlanWeekCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun(
      'meal-week-clear',
      input.requestId,
      MealPlanWeekCommandResultSchema,
      () => {
        const retained = this.mealEntries.filter(
          (entry) => !localDateInWeek(entry.localDate, input.startDate),
        );
        if (retained.length === this.mealEntries.length) {
          throw new RepositoryError('CONFLICT', 'There are no planned meals to clear.');
        }
        this.mealEntries = retained;
        return this.weekResult(householdId, input.startDate, 'meal.week.clear', actor);
      },
    );
  }

  async copyMealPlanWeek(
    householdId: string,
    input: CopyMealPlanWeekRequest,
    actor: CommandActor,
  ): Promise<MealPlanWeekCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun(
      'meal-week-copy',
      input.requestId,
      MealPlanWeekCommandResultSchema,
      () => {
        if (input.sourceStartDate === input.targetStartDate) {
          throw new RepositoryError('CONFLICT', 'Choose a different week to copy.');
        }
        const source = this.mealEntries.filter((entry) =>
          localDateInWeek(entry.localDate, input.sourceStartDate),
        );
        if (source.length === 0) {
          throw new RepositoryError('CONFLICT', 'The earlier week has no meals to copy.');
        }
        const target = this.mealEntries.filter((entry) =>
          localDateInWeek(entry.localDate, input.targetStartDate),
        );
        if (target.length > 0 && !input.replaceExisting) {
          throw new RepositoryError('CONFIRMATION_REQUIRED', 'Confirm replacing this week first.');
        }
        this.mealEntries = this.mealEntries.filter(
          (entry) => !localDateInWeek(entry.localDate, input.targetStartDate),
        );
        this.mealEntries.push(
          ...source.map((entry) =>
            MealPlanEntrySchema.parse({
              ...entry,
              id: this.id('meal_plan'),
              savedMealId:
                entry.savedMealId !== null &&
                this.savedMeals.some((meal) => meal.id === entry.savedMealId)
                  ? entry.savedMealId
                  : null,
              localDate: shiftLocalDateBetweenWeeks(
                entry.localDate,
                input.sourceStartDate,
                input.targetStartDate,
              ),
            }),
          ),
        );
        return this.weekResult(householdId, input.targetStartDate, 'meal.week.copy', actor);
      },
    );
  }

  async getChoreTemplates(householdId: string, actor: CommandActor): Promise<ChoreTemplateList> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return ChoreTemplateListSchema.parse({
      householdId,
      templates:
        this.scenario === 'empty'
          ? []
          : [...this.templates].sort(
              (left, right) =>
                Number(left.archived) - Number(right.archived) ||
                left.sortOrder - right.sortOrder ||
                left.id.localeCompare(right.id),
            ),
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
        const nextSortOrder =
          Math.max(-1, ...this.templates.map((template) => template.sortOrder)) + 1;
        const template = templateFromInput(this.id('template'), input, false, nextSortOrder);
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
        const current = this.templates[index];
        if (current === undefined)
          throw new RepositoryError('NOT_FOUND', 'That recurring chore was not found.');
        const template = templateFromInput(templateId, input, current.archived, current.sortOrder);
        this.templates[index] = template;
        return {
          template,
          audit: this.audit('chore-template.update', template.id, actor),
          replayed: false,
        };
      },
    );
  }

  async reorderChoreTemplates(
    householdId: string,
    input: ReorderChoreTemplatesRequest,
    actor: CommandActor,
  ): Promise<ChoreTemplateOrderCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun(
      'chore-template-reorder',
      input.requestId,
      ChoreTemplateOrderCommandResultSchema,
      () => {
        const active = this.templates.filter((template) => !template.archived);
        assertExactOrder(
          active.map((template) => template.id),
          input.orderedTemplateIds,
          'Chore order must include every active schedule exactly once.',
        );
        const positions = new Map(
          input.orderedTemplateIds.map((templateId, index) => [templateId, index]),
        );
        this.templates = this.templates.map((template) =>
          template.archived
            ? template
            : ChoreTemplateSchema.parse({
                ...template,
                sortOrder: positions.get(template.id),
              }),
        );
        return {
          list: ChoreTemplateListSchema.parse({
            householdId,
            templates: [...this.templates].sort(
              (left, right) =>
                Number(left.archived) - Number(right.archived) ||
                left.sortOrder - right.sortOrder ||
                left.id.localeCompare(right.id),
            ),
          }),
          audit: this.audit('chore-template.reorder', householdId, actor),
          replayed: false,
        };
      },
    );
  }

  async archiveChoreTemplate(
    householdId: string,
    templateId: string,
    requestId: string,
    actor: CommandActor,
  ): Promise<ChoreTemplateCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun(
      'chore-template-archive',
      requestId,
      ChoreTemplateCommandResultSchema,
      () => {
        const index = this.templates.findIndex((template) => template.id === templateId);
        const current = this.templates[index];
        if (current === undefined)
          throw new RepositoryError('NOT_FOUND', 'That chore was not found.');
        if (current.archived)
          throw new RepositoryError('CONFLICT', 'That chore is already archived.');
        const template = ChoreTemplateSchema.parse({ ...current, archived: true });
        this.templates[index] = template;
        return {
          template,
          audit: this.audit('chore-template.archive', template.id, actor),
          replayed: false,
        };
      },
    );
  }

  async restoreChoreTemplate(
    householdId: string,
    templateId: string,
    input: RestoreChoreTemplateRequest,
    actor: CommandActor,
  ): Promise<ChoreTemplateCommandResult> {
    this.assertHousehold(householdId);
    this.assertAdmin(actor);
    return this.replayOrRun(
      'chore-template-restore',
      input.requestId,
      ChoreTemplateCommandResultSchema,
      () => {
        const index = this.templates.findIndex((template) => template.id === templateId);
        const current = this.templates[index];
        if (current === undefined)
          throw new RepositoryError('NOT_FOUND', 'That chore was not found.');
        if (!current.archived)
          throw new RepositoryError('CONFLICT', 'That chore is already active.');
        const template = ChoreTemplateSchema.parse({
          ...current,
          archived: false,
          activeFrom: input.resumeFrom,
          activeUntil: current.repeat === 'once' ? input.resumeFrom : null,
        });
        this.templates[index] = template;
        return {
          template,
          audit: this.audit('chore-template.restore', template.id, actor),
          replayed: false,
        };
      },
    );
  }

  reset(): void {
    this.lists = demoLists();
    this.archivedLists = [];
    this.savedMeals = demoSavedMeals();
    this.archivedSavedMeals = [];
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
        checkedAt: checked ? this.now() : null,
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

  private listContainingItem(itemId: string): { list: HouseholdList; item: ListItem } {
    const owner = this.lists.find((candidate) =>
      candidate.items.some((itemValue) => itemValue.id === itemId),
    );
    const itemValue = owner?.items.find((candidate) => candidate.id === itemId);
    if (owner === undefined || itemValue === undefined) {
      throw new RepositoryError('NOT_FOUND', 'That list item was not found.');
    }
    return { list: owner, item: itemValue };
  }

  private assertSavedMealReferences(savedMealIds: readonly (string | null)[]): void {
    const activeIds = new Set(this.savedMeals.map((meal) => meal.id));
    if (savedMealIds.some((mealId) => mealId !== null && !activeIds.has(mealId))) {
      throw new RepositoryError('NOT_FOUND', 'That saved meal was not found.');
    }
  }

  private weekResult(
    householdId: string,
    startDate: string,
    action: AuditSummary['action'],
    actor: CommandActor,
  ): MealPlanWeekCommandResult {
    return {
      plan: mealPlan(householdId, startDate, this.mealEntries, sortSavedMeals(this.savedMeals)),
      audit: this.audit(action, mealWeekTargetId(startDate), actor),
      replayed: false,
    };
  }

  private assertUniqueListName(name: string, excludingId?: string): void {
    const exists = [...this.lists, ...this.archivedLists.map((entry) => entry.list)].some(
      (candidate) => candidate.id !== excludingId && sameText(candidate.name, name),
    );
    if (exists) throw new RepositoryError('CONFLICT', 'A list with that name already exists.');
  }

  private listSettings(householdId: string): HouseholdListSettings {
    return HouseholdListSettingsSchema.parse({
      householdId,
      activeLists: this.scenario === 'empty' ? [] : this.lists,
      archivedLists:
        this.scenario === 'empty'
          ? []
          : this.archivedLists.map(({ list: archived, archivedAt }) => ({
              id: archived.id,
              name: archived.name,
              type: archived.type,
              color: archived.color,
              archivedAt,
            })),
    });
  }

  private settingsResult(
    householdId: string,
    action: AuditSummary['action'],
    targetId: string,
    actor: CommandActor,
    result: AuditSummary['result'] = 'succeeded',
  ): ListSettingsCommandResult {
    return {
      settings: this.listSettings(householdId),
      audit: this.audit(action, targetId, actor, result),
      replayed: false,
    };
  }

  private now(): string {
    return this.clock.now().toISOString();
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
      occurredAt: this.now(),
      result,
    };
  }

  private id(prefix: string): string {
    this.sequence += 1;
    return `${prefix}_demo_${this.sequence}`;
  }
}
