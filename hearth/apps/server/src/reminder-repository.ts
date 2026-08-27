import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';
import type { z } from 'zod';

import {
  AuditSummarySchema,
  HearthReminderSchema,
  ReminderCommandResultSchema,
  ReminderDeletionResultSchema,
  ReminderOverviewSchema,
  type AuditSummary,
  type CreateReminderRequest,
  type HearthReminder,
  type HearthReminderList,
  type ReminderCommandResult,
  type ReminderDeletionResult,
  type ReminderOverview,
  type SetReminderCompletionRequest,
  type UpdateReminderRequest,
} from '@hearth/shared';

import { DEMO_HOUSEHOLD_ID, DEMO_LOCAL_DATE, DEMO_NOW } from './demo/seed.js';
import { type AdminRepository } from './admin-repository.js';
import { type CommandActor, RepositoryError } from './repository.js';
import { FixedClock, type HearthClock } from './runtime-context.js';

type ReminderAction =
  | 'reminder.create'
  | 'reminder.update'
  | 'reminder.complete'
  | 'reminder.reopen'
  | 'reminder.delete';

interface StoredList {
  id: string;
  householdId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

interface StoredReminder extends HearthReminder {
  householdId: string;
  deletedAt: string | null;
}

interface ReminderRow {
  id: string;
  household_id: string;
  list_id: string;
  title: string;
  due_local_date: string | null;
  due_at: string | null;
  has_due_time: number;
  is_completed: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface ListRow {
  id: string;
  household_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface ReminderRepository {
  getOverview(householdId: string, includeCompleted: boolean): Promise<ReminderOverview>;
  create(
    householdId: string,
    input: CreateReminderRequest,
    actor: CommandActor,
  ): Promise<ReminderCommandResult>;
  update(
    householdId: string,
    reminderId: string,
    input: UpdateReminderRequest,
    actor: CommandActor,
  ): Promise<ReminderCommandResult>;
  setCompletion(
    householdId: string,
    reminderId: string,
    input: SetReminderCompletionRequest,
    actor: CommandActor,
  ): Promise<ReminderCommandResult>;
  delete(
    householdId: string,
    reminderId: string,
    requestId: string,
    actor: CommandActor,
  ): Promise<ReminderDeletionResult>;
  reset(): void;
  close(): void;
}

export class ReminderService implements ReminderRepository {
  private readonly clock: HearthClock;
  private lists: StoredList[];
  private reminders: StoredReminder[];
  private readonly receipts = new Map<string, unknown>();

  constructor(
    private readonly adminRepository: AdminRepository,
    private readonly database?: InstanceType<typeof Database>,
    private readonly options: { seedDemo?: boolean; clock?: HearthClock } = {},
  ) {
    this.clock = options.clock ?? new FixedClock(DEMO_NOW);
    const seedDemo = options.seedDemo ?? true;
    this.lists = seedDemo ? [demoList()] : [];
    this.reminders = seedDemo ? demoReminders() : [];
    if (database !== undefined && seedDemo) this.seedDemo();
  }

  async getOverview(householdId: string, includeCompleted: boolean): Promise<ReminderOverview> {
    this.assertHousehold(householdId);
    this.ensureDefaultList(householdId);
    const lists = this.readLists(householdId);
    const allReminders = this.readReminders(householdId);
    const visibleReminders = includeCompleted
      ? allReminders
      : allReminders.filter((reminder) => !reminder.isCompleted);
    return ReminderOverviewSchema.parse({
      householdId,
      generatedAt: this.clock.now().toISOString(),
      lists: lists.map((list) => listSummary(list, allReminders)),
      reminders: visibleReminders.map(publicReminder).toSorted(compareReminders),
    });
  }

  async create(
    householdId: string,
    input: CreateReminderRequest,
    actor: CommandActor,
  ): Promise<ReminderCommandResult> {
    this.assertHousehold(householdId);
    return this.replayOrRun(
      householdId,
      input.requestId,
      'reminder-create',
      ReminderCommandResultSchema,
      () => {
        const now = this.clock.now().toISOString();
        const reminder: StoredReminder = {
          id: opaqueId('reminder'),
          householdId,
          listId: this.ensureDefaultList(householdId).id,
          title: input.title,
          dueLocalDate: input.dueLocalDate,
          dueAt: input.dueAt,
          hasDueTime: input.hasDueTime,
          isCompleted: false,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        this.insertReminder(reminder);
        return this.commandResult(reminder, 'reminder.create', actor, input.requestId);
      },
    );
  }

  async update(
    householdId: string,
    reminderId: string,
    input: UpdateReminderRequest,
    actor: CommandActor,
  ): Promise<ReminderCommandResult> {
    this.assertHousehold(householdId);
    return this.replayOrRun(
      householdId,
      input.requestId,
      'reminder-update',
      ReminderCommandResultSchema,
      () => {
        const current = this.findReminder(householdId, reminderId);
        const updated: StoredReminder = {
          ...current,
          title: input.title,
          dueLocalDate: input.dueLocalDate,
          dueAt: input.dueAt,
          hasDueTime: input.hasDueTime,
          updatedAt: this.clock.now().toISOString(),
        };
        this.writeReminder(updated);
        return this.commandResult(updated, 'reminder.update', actor, input.requestId);
      },
    );
  }

  async setCompletion(
    householdId: string,
    reminderId: string,
    input: SetReminderCompletionRequest,
    actor: CommandActor,
  ): Promise<ReminderCommandResult> {
    this.assertHousehold(householdId);
    return this.replayOrRun(
      householdId,
      input.requestId,
      'reminder-completion',
      ReminderCommandResultSchema,
      () => {
        const current = this.findReminder(householdId, reminderId);
        const now = this.clock.now().toISOString();
        const updated: StoredReminder = {
          ...current,
          isCompleted: input.isCompleted,
          completedAt: input.isCompleted ? now : null,
          updatedAt: now,
        };
        this.writeReminder(updated);
        return this.commandResult(
          updated,
          input.isCompleted ? 'reminder.complete' : 'reminder.reopen',
          actor,
          input.requestId,
        );
      },
    );
  }

  async delete(
    householdId: string,
    reminderId: string,
    requestId: string,
    actor: CommandActor,
  ): Promise<ReminderDeletionResult> {
    this.assertHousehold(householdId);
    return this.replayOrRun(
      householdId,
      requestId,
      'reminder-delete',
      ReminderDeletionResultSchema,
      () => {
        const current = this.findReminder(householdId, reminderId);
        const deletedAt = this.clock.now().toISOString();
        this.writeReminder({ ...current, deletedAt, updatedAt: deletedAt });
        const audit = this.audit('reminder.delete', reminderId, actor);
        this.adminRepository.recordActivity(householdId, audit, requestId);
        return ReminderDeletionResultSchema.parse({ reminderId, audit, replayed: false });
      },
    );
  }

  reset(): void {
    if (this.database === undefined) {
      this.lists = this.options.seedDemo === false ? [] : [demoList()];
      this.reminders = this.options.seedDemo === false ? [] : demoReminders();
      this.receipts.clear();
      return;
    }
    if (this.options.seedDemo === false) return;
    this.database.transaction(() => {
      this.database!.prepare('DELETE FROM hearth_reminders WHERE household_id = ?').run(
        DEMO_HOUSEHOLD_ID,
      );
      this.database!.prepare('DELETE FROM hearth_reminder_lists WHERE household_id = ?').run(
        DEMO_HOUSEHOLD_ID,
      );
      this.database!.prepare(
        `DELETE FROM command_receipts
         WHERE household_id = ? AND command_type LIKE 'reminder-%'`,
      ).run(DEMO_HOUSEHOLD_ID);
      this.database!.prepare(
        `DELETE FROM audit_events
         WHERE household_id = ? AND action_type IN (
           'reminder.create', 'reminder.update', 'reminder.complete',
           'reminder.reopen', 'reminder.delete'
         )`,
      ).run(DEMO_HOUSEHOLD_ID);
      this.seedDemo();
    })();
  }

  close(): void {}

  private commandResult(
    reminder: StoredReminder,
    action: Exclude<ReminderAction, 'reminder.delete'>,
    actor: CommandActor,
    requestId: string,
  ): ReminderCommandResult {
    const audit = this.audit(action, reminder.id, actor);
    this.adminRepository.recordActivity(reminder.householdId, audit, requestId);
    return ReminderCommandResultSchema.parse({
      reminder: publicReminder(reminder),
      audit,
      replayed: false,
    });
  }

  private audit(action: ReminderAction, targetId: string, actor: CommandActor): AuditSummary {
    return AuditSummarySchema.parse({
      id: opaqueId('audit'),
      actorType: actor.type,
      actorId: actor.id,
      source: actor.source,
      action,
      targetId,
      occurredAt: this.clock.now().toISOString(),
      result: 'succeeded',
    });
  }

  private replayOrRun<T>(
    householdId: string,
    requestId: string,
    commandType: string,
    schema: z.ZodType<T>,
    execute: () => T,
  ): Promise<T> {
    const key = `${householdId}:${commandType}:${requestId}`;
    const stored = this.readReceipt(householdId, requestId, commandType, schema);
    const memoryStored = this.receipts.get(key);
    if (stored !== undefined) return Promise.resolve(withReplay(stored, schema));
    if (memoryStored !== undefined) return Promise.resolve(withReplay(memoryStored, schema));

    const run = () => {
      const result = schema.parse(execute());
      if (this.database === undefined) this.receipts.set(key, structuredClone(result));
      else this.writeReceipt(householdId, requestId, commandType, result);
      return structuredClone(result);
    };
    return Promise.resolve(this.database === undefined ? run() : this.database.transaction(run)());
  }

  private readReceipt<T>(
    householdId: string,
    requestId: string,
    commandType: string,
    schema: z.ZodType<T>,
  ): T | undefined {
    if (this.database === undefined) return undefined;
    const row = this.database
      .prepare(
        `SELECT response_json FROM command_receipts
         WHERE household_id = ? AND request_id = ? AND command_type = ?`,
      )
      .get(householdId, requestId, commandType) as { response_json: string } | undefined;
    return row === undefined ? undefined : schema.parse(JSON.parse(row.response_json));
  }

  private writeReceipt(
    householdId: string,
    requestId: string,
    commandType: string,
    result: unknown,
  ): void {
    this.database!.prepare(
      `INSERT INTO command_receipts
        (household_id, request_id, command_type, response_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      householdId,
      requestId,
      commandType,
      JSON.stringify(result),
      this.clock.now().toISOString(),
    );
  }

  private ensureDefaultList(householdId: string): StoredList {
    const existing = this.readLists(householdId)[0];
    if (existing !== undefined) return existing;
    const now = this.clock.now().toISOString();
    const created: StoredList = {
      id: opaqueId('reminder_list'),
      householdId,
      title: 'Reminders',
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    if (this.database === undefined) this.lists.push(created);
    else
      this.database
        .prepare(
          `INSERT INTO hearth_reminder_lists
            (id, household_id, title, created_at, updated_at, archived_at)
           VALUES (?, ?, ?, ?, ?, NULL)`,
        )
        .run(created.id, householdId, created.title, now, now);
    return created;
  }

  private readLists(householdId: string): StoredList[] {
    if (this.database === undefined)
      return this.lists
        .filter((list) => list.householdId === householdId && list.archivedAt === null)
        .map((list) => structuredClone(list));
    const rows = this.database
      .prepare(
        `SELECT id, household_id, title, created_at, updated_at, archived_at
         FROM hearth_reminder_lists
         WHERE household_id = ? AND archived_at IS NULL
         ORDER BY created_at, id`,
      )
      .all(householdId) as ListRow[];
    return rows.map(listFromRow);
  }

  private readReminders(householdId: string): StoredReminder[] {
    if (this.database === undefined)
      return this.reminders
        .filter((reminder) => reminder.householdId === householdId && reminder.deletedAt === null)
        .map((reminder) => structuredClone(reminder));
    const rows = this.database
      .prepare(
        `SELECT id, household_id, list_id, title, due_local_date, due_at, has_due_time,
                is_completed, completed_at, created_at, updated_at, deleted_at
         FROM hearth_reminders
         WHERE household_id = ? AND deleted_at IS NULL`,
      )
      .all(householdId) as ReminderRow[];
    return rows.map(reminderFromRow);
  }

  private findReminder(householdId: string, reminderId: string): StoredReminder {
    const reminder = this.readReminders(householdId).find(
      (candidate) => candidate.id === reminderId,
    );
    if (reminder === undefined)
      throw new RepositoryError('NOT_FOUND', 'That reminder could not be found.');
    return reminder;
  }

  private insertReminder(reminder: StoredReminder): void {
    if (this.database === undefined) {
      this.reminders.push(structuredClone(reminder));
      return;
    }
    this.database
      .prepare(
        `INSERT INTO hearth_reminders
          (id, household_id, list_id, title, due_local_date, due_at, has_due_time,
           is_completed, completed_at, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        reminder.id,
        reminder.householdId,
        reminder.listId,
        reminder.title,
        reminder.dueLocalDate,
        reminder.dueAt,
        reminder.hasDueTime ? 1 : 0,
        reminder.isCompleted ? 1 : 0,
        reminder.completedAt,
        reminder.createdAt,
        reminder.updatedAt,
        reminder.deletedAt,
      );
  }

  private writeReminder(reminder: StoredReminder): void {
    if (this.database === undefined) {
      const index = this.reminders.findIndex((candidate) => candidate.id === reminder.id);
      if (index < 0) throw new RepositoryError('NOT_FOUND', 'That reminder could not be found.');
      this.reminders[index] = structuredClone(reminder);
      return;
    }
    const result = this.database
      .prepare(
        `UPDATE hearth_reminders
         SET title = ?, due_local_date = ?, due_at = ?, has_due_time = ?,
             is_completed = ?, completed_at = ?, updated_at = ?, deleted_at = ?
         WHERE id = ? AND household_id = ? AND deleted_at IS NULL`,
      )
      .run(
        reminder.title,
        reminder.dueLocalDate,
        reminder.dueAt,
        reminder.hasDueTime ? 1 : 0,
        reminder.isCompleted ? 1 : 0,
        reminder.completedAt,
        reminder.updatedAt,
        reminder.deletedAt,
        reminder.id,
        reminder.householdId,
      );
    if (result.changes !== 1)
      throw new RepositoryError('NOT_FOUND', 'That reminder could not be found.');
  }

  private assertHousehold(householdId: string): void {
    if (this.database === undefined) {
      if (householdId !== DEMO_HOUSEHOLD_ID)
        throw new RepositoryError('NOT_FOUND', 'That household could not be found.');
      return;
    }
    if (
      this.database.prepare('SELECT 1 FROM households WHERE id = ?').get(householdId) === undefined
    )
      throw new RepositoryError('NOT_FOUND', 'That household could not be found.');
  }

  private seedDemo(): void {
    const list = demoList();
    this.database!.prepare(
      `INSERT OR IGNORE INTO hearth_reminder_lists
        (id, household_id, title, created_at, updated_at, archived_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
    ).run(list.id, list.householdId, list.title, list.createdAt, list.updatedAt);
    for (const reminder of demoReminders()) {
      this.database!.prepare(
        `INSERT OR IGNORE INTO hearth_reminders
          (id, household_id, list_id, title, due_local_date, due_at, has_due_time,
           is_completed, completed_at, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      ).run(
        reminder.id,
        reminder.householdId,
        reminder.listId,
        reminder.title,
        reminder.dueLocalDate,
        reminder.dueAt,
        reminder.hasDueTime ? 1 : 0,
        reminder.isCompleted ? 1 : 0,
        reminder.completedAt,
        reminder.createdAt,
        reminder.updatedAt,
      );
    }
  }
}

function publicReminder(reminder: StoredReminder): HearthReminder {
  return HearthReminderSchema.parse({
    id: reminder.id,
    listId: reminder.listId,
    title: reminder.title,
    dueLocalDate: reminder.dueLocalDate,
    dueAt: reminder.dueAt,
    hasDueTime: reminder.hasDueTime,
    isCompleted: reminder.isCompleted,
    completedAt: reminder.completedAt,
    createdAt: reminder.createdAt,
    updatedAt: reminder.updatedAt,
  });
}

function listSummary(list: StoredList, reminders: StoredReminder[]): HearthReminderList {
  const owned = reminders.filter((reminder) => reminder.listId === list.id);
  return {
    id: list.id,
    title: list.title,
    reminderCount: owned.length,
    incompleteCount: owned.filter((reminder) => !reminder.isCompleted).length,
  };
}

function compareReminders(left: HearthReminder, right: HearthReminder): number {
  if (left.isCompleted !== right.isCompleted) return left.isCompleted ? 1 : -1;
  if (left.dueLocalDate === null && right.dueLocalDate !== null) return 1;
  if (left.dueLocalDate !== null && right.dueLocalDate === null) return -1;
  const due = (left.dueAt ?? left.dueLocalDate ?? '').localeCompare(
    right.dueAt ?? right.dueLocalDate ?? '',
  );
  if (due !== 0) return due;
  return left.createdAt.localeCompare(right.createdAt);
}

function listFromRow(row: ListRow): StoredList {
  return {
    id: row.id,
    householdId: row.household_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function reminderFromRow(row: ReminderRow): StoredReminder {
  return {
    id: row.id,
    householdId: row.household_id,
    listId: row.list_id,
    title: row.title,
    dueLocalDate: row.due_local_date,
    dueAt: row.due_at,
    hasDueTime: row.has_due_time === 1,
    isCompleted: row.is_completed === 1,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function withReplay<T>(value: unknown, schema: z.ZodType<T>): T {
  return schema.parse({ ...(value as object), replayed: true });
}

function opaqueId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

function demoList(): StoredList {
  return {
    id: 'reminder_list_demo',
    householdId: DEMO_HOUSEHOLD_ID,
    title: 'Reminders',
    createdAt: DEMO_NOW,
    updatedAt: DEMO_NOW,
    archivedAt: null,
  };
}

function demoReminders(): StoredReminder[] {
  return [
    demoReminder('reminder_demo_bins', 'Put the bins out', DEMO_LOCAL_DATE),
    demoReminder('reminder_demo_library', 'Return library books', null),
    demoReminder('reminder_demo_uniform', 'Order school uniform', '2026-08-06'),
  ];
}

function demoReminder(id: string, title: string, dueLocalDate: string | null): StoredReminder {
  return {
    id,
    householdId: DEMO_HOUSEHOLD_ID,
    listId: 'reminder_list_demo',
    title,
    dueLocalDate,
    dueAt: null,
    hasDueTime: false,
    isCompleted: false,
    completedAt: null,
    createdAt: DEMO_NOW,
    updatedAt: DEMO_NOW,
    deletedAt: null,
  };
}
