import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import { addLocalDays, calculatePocketMoneyProgress, localDateOffset } from '@hearth/core';
import {
  PocketMoneyOverviewSchema,
  PocketMoneyPaymentCommandResultSchema,
  PocketMoneyPaymentSchema,
  PocketMoneyPaymentVoidCommandResultSchema,
  PocketMoneyPaymentVoidSchema,
  PocketMoneySettingsCommandResultSchema,
  type AuditSummary,
  type ChoreOccurrence,
  type Payday,
  type PocketMoneyChildSummary,
  type PocketMoneyOverview,
  type PocketMoneyPayment,
  type PocketMoneyPaymentCommandResult,
  type PocketMoneyPaymentVoid,
  type PocketMoneyPaymentVoidCommandResult,
  type PocketMoneySettingsCommandResult,
  type RecordPocketMoneyPaymentRequest,
  type UpdatePocketMoneySettingsRequest,
  type VoidPocketMoneyPaymentRequest,
} from '@hearth/shared';

import type { AdminRepository } from './admin-repository.js';
import { DEMO_HOUSEHOLD_ID, DEMO_NOW } from './demo/seed.js';
import { RepositoryError, type CommandActor, type HearthRepository } from './repository.js';
import { FixedClock, type HearthClock } from './runtime-context.js';

interface PocketMoneySetting {
  householdId: string;
  memberId: string;
  weeklyAmountCents: number;
  payday: Payday;
}

interface PocketMoneyStore {
  settings(householdId: string): PocketMoneySetting[];
  upsertSetting(setting: PocketMoneySetting, occurredAt: string): void;
  payments(householdId: string, memberId: string, weekStart: string): PocketMoneyPayment[];
  recentPayments(householdId: string, limit: number): PocketMoneyPayment[];
  payment(householdId: string, paymentId: string): PocketMoneyPayment | null;
  insertPayment(householdId: string, payment: PocketMoneyPayment): void;
  insertPaymentVoid(paymentVoid: PocketMoneyPaymentVoid): void;
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
  voidPayment(
    householdId: string,
    paymentId: string,
    input: VoidPocketMoneyPaymentRequest,
    actor: CommandActor,
  ): Promise<PocketMoneyPaymentVoidCommandResult>;
  reset(): void;
  close(): void;
}

