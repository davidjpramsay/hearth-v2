import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import { addLocalDays, calculatePocketMoneyProgress, localDateOffset } from '@hearth/core';
import {
  PocketMoneyOverviewSchema,
  PocketMoneyPaymentCommandResultSchema,
  PocketMoneyPaymentSchema,
  PocketMoneySettingsCommandResultSchema,
  type AuditSummary,
  type ChoreOccurrence,
  type Payday,
  type PocketMoneyChildSummary,
  type PocketMoneyOverview,
  type PocketMoneyPayment,
  type PocketMoneyPaymentCommandResult,
  type PocketMoneySettingsCommandResult,
  type RecordPocketMoneyPaymentRequest,
  type UpdatePocketMoneySettingsRequest,
} from '@hearth/shared';

import type { AdminRepository } from './admin-repository.js';
import { DEMO_HOUSEHOLD_ID, DEMO_NOW } from './demo/seed.js';
import { RepositoryError, type CommandActor, type HearthRepository } from './repository.js';

interface PocketMoneySetting {
  householdId: string;
  memberId: string;
  weeklyAmountCents: number;
  payday: Payday;
}

interface PocketMoneyStore {
  settings(householdId: string): PocketMoneySetting[];
  upsertSetting(setting: PocketMoneySetting): void;
  payment(householdId: string, memberId: string, weekStart: string): PocketMoneyPayment | null;
  insertPayment(householdId: string, payment: PocketMoneyPayment): void;
  receipt<T>(householdId: string, requestId: string, commandType: string): T | null;
  writeReceipt(
    householdId: string,
    requestId: string,
    commandType: string,
    response: unknown,
    createdAt: string,
  ): void;
  writeAudit(householdId: string, audit: AuditSummary, requestId: string): void;
  reset(): void;
}

export interface PocketMoneyRepository {
  getOverview(
    householdId: string,
    weekStart: string,
    asOfDate: string,
  ): Promise<PocketMoneyOverview>;
  updateSettings(
    householdId: string,
    memberId: string,
    input: UpdatePocketMoneySettingsRequest,
    actor: CommandActor,
  ): Promise<PocketMoneySettingsCommandResult>;
  recordPayment(
    householdId: string,
    input: RecordPocketMoneyPaymentRequest,
    actor: CommandActor,
  ): Promise<PocketMoneyPaymentCommandResult>;
  reset(): void;
  close(): void;
}

export class PocketMoneyService implements PocketMoneyRepository {
  private readonly store: PocketMoneyStore;

  constructor(
    private readonly chores: HearthRepository,
    private readonly admin: AdminRepository,
    database?: InstanceType<typeof Database>,
  ) {
    this.store =
      database === undefined ? new MemoryPocketMoneyStore() : new SqlitePocketMoneyStore(database);
  }

  async getOverview(
    householdId: string,
    weekStart: string,
    asOfDate: string,
  ): Promise<PocketMoneyOverview> {
    assertWeekRange(weekStart, asOfDate);
    const household = await this.admin.getHousehold(householdId);
    const settings = new Map(
      this.store.settings(householdId).map((setting) => [setting.memberId, setting]),
    );
    const days = await Promise.all(
      Array.from({ length: localDateOffset(weekStart, asOfDate) + 1 }, (_, offset) =>
        this.chores.getChores(householdId, addLocalDays(weekStart, offset)),
      ),
    );
    const occurrences: ChoreOccurrence[] = days.flatMap((day) =>
      day.groups.flatMap((group) => group.occurrences),
    );
    const children = household.members
      .filter((member) => member.role === 'child')
      .map((member): PocketMoneyChildSummary => {
        const setting = settings.get(member.id) ?? null;
        const payment = this.store.payment(householdId, member.id, weekStart);
        const progress = calculatePocketMoneyProgress(
          occurrences.filter((occurrence) => occurrence.assignee.id === member.id),
          setting?.weeklyAmountCents ?? null,
          setting?.payday ?? null,
          localDateOffset(weekStart, asOfDate),
          payment,
        );
        return {
          member,
          weeklyAmountCents: setting?.weeklyAmountCents ?? null,
          currency: 'AUD',
          payday: setting?.payday ?? null,
          ...progress,
          payment,
        };
      });
    return PocketMoneyOverviewSchema.parse({
      householdId,
      weekStart,
      weekEnd: addLocalDays(weekStart, 6),
      asOfDate,
      displayRange: displayRange(weekStart),
      children,
    });
  }

