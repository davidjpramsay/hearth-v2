import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import type { PocketMoneyPaymentCommandResult } from '@hearth/shared';

import { SqliteAdminRepository } from './admin-repository.js';
import { openHearthDatabase } from './database.js';
import { DEMO_HOUSEHOLD_ID } from './demo/seed.js';
import { PocketMoneyService } from './pocket-money-repository.js';
import { DEMO_TV_ACTOR, type CommandActor, type RepositoryError } from './repository.js';
import { SqliteHearthRepository } from './sqlite-hearth-repository.js';

const directories: string[] = [];
const databases: InstanceType<typeof Database>[] = [];

afterEach(async () => {
  for (const database of databases.splice(0)) if (database.open) database.close();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('SQLite pocket money repository', () => {
  it('persists partial payments, immutable voids and corrected history with safe replay', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-pocket-money-'));
    directories.push(directory);
    const database = await openHearthDatabase(join(directory, 'hearth.sqlite'));
    databases.push(database);
    const admin = new SqliteAdminRepository(database);
    const chores = new SqliteHearthRepository(database);
    const pocketMoney = new PocketMoneyService(chores, admin, database);
    const adult: CommandActor = { id: 'member_maya', type: 'member', source: 'companion' };

    const initial = await pocketMoney.getOverview(DEMO_HOUSEHOLD_ID, '2026-08-03', '2026-08-03');
    expect(initial.children[0]).toMatchObject({
      weeklyAmountCents: 1200,
      completedCount: 0,
      scheduledCount: 3,
      earnedAmountCents: 0,
    });

    await chores.complete(
      DEMO_HOUSEHOLD_ID,
      'occurrence_school_bag',
      'request_pocket_chore',
      DEMO_TV_ACTOR,
    );
    const settings = await pocketMoney.updateSettings(
      DEMO_HOUSEHOLD_ID,
      'member_ezra',
      {
        requestId: 'request_pocket_settings',
        weeklyAmountCents: 1500,
        payday: 'friday',
        weekStart: '2026-08-03',
        asOfDate: '2026-08-03',
      },
      adult,
    );
    expect(settings.child).toMatchObject({
      completionPercentage: 33,
      earnedAmountCents: 500,
    });

    const paymentInput = {
      requestId: 'request_pocket_payment',
      memberId: 'member_ezra',
      weekStart: '2026-08-03',
      asOfDate: '2026-08-03',
      amountCents: 200,
      note: 'Cash',
    } as const;
    const payment = await pocketMoney.recordPayment(DEMO_HOUSEHOLD_ID, paymentInput, adult);
    const replay = await pocketMoney.recordPayment(DEMO_HOUSEHOLD_ID, paymentInput, adult);
    const partial = await pocketMoney.getOverview(DEMO_HOUSEHOLD_ID, '2026-08-03', '2026-08-03');
    const remainder = await pocketMoney.recordPayment(
      DEMO_HOUSEHOLD_ID,
      {
        requestId: 'request_pocket_payment_remainder',
        memberId: 'member_ezra',
        weekStart: '2026-08-03',
        asOfDate: '2026-08-03',
        amountCents: 300,
        note: 'Transfer',
      },
      adult,
    );
    const voidInput = {
      requestId: 'request_pocket_payment_void',
      asOfDate: '2026-08-03',
      reason: 'Used the wrong account',
    } as const;
    const paymentVoid = await pocketMoney.voidPayment(
      DEMO_HOUSEHOLD_ID,
      remainder.payment.id,
      voidInput,
      adult,
    );
    const voidReplay = await pocketMoney.voidPayment(
      DEMO_HOUSEHOLD_ID,
      remainder.payment.id,
      voidInput,
      adult,
    );
    const restarted = new PocketMoneyService(chores, admin, database);
    const persisted = await restarted.getOverview(DEMO_HOUSEHOLD_ID, '2026-08-03', '2026-08-03');
    const followingWeek = await restarted.getOverview(
      DEMO_HOUSEHOLD_ID,
      '2026-08-10',
      '2026-08-10',
    );
    const corrected = await restarted.recordPayment(
      DEMO_HOUSEHOLD_ID,
      {
        requestId: 'request_pocket_payment_corrected',
        memberId: 'member_ezra',
        weekStart: '2026-08-03',
        asOfDate: '2026-08-03',
        amountCents: 300,
        note: 'Correct account',
      },
      adult,
    );

    expect(payment).toMatchObject({
      payment: { amountCents: 200, note: 'Cash', void: null },
      child: { status: 'partially-paid', paidAmountCents: 200, remainingAmountCents: 300 },
      replayed: false,
    });
    expect(replay).toMatchObject({ payment: { id: payment.payment.id }, replayed: true });
    expect(partial.children[0]).toMatchObject({
      status: 'partially-paid',
      paidAmountCents: 200,
      remainingAmountCents: 300,
    });
    expect(remainder.child).toMatchObject({ status: 'paid', remainingAmountCents: 0 });
    expect(paymentVoid).toMatchObject({
      payment: { void: { reason: 'Used the wrong account' } },
      child: { status: 'partially-paid', remainingAmountCents: 300 },
      replayed: false,
    });
    expect(voidReplay).toMatchObject({ replayed: true });
    expect(persisted.children[0]).toMatchObject({
      weeklyAmountCents: 1500,
      status: 'partially-paid',
      paidAmountCents: 200,
      remainingAmountCents: 300,
    });
    expect(persisted.children[0]?.payments).toHaveLength(2);
    expect(persisted.recentPayments).toHaveLength(2);
    expect(followingWeek.children[0]).toMatchObject({
      weeklyAmountCents: 1500,
      payday: 'friday',
    });
    expect(corrected.child).toMatchObject({ status: 'paid', paidAmountCents: 500 });
    await expect(
      restarted.recordPayment(
        DEMO_HOUSEHOLD_ID,
        {
          requestId: 'request_pocket_payment_overpaid',
          memberId: 'member_ezra',
          weekStart: '2026-08-03',
          asOfDate: '2026-08-03',
          amountCents: 1,
        },
        adult,
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Pocket money for this week is already fully paid.',
    } satisfies Partial<RepositoryError>);
    await expect(
      restarted.voidPayment(
        DEMO_HOUSEHOLD_ID,
        remainder.payment.id,
        {
          requestId: 'request_pocket_payment_second_void',
          asOfDate: '2026-08-03',
          reason: 'Another correction',
        },
        adult,
      ),
    ).rejects.toMatchObject({ code: 'CONFLICT' } satisfies Partial<RepositoryError>);
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM audit_events WHERE action_type LIKE 'pocket-money.%'",
        )
        .get(),
    ).toEqual({ count: 5 });
  });

  it('requires an adult administrator and valid week boundary', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-pocket-money-'));
    directories.push(directory);
    const database = await openHearthDatabase(join(directory, 'hearth.sqlite'));
    databases.push(database);
    const admin = new SqliteAdminRepository(database);
    const chores = new SqliteHearthRepository(database);
    const pocketMoney = new PocketMoneyService(chores, admin, database);
    const child: CommandActor = { id: 'member_ezra', type: 'member', source: 'companion' };

    await expect(
      pocketMoney.updateSettings(
        DEMO_HOUSEHOLD_ID,
        'member_ezra',
        {
          requestId: 'request_child_pocket_settings',
          weeklyAmountCents: 1200,
          payday: 'friday',
          weekStart: '2026-08-03',
          asOfDate: '2026-08-03',
        },
        child,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<RepositoryError>);
    await expect(
      pocketMoney.getOverview(DEMO_HOUSEHOLD_ID, '2026-08-04', '2026-08-04'),
    ).rejects.toMatchObject({ code: 'CONFLICT' } satisfies Partial<RepositoryError>);
    await expect(
      pocketMoney.recordPayment(
        DEMO_HOUSEHOLD_ID,
        {
          requestId: 'request_child_pocket_payment',
          memberId: 'member_ezra',
          weekStart: '2026-08-03',
          asOfDate: '2026-08-03',
          amountCents: 100,
        },
        child,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<RepositoryError>);
  });

  it('serializes concurrent payment retries, competing partial payments and void retries', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-pocket-money-concurrency-'));
    directories.push(directory);
    const database = await openHearthDatabase(join(directory, 'hearth.sqlite'));
    databases.push(database);
    const admin = new SqliteAdminRepository(database);
    const chores = new SqliteHearthRepository(database);
    const pocketMoney = new PocketMoneyService(chores, admin, database);
    const adult: CommandActor = { id: 'member_maya', type: 'member', source: 'companion' };

    await chores.complete(
      DEMO_HOUSEHOLD_ID,
      'occurrence_school_bag',
      'request_pocket_concurrent_chore',
      DEMO_TV_ACTOR,
    );
    await pocketMoney.updateSettings(
      DEMO_HOUSEHOLD_ID,
      'member_ezra',
      {
        requestId: 'request_pocket_concurrent_settings',
        weeklyAmountCents: 1500,
        payday: 'friday',
        weekStart: '2026-08-03',
        asOfDate: '2026-08-03',
      },
      adult,
    );

    const retryInput = {
      requestId: 'request_pocket_concurrent_retry',
      memberId: 'member_ezra',
      weekStart: '2026-08-03',
      asOfDate: '2026-08-03',
      amountCents: 200,
      note: 'Cash',
    } as const;
    const retries = await Promise.all([
      pocketMoney.recordPayment(DEMO_HOUSEHOLD_ID, retryInput, adult),
      pocketMoney.recordPayment(DEMO_HOUSEHOLD_ID, retryInput, adult),
    ]);
    expect(retries.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(new Set(retries.map((result) => result.payment.id))).toHaveLength(1);

    const competing = await Promise.allSettled([
      pocketMoney.recordPayment(
        DEMO_HOUSEHOLD_ID,
        {
          ...retryInput,
          requestId: 'request_pocket_competing_payment_1',
          amountCents: 300,
          note: 'Transfer one',
        },
        adult,
      ),
      pocketMoney.recordPayment(
        DEMO_HOUSEHOLD_ID,
        {
          ...retryInput,
          requestId: 'request_pocket_competing_payment_2',
          amountCents: 300,
          note: 'Transfer two',
        },
        adult,
      ),
    ]);
    const fulfilledPayments = competing.filter(
      (result): result is PromiseFulfilledResult<PocketMoneyPaymentCommandResult> =>
        result.status === 'fulfilled',
    );
    const rejectedPayments = competing.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(fulfilledPayments).toHaveLength(1);
    expect(rejectedPayments).toHaveLength(1);
    expect(rejectedPayments[0]?.reason).toMatchObject({
      code: 'CONFLICT',
      message: 'Pocket money for this week is already fully paid.',
    } satisfies Partial<RepositoryError>);

    const completedPayment = fulfilledPayments[0]?.value.payment;
    expect(completedPayment).toBeDefined();
    const voidInput = {
      requestId: 'request_pocket_concurrent_void',
      asOfDate: '2026-08-03',
      reason: 'Duplicate transfer',
    } as const;
    const voidRetries = await Promise.all([
      pocketMoney.voidPayment(DEMO_HOUSEHOLD_ID, completedPayment!.id, voidInput, adult),
      pocketMoney.voidPayment(DEMO_HOUSEHOLD_ID, completedPayment!.id, voidInput, adult),
    ]);
    expect(voidRetries.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(new Set(voidRetries.map((result) => result.payment.void?.id))).toHaveLength(1);

    const overview = await pocketMoney.getOverview(DEMO_HOUSEHOLD_ID, '2026-08-03', '2026-08-03');
    expect(overview.children[0]).toMatchObject({
      status: 'partially-paid',
      paidAmountCents: 200,
      remainingAmountCents: 300,
    });
    expect(overview.children[0]?.payments).toHaveLength(2);
    expect(database.prepare('SELECT COUNT(*) AS count FROM pocket_money_payments').get()).toEqual({
      count: 2,
    });
    expect(
      database.prepare('SELECT COUNT(*) AS count FROM pocket_money_payment_voids').get(),
    ).toEqual({ count: 1 });
  });
});