export class PocketMoneyService implements PocketMoneyRepository {
  private readonly store: PocketMoneyStore;
  private readonly clock: HearthClock;
  private readonly commandLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly chores: HearthRepository,
    private readonly admin: AdminRepository,
    database?: InstanceType<typeof Database>,
    options: { seedDemo?: boolean; clock?: HearthClock } = {},
  ) {
    const seedDemo = options.seedDemo ?? true;
    this.clock = options.clock ?? new FixedClock(DEMO_NOW);
    this.store =
      database === undefined
        ? new MemoryPocketMoneyStore(seedDemo)
        : new SqlitePocketMoneyStore(database, seedDemo);
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
        const payments = this.store.payments(householdId, member.id, weekStart);
        const activePayments = payments.filter((payment) => payment.void === null);
        const paidAmountCents = activePayments.reduce(
          (total, payment) => total + payment.amountCents,
          0,
        );
        const progress = calculatePocketMoneyProgress(
          occurrences.filter((occurrence) => occurrence.assignee.id === member.id),
          setting?.weeklyAmountCents ?? null,
          setting?.payday ?? null,
          localDateOffset(weekStart, asOfDate),
          paidAmountCents,
          activePayments.length,
        );
        return {
          member,
          weeklyAmountCents: setting?.weeklyAmountCents ?? null,
          currency: 'AUD',
          payday: setting?.payday ?? null,
          ...progress,
          payments,
        };
      });
    return PocketMoneyOverviewSchema.parse({
      householdId,
      weekStart,
      weekEnd: addLocalDays(weekStart, 6),
      asOfDate,
      displayRange: displayRange(weekStart),
      children,
      recentPayments: this.store.recentPayments(householdId, 40),
    });
  }

  async updateSettings(
    householdId: string,
    memberId: string,
    input: UpdatePocketMoneySettingsRequest,
    actor: CommandActor,
  ): Promise<PocketMoneySettingsCommandResult> {
    return this.withCommandLock(this.memberCommandKey(householdId, memberId), async () => {
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
      const occurredAt = this.clock.now().toISOString();
      this.store.upsertSetting(
        {
          householdId,
          memberId,
          weeklyAmountCents: input.weeklyAmountCents,
          payday: input.payday,
        },
        occurredAt,
      );
      const child = await this.child(householdId, memberId, input.weekStart, input.asOfDate);
      const audit = commandAudit('pocket-money.settings.update', memberId, actor, occurredAt);
      const result = PocketMoneySettingsCommandResultSchema.parse({
        child,
        audit,
        replayed: false,
      });
      this.store.writeAudit(householdId, audit, input.requestId);
      this.store.writeReceipt(householdId, input.requestId, commandType, result, audit.occurredAt);
      return result;
    });
  }

  async recordPayment(
    householdId: string,
    input: RecordPocketMoneyPaymentRequest,
    actor: CommandActor,
  ): Promise<PocketMoneyPaymentCommandResult> {
    return this.withCommandLock(this.memberCommandKey(householdId, input.memberId), async () => {
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
        before.earnedAmountCents === null ||
        before.remainingAmountCents === null
      ) {
        throw new RepositoryError('CONFLICT', 'Set this child’s weekly pocket money first.');
      }
      if (
        before.remainingAmountCents === 0 &&
        before.payments.some((payment) => payment.void === null)
      ) {
        throw new RepositoryError('CONFLICT', 'Pocket money for this week is already fully paid.');
      }
      const amountCents = input.amountCents ?? before.remainingAmountCents;
      if (amountCents <= 0) {
        throw new RepositoryError('CONFLICT', 'There is no pocket money due for this week yet.');
      }
      if (amountCents > before.remainingAmountCents) {
        throw new RepositoryError(
          'CONFLICT',
          `Only ${formatMoney(before.remainingAmountCents)} remains due for this week.`,
        );
      }
      const paidAt = this.clock.now().toISOString();
      const payment = PocketMoneyPaymentSchema.parse({
        id: id('pocket_payment'),
        memberId: input.memberId,
        weekStart: input.weekStart,
        weekEnd: addLocalDays(input.weekStart, 6),
        scheduledCount: before.scheduledCount,
        completedCount: before.completedCount,
        completionPercentage: before.completionPercentage,
        amountCents,
        note: input.note ?? null,
        paidAt,
        paidByActorId: actor.id,
        source: 'companion',
        void: null,
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
    });
  }

  async voidPayment(
    householdId: string,
    paymentId: string,
    input: VoidPocketMoneyPaymentRequest,
    actor: CommandActor,
  ): Promise<PocketMoneyPaymentVoidCommandResult> {
    const existingPayment = this.store.payment(householdId, paymentId);
    if (existingPayment === null) {
      throw new RepositoryError('NOT_FOUND', 'That pocket-money payment was not found.');
    }
    return this.withCommandLock(
      this.memberCommandKey(householdId, existingPayment.memberId),
      async () => {
        const commandType = `pocket-money-payment-void:${paymentId}`;
        const receipt = this.store.receipt<PocketMoneyPaymentVoidCommandResult>(
          householdId,
          input.requestId,
          commandType,
        );
        if (receipt !== null) {
          return PocketMoneyPaymentVoidCommandResultSchema.parse({ ...receipt, replayed: true });
        }
        const payment = this.store.payment(householdId, paymentId);
        if (payment === null) {
          throw new RepositoryError('NOT_FOUND', 'That pocket-money payment was not found.');
        }
        await this.assertAdminAndChild(householdId, payment.memberId, actor);
        assertWeekRange(payment.weekStart, input.asOfDate);
        if (payment.void !== null) {
          throw new RepositoryError('CONFLICT', 'That payment has already been voided.');
        }
        const voidedAt = this.clock.now().toISOString();
        const paymentVoid = PocketMoneyPaymentVoidSchema.parse({
          id: id('pocket_payment_void'),
          paymentId,
          reason: input.reason,
          voidedAt,
          voidedByActorId: actor.id,
          source: 'companion',
        });
        this.store.insertPaymentVoid(paymentVoid);
        const voidedPayment = this.store.payment(householdId, paymentId);
        if (voidedPayment === null) {
          throw new RepositoryError('NOT_FOUND', 'That pocket-money payment was not found.');
        }
        const child = await this.child(
          householdId,
          payment.memberId,
          payment.weekStart,
          input.asOfDate,
        );
        const audit = commandAudit(
          'pocket-money.payment.void',
          paymentId,
          actor,
          voidedAt,
          'reversed',
        );
        const result = PocketMoneyPaymentVoidCommandResultSchema.parse({
          payment: voidedPayment,
          child,
          audit,
          replayed: false,
        });
        this.store.writeAudit(householdId, audit, input.requestId);
        this.store.writeReceipt(
          householdId,
          input.requestId,
          commandType,
          result,
          audit.occurredAt,
        );
        return result;
      },
    );
  }

  reset(): void {
    this.commandLocks.clear();
    this.store.reset();
  }

  close(): void {}

  private async withCommandLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.commandLocks.get(key) ?? Promise.resolve();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const current = previous.then(() => gate);
    this.commandLocks.set(key, current);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.commandLocks.get(key) === current) this.commandLocks.delete(key);
    }
  }

  private memberCommandKey(householdId: string, memberId: string): string {
    return `pocket-money-member:${householdId}:${memberId}`;
  }

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
  private paymentValues = new Map<string, PocketMoneyPayment>();
  private paymentVoids = new Map<string, PocketMoneyPaymentVoid>();
  private receipts = new Map<string, unknown>();

  constructor(private readonly demoSeedEnabled: boolean) {
    if (this.demoSeedEnabled) this.seed();
  }

  settings(householdId: string): PocketMoneySetting[] {
    return [...this.values.values()].filter((setting) => setting.householdId === householdId);
  }

  upsertSetting(setting: PocketMoneySetting, _occurredAt: string): void {
    this.values.set(`${setting.householdId}:${setting.memberId}`, structuredClone(setting));
  }

  payments(householdId: string, memberId: string, weekStart: string): PocketMoneyPayment[] {
    return this.recentPayments(householdId, Number.MAX_SAFE_INTEGER).filter(
      (payment) => payment.memberId === memberId && payment.weekStart === weekStart,
    );
  }

  recentPayments(householdId: string, limit: number): PocketMoneyPayment[] {
    return [...this.paymentValues.entries()]
      .filter(([key]) => key.startsWith(`${householdId}:`))
      .map(([, payment]) => this.withVoid(payment))
      .sort((left, right) => right.paidAt.localeCompare(left.paidAt))
      .slice(0, limit);
  }

  payment(householdId: string, paymentId: string): PocketMoneyPayment | null {
    const payment = this.paymentValues.get(`${householdId}:${paymentId}`);
    return payment === undefined ? null : structuredClone(this.withVoid(payment));
  }

  insertPayment(householdId: string, payment: PocketMoneyPayment): void {
    this.paymentValues.set(`${householdId}:${payment.id}`, structuredClone(payment));
  }

  insertPaymentVoid(paymentVoid: PocketMoneyPaymentVoid): void {
    this.paymentVoids.set(paymentVoid.paymentId, structuredClone(paymentVoid));
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
    this.paymentValues.clear();
    this.paymentVoids.clear();
    this.receipts.clear();
    if (this.demoSeedEnabled) this.seed();
  }

  private seed(): void {
    this.upsertSetting(
      {
        householdId: DEMO_HOUSEHOLD_ID,
        memberId: 'member_ezra',
        weeklyAmountCents: 1_200,
        payday: 'friday',
      },
      DEMO_NOW,
    );
  }

  private withVoid(payment: PocketMoneyPayment): PocketMoneyPayment {
    return { ...payment, void: this.paymentVoids.get(payment.id) ?? null };
  }
}