  async updateSettings(
    householdId: string,
    memberId: string,
    input: UpdatePocketMoneySettingsRequest,
    actor: CommandActor,
  ): Promise<PocketMoneySettingsCommandResult> {
    const commandType = `pocket-money-settings:${memberId}`;
    const receipt = this.store.receipt<PocketMoneySettingsCommandResult>(
      householdId,
      input.requestId,
      commandType,
    );
    if (receipt !== null) {
      return PocketMoneySettingsCommandResultSchema.parse({ ...receipt, replayed: true });
    }
    await this.assertAdminAndChild(householdId, memberId, actor);
    assertWeekRange(input.weekStart, input.asOfDate);
    this.store.upsertSetting({
      householdId,
      memberId,
      weeklyAmountCents: input.weeklyAmountCents,
      payday: input.payday,
    });
    const child = await this.child(householdId, memberId, input.weekStart, input.asOfDate);
    const audit = commandAudit('pocket-money.settings.update', memberId, actor);
    const result = PocketMoneySettingsCommandResultSchema.parse({ child, audit, replayed: false });
    this.store.writeAudit(householdId, audit, input.requestId);
    this.store.writeReceipt(householdId, input.requestId, commandType, result, audit.occurredAt);
    return result;
  }

  async recordPayment(
    householdId: string,
    input: RecordPocketMoneyPaymentRequest,
    actor: CommandActor,
  ): Promise<PocketMoneyPaymentCommandResult> {
    const commandType = `pocket-money-payment:${input.memberId}:${input.weekStart}`;
    const receipt = this.store.receipt<PocketMoneyPaymentCommandResult>(
      householdId,
      input.requestId,
      commandType,
    );
    if (receipt !== null) {
      return PocketMoneyPaymentCommandResultSchema.parse({ ...receipt, replayed: true });
    }
    await this.assertAdminAndChild(householdId, input.memberId, actor);
    assertWeekRange(input.weekStart, input.asOfDate);
    const before = await this.child(householdId, input.memberId, input.weekStart, input.asOfDate);
    if (
      before.weeklyAmountCents === null ||
      before.payday === null ||
      before.earnedAmountCents === null
    ) {
      throw new RepositoryError('CONFLICT', 'Set this child’s weekly pocket money first.');
    }
    if (before.payment !== null) {
      throw new RepositoryError(
        'CONFLICT',
        'Pocket money for this week is already marked as paid.',
      );
    }
    const paidAt = new Date().toISOString();
    const payment = PocketMoneyPaymentSchema.parse({
      id: id('pocket_payment'),
      memberId: input.memberId,
      weekStart: input.weekStart,
      weekEnd: addLocalDays(input.weekStart, 6),
      scheduledCount: before.scheduledCount,
      completedCount: before.completedCount,
      completionPercentage: before.completionPercentage,
      amountCents: before.earnedAmountCents,
      paidAt,
      paidByActorId: actor.id,
      source: 'companion',
    });
    this.store.insertPayment(householdId, payment);
    const child = await this.child(householdId, input.memberId, input.weekStart, input.asOfDate);
    const audit = commandAudit('pocket-money.payment.record', payment.id, actor, paidAt);
    const result = PocketMoneyPaymentCommandResultSchema.parse({
      payment,
      child,
      audit,
      replayed: false,
    });
    this.store.writeAudit(householdId, audit, input.requestId);
    this.store.writeReceipt(householdId, input.requestId, commandType, result, audit.occurredAt);
    return result;
  }

  reset(): void {
    this.store.reset();
  }

  close(): void {}

  private async child(
    householdId: string,
    memberId: string,
    weekStart: string,
    asOfDate: string,
  ): Promise<PocketMoneyChildSummary> {
    const overview = await this.getOverview(householdId, weekStart, asOfDate);
    const child = overview.children.find((candidate) => candidate.member.id === memberId);
    if (child === undefined)
      throw new RepositoryError('NOT_FOUND', 'That child could not be found.');
    return child;
  }

