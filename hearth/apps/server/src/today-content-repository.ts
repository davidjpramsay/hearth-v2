import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import {
  AuditSummarySchema,
  HouseholdNoticeSchema,
  TodayConfigurationCommandResultSchema,
  TodayConfigurationSchema,
  TodaySectionVisibilitySchema,
  type CreateHouseholdNoticeRequest,
  type DemoScenario,
  type HouseholdNotice,
  type TodayConfiguration,
  type TodayConfigurationCommandResult,
  type TodaySectionVisibility,
  type UpdateHouseholdNoticeRequest,
  type UpdateTodaySectionsRequest,
} from '@hearth/shared';

import { DEMO_HOUSEHOLD_ID, DEMO_NOW } from './demo/seed.js';
import { type CommandActor, RepositoryError } from './repository.js';
import { FixedClock, type HearthClock } from './runtime-context.js';

const DEFAULT_SECTIONS: TodaySectionVisibility = {
  dinner: true,
  listSummary: true,
  notice: true,
  photo: true,
  dailyVerse: false,
  reminders: true,
};

const DEMO_NOTICE: HouseholdNotice = {
  id: 'notice_bins_tonight',
  householdId: DEMO_HOUSEHOLD_ID,
  message: 'Bins go out tonight',
  priority: 'standard',
  startsAt: '2026-08-02T00:00:00.000Z',
  expiresAt: '2026-08-04T12:00:00.000Z',
  createdAt: '2026-08-02T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
};

type NoticeAction = 'notice.create' | 'notice.update' | 'notice.archive';

export interface TodayContentRepository {
  getConfiguration(householdId: string): Promise<TodayConfiguration>;
  getActiveNotice(householdId: string): Promise<HouseholdNotice | null>;
  createNotice(
    householdId: string,
    input: CreateHouseholdNoticeRequest,
    actor: CommandActor,
  ): Promise<TodayConfigurationCommandResult>;
  updateNotice(
    householdId: string,
    noticeId: string,
    input: UpdateHouseholdNoticeRequest,
    actor: CommandActor,
  ): Promise<TodayConfigurationCommandResult>;
  archiveNotice(
    householdId: string,
    noticeId: string,
    requestId: string,
    actor: CommandActor,
  ): Promise<TodayConfigurationCommandResult>;
  updateSections(
    householdId: string,
    input: UpdateTodaySectionsRequest,
    actor: CommandActor,
  ): Promise<TodayConfigurationCommandResult>;
  reset(): void;
  setScenario(scenario: DemoScenario): void;
  close(): void;
}

export class TodayContentService implements TodayContentRepository {
  private sections = structuredClone(DEFAULT_SECTIONS);
  private notices: HouseholdNotice[];
  private readonly receipts = new Map<string, TodayConfigurationCommandResult>();
  private scenario: DemoScenario = 'healthy';

  constructor(
    private readonly database?: Database.Database,
    private readonly options: { seedDemo?: boolean; clock?: HearthClock } = {},
  ) {
    this.notices = options.seedDemo === false ? [] : [structuredClone(DEMO_NOTICE)];
    if (database !== undefined && options.seedDemo !== false) this.seedDemo();
  }

  private get clock(): HearthClock {
    return this.options.clock ?? new FixedClock(DEMO_NOW);
  }

  async getConfiguration(householdId: string): Promise<TodayConfiguration> {
    this.assertHousehold(householdId);
    return this.buildConfiguration(householdId);
  }

  private buildConfiguration(householdId: string): TodayConfiguration {
    const now = this.clock.now().toISOString();
    const sections = this.readSections(householdId);
    const notices = this.readNotices(householdId);
    return TodayConfigurationSchema.parse({
      householdId,
      sections,
      activeNoticeId: this.scenario === 'empty' ? null : (activeNotice(notices, now)?.id ?? null),
      notices,
    });
  }

  async getActiveNotice(householdId: string): Promise<HouseholdNotice | null> {
    this.assertHousehold(householdId);
    if (this.scenario === 'empty') return null;
    return activeNotice(this.readNotices(householdId), this.clock.now().toISOString());
  }