class SqlitePocketMoneyStore implements PocketMoneyStore {
  constructor(
    private readonly database: InstanceType<typeof Database>,
    private readonly demoSeedEnabled: boolean,
  ) {
    if (this.demoSeedEnabled) this.seedDemoSetting();
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

  upsertSetting(setting: PocketMoneySetting, occurredAt: string): void {
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
        occurredAt,
        occurredAt,
      );
  }

  payments(householdId: string, memberId: string, weekStart: string): PocketMoneyPayment[] {
    const rows = this.database
      .prepare(
        `${paymentSelect()}
         WHERE p.household_id = ? AND p.member_id = ? AND p.week_start = ?
         ORDER BY p.paid_at DESC, p.id DESC`,
      )
      .all(householdId, memberId, weekStart) as PaymentRow[];
    return rows.map(paymentFromRow);
  }

  recentPayments(householdId: string, limit: number): PocketMoneyPayment[] {
    const rows = this.database
      .prepare(
        `${paymentSelect()}
         WHERE p.household_id = ?
         ORDER BY p.week_start DESC, p.paid_at DESC, p.id DESC
         LIMIT ?`,
      )
      .all(householdId, limit) as PaymentRow[];
    return rows.map(paymentFromRow);
  }

  payment(householdId: string, paymentId: string): PocketMoneyPayment | null {
    const row = this.database
      .prepare(`${paymentSelect()} WHERE p.household_id = ? AND p.id = ?`)
      .get(householdId, paymentId) as PaymentRow | undefined;
    return row === undefined ? null : paymentFromRow(row);
  }