  private async assertAdminAndChild(
    householdId: string,
    memberId: string,
    actor: CommandActor,
  ): Promise<void> {
    if (actor.type !== 'member' || actor.source !== 'companion') {
      throw new RepositoryError(
        'FORBIDDEN',
        'Only a household administrator can manage pocket money.',
      );
    }
    const overview = await this.admin.getOverview(householdId, actor.id);
    const member = overview.household.members.find((candidate) => candidate.id === memberId);
    if (member === undefined || member.role !== 'child') {
      throw new RepositoryError('NOT_FOUND', 'That child could not be found.');
    }
  }
}

class MemoryPocketMoneyStore implements PocketMoneyStore {
  private values = new Map<string, PocketMoneySetting>();
  private payments = new Map<string, PocketMoneyPayment>();
  private receipts = new Map<string, unknown>();

  constructor() {
    this.seed();
  }

  settings(householdId: string): PocketMoneySetting[] {
    return [...this.values.values()].filter((setting) => setting.householdId === householdId);
  }

  upsertSetting(setting: PocketMoneySetting): void {
    this.values.set(`${setting.householdId}:${setting.memberId}`, structuredClone(setting));
  }

  payment(householdId: string, memberId: string, weekStart: string): PocketMoneyPayment | null {
    return structuredClone(this.payments.get(`${householdId}:${memberId}:${weekStart}`) ?? null);
  }

  insertPayment(householdId: string, payment: PocketMoneyPayment): void {
    this.payments.set(
      `${householdId}:${payment.memberId}:${payment.weekStart}`,
      structuredClone(payment),
    );
  }

  receipt<T>(householdId: string, requestId: string, commandType: string): T | null {
    return structuredClone(
      (this.receipts.get(`${householdId}:${requestId}:${commandType}`) as T | undefined) ?? null,
    );
  }

  writeReceipt(
    householdId: string,
    requestId: string,
    commandType: string,
    response: unknown,
  ): void {
    this.receipts.set(`${householdId}:${requestId}:${commandType}`, structuredClone(response));
  }

  writeAudit(): void {}

  reset(): void {
    this.values.clear();
    this.payments.clear();
    this.receipts.clear();
    this.seed();
  }

  private seed(): void {
    this.upsertSetting({
      householdId: DEMO_HOUSEHOLD_ID,
      memberId: 'member_ezra',
      weeklyAmountCents: 1_200,
      payday: 'friday',
    });
  }
}

class SqlitePocketMoneyStore implements PocketMoneyStore {
  constructor(private readonly database: InstanceType<typeof Database>) {
    this.seedDemoSetting();
  }

  settings(householdId: string): PocketMoneySetting[] {
    return this.database
      .prepare(
        `SELECT household_id AS householdId, member_id AS memberId,
                weekly_amount_cents AS weeklyAmountCents, payday
         FROM pocket_money_settings WHERE household_id = ?`,
      )
      .all(householdId) as PocketMoneySetting[];
  }

