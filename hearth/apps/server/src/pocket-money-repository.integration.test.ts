import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

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
  it('persists settings, calculates progress, records one payment and replays safely', async () => {
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
    } as const;
    const payment = await pocketMoney.recordPayment(DEMO_HOUSEHOLD_ID, paymentInput, adult);
    const replay = await pocketMoney.recordPayment(DEMO_HOUSEHOLD_ID, paymentInput, adult);
    const restarted = new PocketMoneyService(chores, admin, database);
    const persisted = await restarted.getOverview(DEMO_HOUSEHOLD_ID, '2026-08-03', '2026-08-03');

    expect(payment).toMatchObject({ payment: { amountCents: 500 }, replayed: false });
    expect(replay).toMatchObject({ payment: { id: payment.payment.id }, replayed: true });
    expect(persisted.children[0]).toMatchObject({
      weeklyAmountCents: 1500,
      status: 'paid',
      payment: { amountCents: 500 },
    });
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM audit_events WHERE action_type LIKE 'pocket-money.%'",
        )
        .get(),
    ).toEqual({ count: 2 });
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
  });
});