  insertPayment(householdId: string, payment: PocketMoneyPayment): void {
    this.database
      .prepare(
        `INSERT INTO pocket_money_payments
          (id, household_id, member_id, week_start, week_end, scheduled_count, completed_count,
           completion_percentage, amount_cents, note, paid_at, paid_by_actor_id, source_channel)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        payment.note,
        payment.paidAt,
        payment.paidByActorId,
        payment.source,
      );
  }

  insertPaymentVoid(paymentVoid: PocketMoneyPaymentVoid): void {
    this.database
      .prepare(
        `INSERT INTO pocket_money_payment_voids
          (id, payment_id, reason, voided_at, voided_by_actor_id, source_channel)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        paymentVoid.id,
        paymentVoid.paymentId,
        paymentVoid.reason,
        paymentVoid.voidedAt,
        paymentVoid.voidedByActorId,
        paymentVoid.source,
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
    this.database.exec(
      'DELETE FROM pocket_money_payment_voids; DELETE FROM pocket_money_payments; DELETE FROM pocket_money_settings;',
    );
    if (this.demoSeedEnabled) this.seedDemoSetting();
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
  note: string | null;
  paid_at: string;
  paid_by_actor_id: string;
  source_channel: 'companion' | 'system';
  void_id: string | null;
  void_reason: string | null;
  voided_at: string | null;
  voided_by_actor_id: string | null;
  void_source_channel: 'companion' | null;
}

function paymentSelect(): string {
  return `SELECT p.id, p.member_id, p.week_start, p.week_end, p.scheduled_count,
                 p.completed_count, p.completion_percentage, p.amount_cents, p.note,
                 p.paid_at, p.paid_by_actor_id, p.source_channel,
                 v.id AS void_id, v.reason AS void_reason, v.voided_at,
                 v.voided_by_actor_id, v.source_channel AS void_source_channel
          FROM pocket_money_payments p
          LEFT JOIN pocket_money_payment_voids v ON v.payment_id = p.id`;
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
    note: row.note,
    paidAt: row.paid_at,
    paidByActorId: row.paid_by_actor_id,
    source: row.source_channel,
    void:
      row.void_id === null
        ? null
        : {
            id: row.void_id,
            paymentId: row.id,
            reason: row.void_reason,
            voidedAt: row.voided_at,
            voidedByActorId: row.voided_by_actor_id,
            source: row.void_source_channel,
          },
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
  action:
    'pocket-money.settings.update' | 'pocket-money.payment.record' | 'pocket-money.payment.void',
  targetId: string,
  actor: CommandActor,
  occurredAt: string,
  result: AuditSummary['result'] = 'succeeded',
): AuditSummary {
  return {
    id: id('audit_pocket_money'),
    actorType: actor.type,
    actorId: actor.id,
    source: actor.source,
    action,
    targetId,
    occurredAt,
    result,
  };
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function id(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '_')}`;
}
