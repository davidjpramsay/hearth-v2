import { afterEach, describe, expect, it } from 'vitest';

import {
  CreateReminderSourcePairingRequestSchema,
  ReminderSnapshotReceiptSchema,
  ReminderSourceDeviceSessionSchema,
  ReplaceReminderSnapshotRequestSchema,
} from '@hearth/shared';

import { SqliteAdminRepository } from './admin-repository.js';
import { openHearthDatabase } from './database.js';
import { ReminderSourceService } from './reminder-source-repository.js';
import { FixedClock } from './runtime-context.js';

const repositories: SqliteAdminRepository[] = [];
const secret = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

afterEach(() => {
  for (const repository of repositories.splice(0)) repository.close();
});

describe('native Reminders source repository', () => {
  it('keeps the checked-in Swift interoperability fixtures aligned with the schemas', () => {
    const fixture = (name: string) =>
      JSON.parse(
        readFileSync(
          fileURLToPath(
            new URL(
              `../../../packages/shared/fixtures/reminders-contract-v1/${name}`,
              import.meta.url,
            ),
          ),
          'utf8',
        ),
      ) as unknown;

    expect(
      CreateReminderSourcePairingRequestSchema.parse(fixture('pairing-create-request.json')),
    ).toBeDefined();
    expect(ReminderSourceDeviceSessionSchema.parse(fixture('device-session.json'))).toBeDefined();
    expect(
      ReplaceReminderSnapshotRequestSchema.parse(fixture('snapshot-request.json')),
    ).toBeDefined();
    expect(ReminderSnapshotReceiptSchema.parse(fixture('snapshot-receipt.json'))).toBeDefined();
  });

  it('pairs, atomically projects full snapshots, replays safely and revokes access', async () => {
    const database = await openHearthDatabase(':memory:');
    const admin = new SqliteAdminRepository(database);
    repositories.push(admin);
    const service = new ReminderSourceService(admin, database, {
      clock: new FixedClock('2026-08-25T10:00:01+08:00'),
    });

    const pairing = await service.createPairing(
      CreateReminderSourcePairingRequestSchema.parse({
        requestId: 'request_reminder_pairing_001',
        deviceName: "David's iPhone",
        platform: 'ios',
        applicationVersion: '1.0.0',
        pairingSecret: secret,
      }),
    );
    expect(pairing).toMatchObject({ status: 'pending', platform: 'ios' });

    const approved = await service.approvePairing('household_hearth_demo', 'member_maya', {
      requestId: 'request_reminder_approval_001',
      code: pairing.code,
    });
    expect(approved.status).toBe('approved');

    const session = await service.exchangePairing(
      pairing.id,
      secret,
      'request_reminder_exchange_001',
    );
    expect(session).toMatchObject({
      contractVersion: 1,
      householdId: 'household_hearth_demo',
      scopes: ['reminders.snapshot.write'],
      nextSnapshotSequence: 1,
    });

    const snapshot = ReplaceReminderSnapshotRequestSchema.parse({
      requestId: 'request_reminders_snapshot_001',
      contractVersion: 1,
      snapshotId: 'snapshot_reminders_001',
      sequence: 3,
      generatedAt: '2026-08-25T10:00:00+08:00',
      lists: [{ sourceListId: 'eventkit-list-family', title: 'Family Reminders' }],
      reminders: [
        {
          sourceReminderId: 'eventkit-reminder-bins',
          sourceListId: 'eventkit-list-family',
          title: 'Put the bins out',
          dueLocalDate: '2026-08-25',
          dueAt: '2026-08-25T18:00:00+08:00',
          hasDueTime: true,
          isCompleted: false,
          completedAt: null,
          sourceUpdatedAt: '2026-08-25T09:55:00+08:00',
        },
      ],
    });
    const accepted = await service.replaceSnapshot(session.sourceId, secret, snapshot);
    const replayed = await service.replaceSnapshot(session.sourceId, secret, snapshot);
    expect(accepted).toMatchObject({ sequence: 3, nextSnapshotSequence: 4, replayed: false });
    expect(replayed.replayed).toBe(true);

    const overview = await service.getOverview('household_hearth_demo', false);
    expect(overview).toMatchObject({
      source: { status: 'current', reminderCount: 1, incompleteCount: 1 },
      lists: [{ title: 'Family Reminders', reminderCount: 1 }],
      reminders: [{ title: 'Put the bins out', hasDueTime: true }],
    });
    expect(JSON.stringify(overview)).not.toContain('eventkit-list-family');
    expect(JSON.stringify(overview)).not.toContain('eventkit-reminder-bins');
    const staleReader = new ReminderSourceService(admin, database, {
      clock: new FixedClock('2026-08-25T10:16:01+08:00'),
    });
    expect(await staleReader.getOverview('household_hearth_demo', false)).toMatchObject({
      source: { status: 'stale' },
      reminders: [{ title: 'Put the bins out' }],
    });
    expect(
      database.prepare('SELECT external_id_hash FROM reminder_items LIMIT 1').get() as {
        external_id_hash: string;
      },
    ).toMatchObject({ external_id_hash: expect.stringMatching(/^[a-f0-9]{64}$/) });

    await expect(
      service.replaceSnapshot(session.sourceId, secret, {
        ...snapshot,
        requestId: 'request_reminders_snapshot_stale',
        snapshotId: 'snapshot_reminders_stale',
        sequence: 2,
      }),
    ).rejects.toMatchObject({ code: 'STALE_SNAPSHOT' });

    const cleared = await service.replaceSnapshot(session.sourceId, secret, {
      ...snapshot,
      requestId: 'request_reminders_snapshot_002',
      snapshotId: 'snapshot_reminders_002',
      sequence: 4,
      lists: [],
      reminders: [],
    });
    expect(cleared).toMatchObject({ listCount: 0, reminderCount: 0 });
    expect(await service.getOverview('household_hearth_demo', false)).toMatchObject({
      lists: [],
      reminders: [],
    });

    const revoked = await service.revokeDevice(
      'household_hearth_demo',
      session.deviceId,
      'member_maya',
      'request_reminder_revoke_001',
    );
    expect(revoked).toMatchObject({ source: { status: 'revoked' }, replayed: false });
    expect(() => service.getDeviceSession(secret)).toThrow(
      expect.objectContaining({ code: 'UNAUTHENTICATED' }),
    );
    expect(await service.getOverview('household_hearth_demo', false)).toMatchObject({
      source: null,
      lists: [],
      reminders: [],
    });
  });

  it('rejects child approval and allows only one active household source', async () => {
    const database = await openHearthDatabase(':memory:');
    const admin = new SqliteAdminRepository(database);
    repositories.push(admin);
    const service = new ReminderSourceService(admin, database, {
      clock: new FixedClock('2026-08-25T10:00:00+08:00'),
    });
    const first = await service.createPairing({
      requestId: 'request_reminder_pairing_first',
      deviceName: 'First iPhone',
      platform: 'ios',
      applicationVersion: '1.0.0',
      pairingSecret: secret,
    });
    await expect(
      service.approvePairing('household_hearth_demo', 'member_ezra', {
        requestId: 'request_reminder_child_approval',
        code: first.code,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await service.approvePairing('household_hearth_demo', 'member_maya', {
      requestId: 'request_reminder_first_approval',
      code: first.code,
    });
    await service.exchangePairing(first.id, secret, 'request_reminder_first_exchange');

    const second = await service.createPairing({
      requestId: 'request_reminder_pairing_second',
      deviceName: 'Second iPhone',
      platform: 'ios',
      applicationVersion: '1.0.0',
      pairingSecret: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    });
    await expect(
      service.approvePairing('household_hearth_demo', 'member_maya', {
        requestId: 'request_reminder_second_approval',
        code: second.code,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
