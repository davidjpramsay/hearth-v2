import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import {
  ChoreDomainError,
  addLocalDays,
  completeChore,
  createMonthGrid,
  isChoreDueOnDate,
  localDateInTimezone,
  skipChore,
  sortByStart,
  undoChore,
} from '@hearth/core';
import {
  ChoreCommandResultSchema,
  ChoreOccurrenceSchema,
  ChoreSkipResultSchema,
  MemberSchema,
  type AuditSummary,
  type ChoreCommandResult,
  type ChoreList,
  type ChoreOccurrence,
  type ChoreSkipResult,
  type DemoScenario,
  type Member,
  type MonthSchedule,
  type TodaySummary,
  type WeekDay,
  type WeekSchedule,
} from '@hearth/shared';

import { CalendarProjectionService, type CalendarProjectionMode } from './calendar-projection.js';
import { createDemoCalendarFixture } from './demo/calendar-fixture.js';
import {
  createDemoSeed,
  demoForecastForDay,
  DEMO_HOUSEHOLD_ID,
  DEMO_LOCAL_DATE,
  DEMO_NOW,
  DEMO_TODAY_PHOTO,
} from './demo/seed.js';
import { FakeCalendarProvider, type CalendarProvider } from './integrations/calendar-provider.js';
import { RepositoryError, type CommandActor, type HearthRepository } from './repository.js';
import { FixedClock, type HearthClock } from './runtime-context.js';

