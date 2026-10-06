import { randomUUID } from 'node:crypto';

import { addLocalDays, choreRepeatFromRule, normaliseListItemText } from '@hearth/core';
import {
  ChoreTemplateSchema,
  HouseholdListSchema,
  ListItemSchema,
  MealPlanEntrySchema,
  MealPlanSchema,
  MemberSchema,
  SavedMealSchema,
  type AuditSummary,
  type ChoreTemplate,
  type CreateChoreTemplateRequest,
  type HouseholdList,
  type ListItem,
  type MealPlan,
  type Member,
  type SavedMeal,
  type UpdateChoreTemplateRequest,
} from '@hearth/shared';

import { createDemoSeed, DEMO_LOCAL_DATE } from './demo/seed.js';
import { type CommandActor, RepositoryError } from './repository.js';

export function demoLists(): HouseholdList[] {
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

export function demoSavedMeals(): SavedMeal[] {
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
      description: index === 0 ? 'Good for a school night' : null,
      preparationMinutes: index === 0 ? 45 : index < 5 ? 30 : null,
      favourite: index < 7,
      archivedAt: null,
    }),
  );
}

export function demoMealEntries() {
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

export function demoChoreTemplates(): ChoreTemplate[] {
  const seed = createDemoSeed();
  const rules = new Map([
    ['occurrence_school_bag', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'],
    ['occurrence_feed_pepper', 'FREQ=DAILY'],
    ['occurrence_dishes', 'FREQ=DAILY'],
    ['occurrence_laundry', 'FREQ=WEEKLY;BYDAY=MO,TH'],
    ['occurrence_herbs', 'FREQ=DAILY'],
    ['occurrence_make_bed', 'FREQ=DAILY'],
  ]);
  const descriptions = new Map([
    ['occurrence_school_bag', 'Pack the lunchbox, water bottle and homework folder.'],
    ['occurrence_feed_pepper', 'Fresh water first, then one measured scoop of food.'],
    ['occurrence_dishes', 'Unload the clean dishes and put everything back in its usual place.'],
    ['occurrence_laundry', 'Take the school clothes to the laundry and separate any wet items.'],
    ['occurrence_herbs', 'Water the herb pots until the soil is damp, without flooding the tray.'],
    [
      'occurrence_make_bed',
      'Straighten the sheets, pull up the doona and place pillows at the top.',
    ],
  ]);
  return seed.chores.map((occurrence, index) => {
    const parsed = choreRepeatFromRule(rules.get(occurrence.id) ?? 'FREQ=DAILY');
    return ChoreTemplateSchema.parse({
      id: `template_${occurrence.id.replace('occurrence_', '')}`,
      title: occurrence.title,
      description: descriptions.get(occurrence.id) ?? null,
      assignees: [occurrence.assignee],
      routineLabel: occurrence.routineLabel,
      availableFromTime: occurrence.availableFromTime,
      dueTime: occurrence.dueTime,
      sortOrder: index,
      ...parsed,
      activeFrom: DEMO_LOCAL_DATE,
      activeUntil: null,
      archived: false,
    });
  });
}

export function mealPlan(
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

export function templateFromInput(
  idValue: string,
  input: CreateChoreTemplateRequest | UpdateChoreTemplateRequest,
  archived = false,
  sortOrder = 0,
): ChoreTemplate {
  return ChoreTemplateSchema.parse({
    id: idValue,
    title: input.title,
    description: input.description,
    assignees: input.assigneeIds.map(demoMember),
    routineLabel: input.routineLabel,
    availableFromTime: input.availableFromTime,
    dueTime: input.dueTime,
    sortOrder,
    repeat: input.repeat,
    repeatDays: input.repeatDays,
    activeFrom: input.activeFrom,
    activeUntil: input.repeat === 'once' ? input.activeFrom : null,
    archived,
  });
}

export function demoMember(memberId: string): Member {
  const member = createDemoSeed().household.members.find((candidate) => candidate.id === memberId);
  if (member === undefined) throw new RepositoryError('NOT_FOUND', 'That person was not found.');
  return member;
}

export function list(
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

export function item(idValue: string, text: string, checked = false): ListItem {
  return ListItemSchema.parse({
    id: idValue,
    text,
    quantity: null,
    checked,
    checkedAt: checked ? '2026-08-03T07:12:00+08:00' : null,
    checkedByActorId: checked ? 'member_maya' : null,
  });
}

export function refreshListCounts(listValue: HouseholdList): void {
  listValue.remainingCount = listValue.items.filter((entry) => !entry.checked).length;
  listValue.totalCount = listValue.items.length;
}

export function sameText(left: string, right: string): boolean {
  return normaliseListItemText(left) === normaliseListItemText(right);
}

export function assertExactOrder(
  currentIds: readonly string[],
  orderedIds: readonly string[],
  message: string,
) {
  if (
    currentIds.length !== orderedIds.length ||
    currentIds.some((idValue) => !orderedIds.includes(idValue)) ||
    new Set(orderedIds).size !== orderedIds.length
  ) {
    throw new RepositoryError('CONFLICT', message);
  }
}

export function sortSavedMeals(meals: readonly SavedMeal[]): SavedMeal[] {
  return meals.toSorted(
    (first, second) =>
      Number(second.favourite) - Number(first.favourite) || first.name.localeCompare(second.name),
  );
}

export function localDateInWeek(localDate: string, startDate: string): boolean {
  return localDate >= startDate && localDate <= addLocalDays(startDate, 6);
}

export function shiftLocalDateBetweenWeeks(
  localDate: string,
  sourceStartDate: string,
  targetStartDate: string,
): string {
  const offset = Math.round(
    (Date.parse(`${localDate}T12:00:00Z`) - Date.parse(`${sourceStartDate}T12:00:00Z`)) /
      86_400_000,
  );
  return addLocalDays(targetStartDate, offset);
}

export function mealWeekTargetId(startDate: string): string {
  return `meal_week_${startDate.replaceAll('-', '_')}`;
}

export function audit(
  action: AuditSummary['action'],
  targetId: string,
  actor: CommandActor,
  result: AuditSummary['result'] = 'succeeded',
  occurredAt = new Date().toISOString(),
): AuditSummary {
  return {
    id: id('audit'),
    actorType: actor.type,
    actorId: actor.id,
    source: actor.source,
    action,
    targetId,
    occurredAt,
    result,
  };
}

export function id(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '_')}`;
}

export function listFromRow(row: ListRow, items: ListItem[]): HouseholdList {
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

export function listItemFromRow(row: ListItemRow): ListItem {
  return ListItemSchema.parse({
    id: row.id,
    text: row.text,
    quantity: row.quantity,
    checked: row.checked_at !== null,
    checkedAt: row.checked_at,
    checkedByActorId: row.checked_by_actor_id,
  });
}

export function savedMealFromRow(row: SavedMealRow): SavedMeal {
  return SavedMealSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description,
    preparationMinutes: row.preparation_minutes,
    favourite: row.favourite === 1,
    archivedAt: row.archived_at,
  });
}

export function mealFromRow(row: MealRow) {
  return MealPlanEntrySchema.parse({
    id: row.id,
    localDate: row.local_date,
    slot: row.meal_slot,
    mealName: row.meal_name_snapshot,
    savedMealId: row.saved_meal_id,
    note: row.note,
  });
}

export function choreTemplatesFromRows(rows: ChoreTemplateRow[]): ChoreTemplate[] {
  const grouped = new Map<string, ChoreTemplateRow[]>();
  for (const row of rows) {
    const templateRows = grouped.get(row.id);
    if (templateRows === undefined) grouped.set(row.id, [row]);
    else templateRows.push(row);
  }
  return [...grouped.values()].map(choreTemplateFromRows);
}

export function choreTemplateFromRows(rows: ChoreTemplateRow[]): ChoreTemplate {
  const row = rows[0];
  if (row === undefined) throw new RepositoryError('NOT_FOUND', 'That chore was not found.');
  return ChoreTemplateSchema.parse({
    id: row.id,
    title: row.title,
    description: row.description,
    assignees: rows.map(memberFromRow),
    routineLabel: row.routine_label,
    availableFromTime: row.available_from_time,
    dueTime: row.due_time,
    sortOrder: row.sort_order,
    ...choreRepeatFromRule(row.recurrence_rule),
    activeFrom: row.active_from,
    activeUntil: row.active_until,
    archived: row.archived_at !== null,
  });
}

export function memberFromRow(row: MemberRow): Member {
  return MemberSchema.parse({
    id: row.member_id ?? row.id,
    displayName: row.display_name,
    color: row.colour,
    avatarUrl: row.avatar_key ?? '/brand/hearth-mark.png',
    role: row.role,
    capabilities: JSON.parse(row.capabilities_json) as unknown,
  });
}

export function isUniqueError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('UNIQUE constraint failed');
}

export interface ListRow {
  id: string;
  name: string;
  list_type: HouseholdList['type'];
  colour: string;
  archived_at: string | null;
}

export interface ListItemRow {
  id: string;
  text: string;
  quantity: string | null;
  checked_at: string | null;
  checked_by_actor_id: string | null;
}

export interface SavedMealRow {
  id: string;
  name: string;
  description: string | null;
  preparation_minutes: number | null;
  favourite: 0 | 1;
  archived_at: string | null;
}

export interface MealRow {
  id: string;
  local_date: string;
  meal_slot: 'breakfast' | 'lunch' | 'dinner';
  meal_name_snapshot: string;
  saved_meal_id: string | null;
  note: string | null;
}

export interface MemberRow {
  id?: string;
  member_id?: string;
  display_name: string;
  colour: string;
  avatar_key: string | null;
  role: 'adult' | 'child';
  capabilities_json: string;
}

export interface ChoreTemplateRow extends MemberRow {
  id: string;
  title: string;
  description: string | null;
  recurrence_rule: string;
  routine_label: string;
  available_from_time: string | null;
  due_time: string | null;
  sort_order: number;
  points_value: number;
  active_from: string;
  active_until: string | null;
  archived_at: string | null;
}