  upsertSetting(setting: PocketMoneySetting): void {
    const now = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO pocket_money_settings
          (household_id, member_id, weekly_amount_cents, currency, payday, created_at, updated_at)
         VALUES (?, ?, ?, 'AUD', ?, ?, ?)
         ON CONFLICT(household_id, member_id) DO UPDATE SET
           weekly_amount_cents = excluded.weekly_amount_cents,
           payday = excluded.payday,
           updated_at = excluded.updated_at`,
      )
      .run(
        setting.householdId,
        setting.memberId,
        setting.weeklyAmountCents,
        setting.payday,
        now,
        now,
      );
  }

  payment(householdId: string, memberId: string, weekStart: string): PocketMoneyPayment | null {
    const row = this.database
      .prepare(
        `SELECT id, member_id, week_start, week_end, scheduled_count, completed_count,
                completion_percentage, amount_cents, paid_at, paid_by_actor_id, source_channel
         FROM pocket_money_payments
         WHERE household_id = ? AND member_id = ? AND week_start = ?`,
      )
      .get(householdId, memberId, weekStart) as PaymentRow | undefined;
    return row === undefined ? null : paymentFromRow(row);
  }

  insertPayment(householdId: string, payment: PocketMoneyPayment): void {
    this.database
      .prepare(
        `INSERT INTO pocket_money_payments
          (id, household_id, member_id, week_start, week_end, scheduled_count, completed_count,
           completion_percentage, amount_cents, paid_at, paid_by_actor_id, source_channel)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        payment.id,
        householdId,
        payment.memberId,
        payment.weekStart,
        payment.weekEnd,
        payment.scheduledCount,
        payment.completedCount,
        payment.completionPercentage,
        payment.amountCents,
        payment.paidAt,
        payment.paidByActorId,
        payment.source,
      );
  }

  receipt<T>(householdId: string, requestId: string, commandType: string): T | null {
    const row = this.database
      .prepare(
        `SELECT response_json FROM command_receipts
         WHERE household_id = ? AND request_id = ? AND command_type = ?`,
      )
      .get(householdId, requestId, commandType) as { response_json: string } | undefined;
    return row === undefined ? null : (JSON.parse(row.response_json) as T);
  }

  writeReceipt(
    householdId: string,
    requestId: string,
    commandType: string,
    response: unknown,
    createdAt: string,
  ): void {
    this.database
      .prepare(
        `INSERT INTO command_receipts
          (household_id, request_id, command_type, response_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(householdId, requestId, commandType, JSON.stringify(response), createdAt);
  }

  writeAudit(householdId: string, audit: AuditSummary, requestId: string): void {
    this.database
      .prepare(
        `INSERT INTO audit_events
          (id, occurred_at, household_id, actor_type, actor_id, source_channel, action_type,
           target_type, target_id, request_id, result, safe_summary_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pocket_money', ?, ?, ?, '{}')`,
      )
      .run(
        audit.id,
        audit.occurredAt,
        householdId,
        audit.actorType,
        audit.actorId,
        audit.source,
        audit.action,
        audit.targetId,
        requestId,
        audit.result,
      );
  }

  reset(): void {
    this.database.exec('DELETE FROM pocket_money_payments; DELETE FROM pocket_money_settings;');
    this.seedDemoSetting();
  }

  private seedDemoSetting(): void {
    this.database
      .prepare(
        `INSERT OR IGNORE INTO pocket_money_settings
          (household_id, member_id, weekly_amount_cents, currency, payday, created_at, updated_at)
         SELECT ?, ?, 1200, 'AUD', 'friday', ?, ?
         WHERE EXISTS (SELECT 1 FROM members WHERE id = ? AND household_id = ?)`,
      )
      .run(DEMO_HOUSEHOLD_ID, 'member_ezra', DEMO_NOW, DEMO_NOW, 'member_ezra', DEMO_HOUSEHOLD_ID);
  }
}

interface PaymentRow {
  id: string;
  member_id: string;
  week_start: string;
  week_end: string;
  scheduled_count: number;
  completed_count: number;
  completion_percentage: number;
  amount_cents: number;
  paid_at: string;
  paid_by_actor_id: string;
  source_channel: 'companion' | 'system';
}

function paymentFromRow(row: PaymentRow): PocketMoneyPayment {
  return PocketMoneyPaymentSchema.parse({
    id: row.id,
    memberId: row.member_id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    scheduledCount: row.scheduled_count,
    completedCount: row.completed_count,
    completionPercentage: row.completion_percentage,
    amountCents: row.amount_cents,
    paidAt: row.paid_at,
    paidByActorId: row.paid_by_actor_id,
    source: row.source_channel,
  });
}

function assertWeekRange(weekStart: string, asOfDate: string): void {
  const start = new Date(`${weekStart}T12:00:00Z`);
  if (start.getUTCDay() !== 1) {
    throw new RepositoryError('CONFLICT', 'Pocket-money weeks start on Monday.');
  }
  const offset = localDateOffset(weekStart, asOfDate);
  if (offset < 0 || offset > 6) {
    throw new RepositoryError(
      'CONFLICT',
      'The progress date must be inside that pocket-money week.',
    );
  }
}

function displayRange(weekStart: string): string {
  const start = new Date(`${weekStart}T12:00:00Z`);
  const end = new Date(`${addLocalDays(weekStart, 6)}T12:00:00Z`);
  const startLabel = new Intl.DateTimeFormat('en-AU', { day: 'numeric', timeZone: 'UTC' }).format(
    start,
  );
  const endLabel = new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(end);
  return `${startLabel}–${endLabel}`;
}

function commandAudit(
  action: 'pocket-money.settings.update' | 'pocket-money.payment.record',
  targetId: string,
  actor: CommandActor,
  occurredAt = new Date().toISOString(),
): AuditSummary {
  return {
    id: id('audit_pocket_money'),
    actorType: actor.type,
    actorId: actor.id,
    source: actor.source,
    action,
    targetId,
    occurredAt,
    result: 'succeeded',
  };
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '_')}`;
}