const TEMPLATE_RULES = new Map<string, string>([
  ['occurrence_school_bag', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'],
  ['occurrence_feed_pepper', 'FREQ=DAILY'],
  ['occurrence_dishes', 'FREQ=DAILY'],
  ['occurrence_laundry', 'FREQ=WEEKLY;BYDAY=MO,TH'],
  ['occurrence_herbs', 'FREQ=DAILY'],
  ['occurrence_make_bed', 'FREQ=DAILY'],
]);

export class SqliteHearthRepository implements HearthRepository {
  private scenario: DemoScenario = 'healthy';
  private readonly calendar: CalendarProjectionService;
  private readonly seedCalendarSnapshot: (() => void) | null;
  private readonly demoSeedEnabled: boolean;
  private readonly clock: HearthClock;

  constructor(
    private readonly database: InstanceType<typeof Database>,
    options: {
      calendarProvider?: CalendarProvider;
      ownerForCalendarExternalId?: (externalId: string) => string | null;
      seedDemo?: boolean;
      clock?: HearthClock;
    } = {},
  ) {
    this.demoSeedEnabled = options.seedDemo ?? true;
    this.clock = options.clock ?? new FixedClock(DEMO_NOW);
    if (this.demoSeedEnabled) this.seedDemo();
    const fixture = createDemoCalendarFixture();
    const demoProvider = new FakeCalendarProvider(fixture.calendars, fixture.events);
    const provider = options.calendarProvider ?? demoProvider;
    const ownerForCalendarExternalId =
      options.ownerForCalendarExternalId ??
      ((externalId: string) => fixture.ownerByCalendarExternalId.get(externalId) ?? null);
    this.calendar = new CalendarProjectionService(
      this.database,
      provider,
      ownerForCalendarExternalId,
    );
    this.seedCalendarSnapshot =
      options.calendarProvider === undefined && this.demoSeedEnabled
        ? () => {
            this.calendar.seedSnapshot(DEMO_HOUSEHOLD_ID, {
              calendars: fixture.calendars,
              events: fixture.events,
              cursor: demoProvider.currentCursor(),
              syncedAt: fixture.syncedAt,
              startDate: '2026-08-03',
              endDate: '2026-08-09',
            });
          }
        : null;
    if (!this.calendar.hasSnapshot() && this.seedCalendarSnapshot !== null) {
      this.seedCalendarSnapshot();
    }
  }

  private resetCalendarSnapshot(): void {
    if (this.seedCalendarSnapshot !== null) {
      this.seedCalendarSnapshot();
    }
  }

  async getToday(householdId: string, localDate: string): Promise<TodaySummary> {
    this.assertHousehold(householdId);
    await this.applyLatency();
    const seed = createDemoSeed();
    const projection = await this.calendar.projectRange(
      householdId,
      localDate,
      localDate,
      this.calendarMode(),
    );
    const isEmpty = this.scenario === 'empty';
    const chores = isEmpty ? [] : this.readOccurrences(householdId, localDate);

    const household = this.readHousehold(householdId);
    const now = this.clock.now();
    return {
      household,
      localDate,
      generatedAt: now.toISOString(),
      displayTime: new Intl.DateTimeFormat(household.locale, {
        timeZone: household.timezone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: false,
      }).format(now),
      displayDate: displayDate(localDate, household.locale),
      weather: this.demoSeedEnabled ? { temperatureCelsius: 16, condition: 'Clear' } : null,
      freshness: projection.freshness,
      statusMessage: projection.statusMessage,
      calendars: projection.calendars,
      events: isEmpty
        ? []
        : sortByStart(projection.events).filter((event) => event.id !== 'event_family_dinner_mon'),
      chores,
      dinner: isEmpty || !this.demoSeedEnabled ? null : 'Lemon chicken & roast vegetables',
      listSummary:
        isEmpty || !this.demoSeedEnabled ? null : { name: 'Groceries', remainingCount: 6 },
      notice: isEmpty || !this.demoSeedEnabled ? null : 'Bins go out tonight',
      photo: isEmpty || !this.demoSeedEnabled ? null : DEMO_TODAY_PHOTO,
      sections: { dinner: true, listSummary: true, notice: true, photo: true },
      integrations: this.demoSeedEnabled
        ? seed.integrations.map((integration) =>
            integration.kind === 'calendar' ? projection.integration : integration,
          )
        : [
            projection.integration,
            {
              kind: 'home-assistant',
              status: 'not-configured',
              lastSuccessfulAt: null,
              message: 'Home Assistant is not connected yet.',
            },
          ],
    };
  }

  async getWeek(householdId: string, startDate: string): Promise<WeekSchedule> {
    this.assertHousehold(householdId);
    await this.applyLatency();
    const endDate = addLocalDays(startDate, 6);
    const projection = await this.calendar.projectRange(
      householdId,
      startDate,
      endDate,
      this.calendarMode(),
    );
    return {
      householdId,
      startDate,
      endDate,
      displayRange: displayRange(startDate, endDate),
      freshness: projection.freshness,
      statusMessage: projection.statusMessage,
      days: createWeekDays(startDate, this.currentLocalDate(householdId), this.demoSeedEnabled),
      calendars: projection.calendars,
      events: this.scenario === 'empty' ? [] : sortByStart(projection.events),
    };
  }

  async getMonth(householdId: string, month: string): Promise<MonthSchedule> {
    this.assertHousehold(householdId);
    await this.applyLatency();
    const grid = createMonthGrid(month, this.currentLocalDate(householdId));
    const projection = await this.calendar.projectRange(
      householdId,
      grid.startDate,
      grid.endDate,
      this.calendarMode(),
    );
    return {
      householdId,
      month,
      gridStartDate: grid.startDate,
      gridEndDate: grid.endDate,
      displayMonth: monthName(month),
      displayYear: month.slice(0, 4),
      freshness: projection.freshness,
      statusMessage: projection.statusMessage,
      days: grid.days,
      calendars: projection.calendars,
      events: this.scenario === 'empty' ? [] : sortByStart(projection.events),
    };
  }

  async getChores(householdId: string, localDate: string): Promise<ChoreList> {
    this.assertHousehold(householdId);
    await this.applyLatency();
    const occurrences =
      this.scenario === 'empty' ? [] : this.readOccurrences(householdId, localDate);
    const household = this.readHousehold(householdId);
    const members = this.readMembers(householdId);
    return {
      householdId,
      localDate,
      displayDate: displayDate(localDate, household.locale),
      completedCount: occurrences.filter((item) => item.state === 'completed').length,
      totalCount: occurrences.length,
      groups: members.map((member) => ({
        member,
        occurrences: occurrences.filter((occurrence) => occurrence.assignee.id === member.id),
      })),
    };
  }

  async complete(
    householdId: string,
    occurrenceId: string,
    requestId: string,
    actor: CommandActor,
  ): Promise<ChoreCommandResult> {
    this.assertHousehold(householdId);
    this.failNextIfRequested(householdId, occurrenceId, requestId, actor, 'chore.complete');
    return this.runCommand(
      householdId,
      occurrenceId,
      requestId,
      actor,
      'complete',
      ChoreCommandResultSchema,
      (occurrence, context) => {
        const result = completeChore(occurrence, context);
        this.database
          .prepare(
            `UPDATE chore_occurrences
             SET state = 'completed', completion_id = ?, completed_at = ?, completed_by_actor_id = ?,
                 skipped_at = NULL, skipped_by_actor_id = NULL, updated_at = ? WHERE id = ?`,
          )
          .run(
            result.occurrence.completionId,
            result.occurrence.completedAt,
            actor.id,
            context.occurredAt,
            occurrenceId,
          );
        return {
          occurrence: result.occurrence,
          completionId: result.occurrence.completionId ?? context.completionId,
          audit: result.audit,
          replayed: false,
        };
      },
    );
  }

  async undo(
    householdId: string,
    occurrenceId: string,
    requestId: string,
    completionId: string,
    actor: CommandActor,
  ): Promise<ChoreCommandResult> {
    this.assertHousehold(householdId);
    this.failNextIfRequested(householdId, occurrenceId, requestId, actor, 'chore.undo');
    return this.runCommand(
      householdId,
      occurrenceId,
      requestId,
      actor,
      'undo',
      ChoreCommandResultSchema,
      (occurrence, context) => {
        const result = undoChore(occurrence, completionId, context);
        this.database
          .prepare(
            `UPDATE chore_occurrences
             SET state = 'pending', completion_id = NULL, completed_at = NULL,
                 completed_by_actor_id = NULL, updated_at = ? WHERE id = ?`,
          )
          .run(context.occurredAt, occurrenceId);
        return {
          occurrence: result.occurrence,
          completionId,
          audit: result.audit,
          replayed: false,
        };
      },
    );
  }

  async skip(
    householdId: string,
    occurrenceId: string,
    requestId: string,
    actor: CommandActor,
  ): Promise<ChoreSkipResult> {
    this.assertHousehold(householdId);
    this.failNextIfRequested(householdId, occurrenceId, requestId, actor, 'chore.skip');
    return this.runCommand(
      householdId,
      occurrenceId,
      requestId,
      actor,
      'skip',
      ChoreSkipResultSchema,
      (occurrence, context) => {
        const result = skipChore(occurrence, context);
        this.database
          .prepare(
            `UPDATE chore_occurrences
             SET state = 'skipped', completion_id = NULL, completed_at = NULL,
                 completed_by_actor_id = NULL, skipped_at = ?, skipped_by_actor_id = ?, updated_at = ?
             WHERE id = ?`,
          )
          .run(context.occurredAt, actor.id, context.occurredAt, occurrenceId);
        return { occurrence: result.occurrence, audit: result.audit, replayed: false };
      },
    );
  }

  reset(): void {
    this.calendar.clear();
    this.database.exec(
      `DELETE FROM command_receipts;
       DELETE FROM audit_events;
       DELETE FROM chore_occurrences;
       DELETE FROM chore_template_assignees;
       DELETE FROM chore_templates;`,
    );
    this.scenario = 'healthy';
    if (this.demoSeedEnabled) {
      this.seedDemo();
      this.resetCalendarSnapshot();
    }
  }

  setScenario(scenario: DemoScenario): void {
    this.scenario = scenario;
  }

  private runCommand<T extends ChoreCommandResult | ChoreSkipResult>(
    householdId: string,
    occurrenceId: string,
    requestId: string,
    actor: CommandActor,
    commandType: 'complete' | 'undo' | 'skip',
    schema: { parse(value: unknown): T },
    mutate: (
      occurrence: ChoreOccurrence,
      context: ReturnType<SqliteHearthRepository['createContext']>,
    ) => T,
  ): T {
    const transaction = this.database.transaction(() => {
      const receipt = this.readReceipt(householdId, requestId, commandType, schema);
      if (receipt !== null) return { ...receipt, replayed: true } as T;
      const occurrence = this.readOccurrence(householdId, occurrenceId);
      const context = this.createContext(requestId, actor);
      this.authorize(householdId, actor, occurrence, commandType);
      const response = mutate(this.withScenarioPermission(occurrence), context);
      this.writeAudit(householdId, response.audit, requestId);
      this.database
        .prepare(
          `INSERT INTO command_receipts
            (household_id, request_id, command_type, response_json, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(householdId, requestId, commandType, JSON.stringify(response), context.occurredAt);
      return schema.parse(response);
    });

    try {
      return transaction();
    } catch (error) {
      const translated = translateError(error);
      if (translated instanceof RepositoryError) {
        this.writeRejectedAudit(
          householdId,
          occurrenceId,
          requestId,
          actor,
          commandType,
          translated,
        );
      }
      throw translated;
    }
  }

  private authorize(
    householdId: string,
    actor: CommandActor,
    occurrence: ChoreOccurrence,
    action: 'complete' | 'undo' | 'skip',
  ): void {
    if (actor.type === 'device') {
      if (actor.source !== 'tv' || action === 'skip') {
        throw new RepositoryError('FORBIDDEN', 'Ask an adult to skip this.');
      }
      const row = this.database
        .prepare(
          `SELECT scopes_json FROM paired_devices
           WHERE id = ? AND household_id = ? AND revoked_at IS NULL`,
        )
        .get(actor.id, householdId) as { scopes_json: string } | undefined;
      if (
        row === undefined ||
        !(JSON.parse(row.scopes_json) as unknown[]).includes('chores.complete')
      ) {
        throw new RepositoryError('UNAUTHENTICATED', 'This device is not paired with Hearth.');
      }
      return;
    }

    if (actor.type === 'service') {
      if (
        !['automation', 'voice'].includes(actor.source) ||
        actor.id !== 'service_home_assistant' ||
        action === 'skip'
      ) {
        throw new RepositoryError('FORBIDDEN', 'That automation cannot change this chore.');
      }
      return;
    }

    if (actor.source !== 'companion' && actor.source !== 'voice') {
      throw new RepositoryError('UNAUTHENTICATED', 'Sign in to change this chore.');
    }
    const row = this.database
      .prepare(
        `SELECT role, capabilities_json FROM members
         WHERE id = ? AND household_id = ? AND archived_at IS NULL`,
      )
      .get(actor.id, householdId) as
      { role: 'adult' | 'child'; capabilities_json: string } | undefined;
    if (row === undefined) throw new RepositoryError('UNAUTHENTICATED', 'Sign in to continue.');
    const capabilities = JSON.parse(row.capabilities_json) as string[];
    if (!capabilities.includes('chores.complete')) {
      throw new RepositoryError('FORBIDDEN', 'You cannot change chores.');
    }
    if (row.role === 'adult') return;
    if (action !== 'skip' && occurrence.assignee.id === actor.id) return;
    throw new RepositoryError('FORBIDDEN', 'Ask an adult to change this.');
  }

  private generateOccurrences(householdId: string, localDate: string): void {
    const rows = this.database
      .prepare(
        `SELECT t.id, t.title, t.recurrence_rule, t.routine_label, t.active_from, t.active_until,
                a.member_id
         FROM chore_templates t
         JOIN chore_template_assignees a ON a.template_id = t.id
         JOIN members m ON m.id = a.member_id AND m.archived_at IS NULL
         WHERE t.household_id = ? AND t.archived_at IS NULL`,
      )
      .all(householdId) as TemplateRow[];
    const insert = this.database.prepare(
      `INSERT OR IGNORE INTO chore_occurrences
        (id, household_id, template_id, scheduled_local_date, instance_key, title_snapshot,
         routine_label_snapshot, assignee_member_id, state, completion_id, completed_at,
         completed_by_actor_id, created_at, updated_at, skipped_at, skipped_by_actor_id)
       VALUES (?, ?, ?, ?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    );
    const demoByTitleAndMember = new Map(
      createDemoSeed().chores.map((chore) => [`${chore.title}:${chore.assignee.id}`, chore]),
    );
    const transaction = this.database.transaction(() => {
      for (const row of rows) {
        if (!isChoreDueOnDate(row.recurrence_rule, localDate, row.active_from, row.active_until)) {
          continue;
        }
        const demoOccurrence = demoByTitleAndMember.get(`${row.title}:${row.member_id}`);
        const id =
          localDate === DEMO_LOCAL_DATE && demoOccurrence !== undefined
            ? demoOccurrence.id
            : occurrenceId(row.id, row.member_id, localDate);
        const isSeedCompletion =
          localDate === DEMO_LOCAL_DATE && demoOccurrence?.state === 'completed';
        insert.run(
          id,
          householdId,
          row.id,
          localDate,
          row.title,
          row.routine_label,
          row.member_id,
          isSeedCompletion ? 'completed' : 'pending',
          isSeedCompletion ? demoOccurrence.completionId : null,
          isSeedCompletion ? demoOccurrence.completedAt : null,
          isSeedCompletion ? 'system_seed' : null,
          DEMO_NOW,
          DEMO_NOW,
        );
      }
    });
    transaction();
  }

  private readOccurrences(householdId: string, localDate: string): ChoreOccurrence[] {
    this.generateOccurrences(householdId, localDate);
    const rows = this.database
      .prepare(
        `SELECT o.*, m.display_name, m.colour, m.avatar_key, m.role, m.capabilities_json
         FROM chore_occurrences o
         JOIN members m ON m.id = o.assignee_member_id
         JOIN chore_templates t ON t.id = o.template_id
         WHERE o.household_id = ? AND o.scheduled_local_date = ?
         ORDER BY t.created_at, o.id`,
      )
      .all(householdId, localDate) as OccurrenceRow[];
    return rows.map((row) => this.occurrenceFromRow(row));
  }

  private readOccurrence(householdId: string, occurrenceIdValue: string): ChoreOccurrence {
    const row = this.database
      .prepare(
        `SELECT o.*, m.display_name, m.colour, m.avatar_key, m.role, m.capabilities_json
         FROM chore_occurrences o JOIN members m ON m.id = o.assignee_member_id
         WHERE o.id = ? AND o.household_id = ?`,
      )
      .get(occurrenceIdValue, householdId) as OccurrenceRow | undefined;
    if (row === undefined) throw new RepositoryError('NOT_FOUND', 'That chore could not be found.');
    return this.occurrenceFromRow(row);
  }

  private occurrenceFromRow(row: OccurrenceRow): ChoreOccurrence {
    return ChoreOccurrenceSchema.parse({
      id: row.id,
      title: row.title_snapshot,
      assignee: memberFromOccurrenceRow(row),
      routineLabel: row.routine_label_snapshot,
      localDate: row.scheduled_local_date,
      state: row.state,
      completionId: row.completion_id,
      completedAt: row.completed_at,
      completedLabel:
        row.completed_at === null
          ? null
          : completedLabel(row.completed_at, this.readHousehold(row.household_id).timezone),
      locked: this.scenario === 'permission' && row.id === 'occurrence_school_bag',
    });
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

  private writeAudit(
    householdId: string,
    audit: AuditSummary,
    requestId: string,
    targetType = 'chore_occurrence',
  ): void {
    this.database
      .prepare(
        `INSERT INTO audit_events
          (id, occurred_at, household_id, actor_type, actor_id, source_channel, action_type,
           target_type, target_id, request_id, result, safe_summary_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')`,
      )
      .run(
        audit.id,
        audit.occurredAt,
        householdId,
        audit.actorType,
        audit.actorId,
        audit.source,
        audit.action,
        targetType,
        audit.targetId,
        requestId,
        audit.result,
      );
  }

  private writeRejectedAudit(
    householdId: string,
    occurrenceIdValue: string,
    requestId: string,
    actor: CommandActor,
    commandType: 'complete' | 'undo' | 'skip',
    error: RepositoryError,
  ): void {
    this.database
      .prepare(
        `INSERT INTO audit_events
          (id, occurred_at, household_id, actor_type, actor_id, source_channel, action_type,
           target_type, target_id, request_id, result, safe_summary_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'chore_occurrence', ?, ?, 'rejected', ?)`,
      )
      .run(
        id('audit_rejected'),
        this.clock.now().toISOString(),
        householdId,
        actor.type,
        actor.id,
        actor.source,
        `chore.${commandType}`,
        occurrenceIdValue,
        requestId,
        JSON.stringify({ code: error.code }),
      );
  }

  private failNextIfRequested(
    householdId: string,
    occurrenceIdValue: string,
    requestId: string,
    actor: CommandActor,
    action: AuditSummary['action'],
  ): void {
    if (this.scenario !== 'fail-next') return;
    this.scenario = 'healthy';
    const now = this.clock.now().toISOString();
    this.writeAudit(
      householdId,
      {
        id: id('audit_failed'),
        actorType: actor.type,
        actorId: actor.id,
        source: actor.source,
        action,
        targetId: occurrenceIdValue,
        occurredAt: now,
        result: 'failed',
      },
      requestId,
    );
    throw new RepositoryError('COMMAND_FAILED', 'Couldn’t mark this done.', true);
  }

  private createContext(requestId: string, actor: CommandActor) {
    return {
      actorId: actor.id,
      actorType: actor.type,
      source: actor.source,
      requestId,
      occurredAt: this.clock.now().toISOString(),
      completionId: id('completion'),
      auditId: id('audit_chore'),
    };
  }

  private withScenarioPermission(occurrence: ChoreOccurrence): ChoreOccurrence {
    return {
      ...occurrence,
      locked:
        occurrence.locked ||
        (this.scenario === 'permission' && occurrence.id === 'occurrence_school_bag'),
    };
  }

  private async applyLatency(): Promise<void> {
    if (this.scenario === 'loading') {
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
  }

  private calendarMode(): CalendarProjectionMode {
    if (this.scenario === 'stale') return 'stale';
    if (this.scenario === 'unavailable') return 'unavailable';
    return 'sync';
  }

  private assertHousehold(householdId: string): void {
    const found = this.database.prepare('SELECT 1 FROM households WHERE id = ?').get(householdId);
    if (found === undefined)
      throw new RepositoryError('NOT_FOUND', 'That household could not be found.');
  }

  private currentLocalDate(householdId: string): string {
    const household = this.readHousehold(householdId);
    return localDateInTimezone(this.clock.now().toISOString(), household.timezone);
  }

  private readHousehold(householdId: string) {
    const row = this.database.prepare('SELECT * FROM households WHERE id = ?').get(householdId) as
      { id: string; name: string; timezone: string; locale: string } | undefined;
    if (row === undefined)
      throw new RepositoryError('NOT_FOUND', 'That household could not be found.');
    return {
      id: row.id,
      name: row.name,
      timezone: row.timezone,
      locale: row.locale,
      mode: dayPeriod(this.clock.now(), row.timezone),
      members: this.readMembers(householdId),
    };
  }

  private readMembers(householdId: string): Member[] {
    const rows = this.database
      .prepare(
        `SELECT id, display_name, colour, avatar_key, role, capabilities_json
         FROM members WHERE household_id = ? AND archived_at IS NULL ORDER BY created_at, id`,
      )
      .all(householdId) as MemberRow[];
    return rows.map(memberFromRow);
  }

  private seedDemo(): void {
    const seed = createDemoSeed();
    this.database
      .prepare(
        `INSERT OR IGNORE INTO households
          (id, name, timezone, locale, week_starts_on, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        seed.household.id,
        seed.household.name,
        seed.household.timezone,
        seed.household.locale,
        DEMO_NOW,
        DEMO_NOW,
      );
    const insertMember = this.database.prepare(
      `INSERT OR IGNORE INTO members
        (id, household_id, display_name, colour, avatar_key, role, archived_at, created_at, updated_at,
         capabilities_json)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
    );
    for (const member of seed.household.members) {
      insertMember.run(
        member.id,
        seed.household.id,
        member.displayName,
        member.color,
        member.avatarUrl,
        member.role,
        DEMO_NOW,
        DEMO_NOW,
        JSON.stringify(member.capabilities),
      );
    }
    const insertTemplate = this.database.prepare(
      `INSERT OR IGNORE INTO chore_templates
        (id, household_id, title, description, recurrence_rule, routine_label, due_time,
         points_value, active_from, active_until, archived_at, created_at, updated_at)
       VALUES (?, ?, ?, NULL, ?, ?, NULL, ?, ?, NULL, NULL, ?, ?)`,
    );
    const insertAssignee = this.database.prepare(
      'INSERT OR IGNORE INTO chore_template_assignees (template_id, member_id) VALUES (?, ?)',
    );
    for (const [index, chore] of seed.chores.entries()) {
      const templateId = `template_${chore.id.replace('occurrence_', '')}`;
      const createdAt = new Date(new Date(DEMO_NOW).getTime() + index * 1_000).toISOString();
      insertTemplate.run(
        templateId,
        seed.household.id,
        chore.title,
        TEMPLATE_RULES.get(chore.id) ?? 'FREQ=DAILY',
        chore.routineLabel,
        0,
        DEMO_LOCAL_DATE,
        createdAt,
        createdAt,
      );
      insertAssignee.run(templateId, chore.assignee.id);
    }
    this.generateOccurrences(seed.household.id, DEMO_LOCAL_DATE);
  }
}

interface TemplateRow {
  id: string;
  title: string;
  recurrence_rule: string;
  routine_label: string;
  active_from: string;
  active_until: string | null;
  member_id: string;
}

interface MemberRow {
  id: string;
  display_name: string;
  colour: string;
  avatar_key: string | null;
  role: 'adult' | 'child';
  capabilities_json: string;
}

interface OccurrenceRow {
  id: string;
  household_id: string;
  assignee_member_id: string;
  title_snapshot: string;
  routine_label_snapshot: string;
  scheduled_local_date: string;
  state: 'pending' | 'completed' | 'skipped' | 'excused' | 'cancelled';
  completion_id: string | null;
  completed_at: string | null;
  display_name: string;
  colour: string;
  avatar_key: string | null;
  role: 'adult' | 'child';
  capabilities_json: string;
}

function memberFromRow(row: MemberRow): Member {
  return MemberSchema.parse({
    id: row.id,
    displayName: row.display_name,
    color: row.colour,
    avatarUrl: row.avatar_key ?? '/brand/hearth-mark.png',
    role: row.role,
    capabilities: JSON.parse(row.capabilities_json) as unknown,
  });
}

function memberFromOccurrenceRow(row: OccurrenceRow): Member {
  return memberFromRow({
    id: row.assignee_member_id,
    display_name: row.display_name,
    colour: row.colour,
    avatar_key: row.avatar_key,
    role: row.role,
    capabilities_json: row.capabilities_json,
  });
}

function translateError(error: unknown): unknown {
  if (error instanceof RepositoryError) return error;
  if (error instanceof ChoreDomainError) return new RepositoryError(error.code, error.message);
  return error;
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '_')}`;
}

function occurrenceId(templateId: string, memberId: string, localDate: string): string {
  return `${templateId.replace('template_', 'occurrence_')}_${memberId.replace('member_', '')}_${localDate.replaceAll('-', '')}`;
}

function displayDate(localDate: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${localDate}T12:00:00.000Z`));
}

function monthName(month: string): string {
  return new Intl.DateTimeFormat('en-AU', { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${month}-01T12:00:00.000Z`),
  );
}

function createWeekDays(
  startDate: string,
  currentLocalDate: string,
  includeDemoForecast: boolean,
): WeekDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const localDate = addLocalDays(startDate, index);
    const date = new Date(`${localDate}T12:00:00.000Z`);
    return {
      localDate,
      dayLabel: new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: 'UTC' }).format(
        date,
      ),
      dateLabel: new Intl.DateTimeFormat('en-AU', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }).format(date),
      isToday: localDate === currentLocalDate,
      forecast: includeDemoForecast ? demoForecastForDay(index) : null,
    };
  });
}

function displayRange(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T12:00:00.000Z`);
  const end = new Date(`${endDate}T12:00:00.000Z`);
  const startDay = new Intl.DateTimeFormat('en-AU', { day: 'numeric', timeZone: 'UTC' }).format(
    start,
  );
  const endDay = new Intl.DateTimeFormat('en-AU', { day: 'numeric', timeZone: 'UTC' }).format(end);
  const startMonth = new Intl.DateTimeFormat('en-AU', { month: 'long', timeZone: 'UTC' }).format(
    start,
  );
  const endMonth = new Intl.DateTimeFormat('en-AU', { month: 'long', timeZone: 'UTC' }).format(end);
  return startMonth === endMonth
    ? `${startDay}–${endDay} ${endMonth}`
    : `${startDay} ${startMonth}–${endDay} ${endMonth}`;
}

function dayPeriod(now: Date, timezone: string): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-AU', {
      timeZone: timezone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now),
  );
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

function completedLabel(timestamp: string, timezone: string): string {
  const time = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
  return `Done ${time}`;
}