  async createNotice(
    householdId: string,
    input: CreateHouseholdNoticeRequest,
    actor: CommandActor,
  ): Promise<TodayConfigurationCommandResult> {
    const noticeId = `notice_${randomUUID()}`;
    return this.runNoticeCommand(
      householdId,
      noticeId,
      input.requestId,
      'notice.create',
      actor,
      () => {
        const now = this.clock.now().toISOString();
        const notice = HouseholdNoticeSchema.parse({
          id: noticeId,
          householdId,
          message: input.message,
          priority: input.priority,
          startsAt: input.startsAt,
          expiresAt: input.expiresAt,
          createdAt: now,
          updatedAt: now,
        });
        if (this.database === undefined) this.notices.push(notice);
        else
          this.database
            .prepare(
              `INSERT INTO announcements
                (id, household_id, message, priority, starts_at, expires_at, archived_at,
                 created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
            )
            .run(
              notice.id,
              householdId,
              notice.message,
              notice.priority,
              notice.startsAt,
              notice.expiresAt,
              notice.createdAt,
              notice.updatedAt,
            );
      },
    );
  }

  async updateNotice(
    householdId: string,
    noticeId: string,
    input: UpdateHouseholdNoticeRequest,
    actor: CommandActor,
  ): Promise<TodayConfigurationCommandResult> {
    return this.runNoticeCommand(
      householdId,
      noticeId,
      input.requestId,
      'notice.update',
      actor,
      () => {
        const now = this.clock.now().toISOString();
        if (this.database === undefined) {
          const index = this.notices.findIndex(
            (notice) => notice.id === noticeId && notice.householdId === householdId,
          );
          const current = this.notices[index];
          if (current === undefined)
            throw new RepositoryError('NOT_FOUND', 'That notice could not be found.');
          this.notices[index] = HouseholdNoticeSchema.parse({
            ...current,
            message: input.message,
            priority: input.priority,
            startsAt: input.startsAt,
            expiresAt: input.expiresAt,
            updatedAt: now,
          });
          return;
        }
        const result = this.database
          .prepare(
            `UPDATE announcements
             SET message = ?, priority = ?, starts_at = ?, expires_at = ?, updated_at = ?
             WHERE id = ? AND household_id = ? AND archived_at IS NULL`,
          )
          .run(
            input.message,
            input.priority,
            input.startsAt,
            input.expiresAt,
            now,
            noticeId,
            householdId,
          );
        if (result.changes === 0)
          throw new RepositoryError('NOT_FOUND', 'That notice could not be found.');
      },
    );
  }

  async archiveNotice(
    householdId: string,
    noticeId: string,
    requestId: string,
    actor: CommandActor,
  ): Promise<TodayConfigurationCommandResult> {
    return this.runNoticeCommand(householdId, noticeId, requestId, 'notice.archive', actor, () => {
      if (this.database === undefined) {
        const index = this.notices.findIndex(
          (notice) => notice.id === noticeId && notice.householdId === householdId,
        );
        if (index < 0) throw new RepositoryError('NOT_FOUND', 'That notice could not be found.');
        this.notices.splice(index, 1);
        return;
      }
      const result = this.database
        .prepare(
          `UPDATE announcements SET archived_at = ?, updated_at = ?
             WHERE id = ? AND household_id = ? AND archived_at IS NULL`,
        )
        .run(this.clock.now().toISOString(), this.clock.now().toISOString(), noticeId, householdId);
      if (result.changes === 0)
        throw new RepositoryError('NOT_FOUND', 'That notice could not be found.');
    });
  }

  async updateSections(
    householdId: string,
    input: UpdateTodaySectionsRequest,
    actor: CommandActor,
  ): Promise<TodayConfigurationCommandResult> {
    this.assertHousehold(householdId);
    return this.replayOrRun(
      householdId,
      input.requestId,
      'today-sections-update',
      'today.sections.update',
      householdId,
      actor,
      () => {
        const sections = TodaySectionVisibilitySchema.parse(input);
        if (this.database === undefined) this.sections = sections;
        else
          this.database
            .prepare(
              `INSERT INTO today_section_preferences
                (household_id, show_dinner, show_list_summary, show_notice, show_photo,
                 show_daily_verse, show_reminders, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(household_id) DO UPDATE SET
                 show_dinner = excluded.show_dinner,
                 show_list_summary = excluded.show_list_summary,
                 show_notice = excluded.show_notice,
                 show_photo = excluded.show_photo,
                 show_daily_verse = excluded.show_daily_verse,
                 show_reminders = excluded.show_reminders,
                 updated_at = excluded.updated_at`,
            )
            .run(
              householdId,
              Number(sections.dinner),
              Number(sections.listSummary),
              Number(sections.notice),
              Number(sections.photo),
              Number(sections.dailyVerse),
              Number(sections.reminders),
              this.clock.now().toISOString(),
            );
      },
    );
  }

  reset(): void {
    this.scenario = 'healthy';
    this.sections = structuredClone(DEFAULT_SECTIONS);
    this.notices = this.options.seedDemo === false ? [] : [structuredClone(DEMO_NOTICE)];
    this.receipts.clear();
    if (this.database !== undefined && this.options.seedDemo !== false) {
      this.database.transaction(() => {
        this.database!.prepare('DELETE FROM announcements WHERE household_id = ?').run(
          DEMO_HOUSEHOLD_ID,
        );
        this.database!.prepare('DELETE FROM today_section_preferences WHERE household_id = ?').run(
          DEMO_HOUSEHOLD_ID,
        );
        this.database!.prepare(
          `DELETE FROM command_receipts
             WHERE household_id = ? AND command_type IN (
               'notice-create', 'notice-update', 'notice-archive', 'today-sections-update'
             )`,
        ).run(DEMO_HOUSEHOLD_ID);
        this.database!.prepare(
          `DELETE FROM audit_events
             WHERE household_id = ? AND action_type IN (
               'notice.create', 'notice.update', 'notice.archive', 'today.sections.update'
             )`,
        ).run(DEMO_HOUSEHOLD_ID);
        this.seedDemo();
      })();
    }
  }

  close(): void {}

  setScenario(scenario: DemoScenario): void {
    this.scenario = scenario;
  }

  private runNoticeCommand(
    householdId: string,
    noticeId: string,
    requestId: string,
    action: NoticeAction,
    actor: CommandActor,
    mutation: () => void,
  ): Promise<TodayConfigurationCommandResult> {
    this.assertHousehold(householdId);
    return this.replayOrRun(
      householdId,
      requestId,
      action.replaceAll('.', '-'),
      action,
      noticeId,
      actor,
      mutation,
    );
  }

  private async replayOrRun(
    householdId: string,
    requestId: string,
    commandType: string,
    action: NoticeAction | 'today.sections.update',
    targetId: string,
    actor: CommandActor,
    mutation: () => void,
  ): Promise<TodayConfigurationCommandResult> {
    const receiptKey = `${householdId}:${commandType}:${requestId}`;
    const stored =
      this.readReceipt(householdId, requestId, commandType) ?? this.receipts.get(receiptKey);
    if (stored !== undefined) return { ...structuredClone(stored), replayed: true };

    const execute = () => {
      mutation();
      const audit = AuditSummarySchema.parse({
        id: `audit_${randomUUID()}`,
        actorType: actor.type,
        actorId: actor.id,
        source: actor.source,
        action,
        targetId,
        occurredAt: this.clock.now().toISOString(),
        result: 'succeeded',
      });
      const result = TodayConfigurationCommandResultSchema.parse({
        configuration: this.buildConfiguration(householdId),
        audit,
        replayed: false,
      });
      if (this.database === undefined) this.receipts.set(receiptKey, result);
      else this.writeReceipt(householdId, requestId, commandType, result);
      return result;
    };
    const result = this.database === undefined ? execute() : this.database.transaction(execute)();
    return structuredClone(result);
  }

  private readSections(householdId: string): TodaySectionVisibility {
    if (this.database === undefined) return structuredClone(this.sections);
    const row = this.database
      .prepare(
        `SELECT show_dinner, show_list_summary, show_notice, show_photo, show_daily_verse,
                show_reminders
         FROM today_section_preferences WHERE household_id = ?`,
      )
      .get(householdId) as
      | {
          show_dinner: number;
          show_list_summary: number;
          show_notice: number;
          show_photo: number;
          show_daily_verse: number;
          show_reminders: number;
        }
      | undefined;
    if (row === undefined) return structuredClone(DEFAULT_SECTIONS);
    return TodaySectionVisibilitySchema.parse({
      dinner: row.show_dinner === 1,
      listSummary: row.show_list_summary === 1,
      notice: row.show_notice === 1,
      photo: row.show_photo === 1,
      dailyVerse: row.show_daily_verse === 1,
      reminders: row.show_reminders === 1,
    });
  }

  private readNotices(householdId: string): HouseholdNotice[] {
    if (this.database === undefined)
      return this.notices
        .filter((notice) => notice.householdId === householdId)
        .map((notice) => structuredClone(notice));
    const rows = this.database
      .prepare(
        `SELECT id, household_id, message, priority, starts_at, expires_at, created_at, updated_at
         FROM announcements
         WHERE household_id = ? AND archived_at IS NULL
         ORDER BY CASE priority WHEN 'important' THEN 0 ELSE 1 END, starts_at DESC`,
      )
      .all(householdId) as NoticeRow[];
    return rows.map(noticeFromRow);
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

  private readReceipt(
    householdId: string,
    requestId: string,
    commandType: string,
  ): TodayConfigurationCommandResult | undefined {
    if (this.database === undefined) return undefined;
    const row = this.database
      .prepare(
        `SELECT response_json FROM command_receipts
         WHERE household_id = ? AND request_id = ? AND command_type = ?`,
      )
      .get(householdId, requestId, commandType) as { response_json: string } | undefined;
    return row === undefined
      ? undefined
      : TodayConfigurationCommandResultSchema.parse(JSON.parse(row.response_json));
  }

  private writeReceipt(
    householdId: string,
    requestId: string,
    commandType: string,
    result: TodayConfigurationCommandResult,
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
    this.database!.prepare(
      `INSERT INTO audit_events
          (id, occurred_at, household_id, actor_type, actor_id, source_channel, action_type,
           target_type, target_id, request_id, result, safe_summary_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')`,
    ).run(
      result.audit.id,
      result.audit.occurredAt,
      householdId,
      result.audit.actorType,
      result.audit.actorId,
      result.audit.source,
      result.audit.action,
      result.audit.action.startsWith('notice.') ? 'notice' : 'household',
      result.audit.targetId,
      requestId,
      result.audit.result,
    );
  }

  private seedDemo(): void {
    this.database!.prepare(
      `INSERT OR IGNORE INTO today_section_preferences
          (household_id, show_dinner, show_list_summary, show_notice, show_photo,
           show_daily_verse, show_reminders, updated_at)
         VALUES (?, 1, 1, 1, 1, 0, 1, ?)`,
    ).run(DEMO_HOUSEHOLD_ID, DEMO_NOW);
    this.database!.prepare(
      `INSERT OR IGNORE INTO announcements
          (id, household_id, message, priority, starts_at, expires_at, archived_at,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).run(
      DEMO_NOTICE.id,
      DEMO_NOTICE.householdId,
      DEMO_NOTICE.message,
      DEMO_NOTICE.priority,
      DEMO_NOTICE.startsAt,
      DEMO_NOTICE.expiresAt,
      DEMO_NOTICE.createdAt,
      DEMO_NOTICE.updatedAt,
    );
  }
}

interface NoticeRow {
  id: string;
  household_id: string;
  message: string;
  priority: string;
  starts_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

function noticeFromRow(row: NoticeRow): HouseholdNotice {
  return HouseholdNoticeSchema.parse({
    id: row.id,
    householdId: row.household_id,
    message: row.message,
    priority: row.priority,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function activeNotice(notices: HouseholdNotice[], now: string): HouseholdNotice | null {
  return (
    notices
      .filter(
        (notice) => notice.startsAt <= now && (notice.expiresAt === null || notice.expiresAt > now),
      )
      .toSorted((left, right) => {
        const priority =
          Number(right.priority === 'important') - Number(left.priority === 'important');
        return priority === 0 ? right.updatedAt.localeCompare(left.updatedAt) : priority;
      })[0] ?? null
  );
}
