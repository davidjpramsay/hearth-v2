import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DEMO_ADMIN_ACTOR_ID, SqliteAdminRepository, credentialHash } from './admin-repository.js';
import { openHearthDatabase } from './database.js';
import { DEMO_HOUSEHOLD_ID } from './demo/seed.js';
import { SqlitePlanningRepository } from './planning-repository.js';
import { PocketMoneyService } from './pocket-money-repository.js';
import { SqliteHearthRepository } from './sqlite-hearth-repository.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true })),
  );
});

describe('SQLite admin repository', () => {
  it('leaves a private first-use database empty when demo seeding is disabled', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-private-'));
    temporaryDirectories.push(directory);
    const database = await openHearthDatabase(join(directory, 'hearth.sqlite'));
    const repository = new SqliteAdminRepository(database, { seedDemo: false });
    const hearth = new SqliteHearthRepository(database, { seedDemo: false });
    new SqlitePlanningRepository(database, { seedDemo: false });
    new PocketMoneyService(hearth, repository, database, { seedDemo: false });
    const householdCount = database.prepare('SELECT COUNT(*) AS count FROM households').get() as {
      count: number;
    };
    const memberCount = database.prepare('SELECT COUNT(*) AS count FROM members').get() as {
      count: number;
    };
    const listCount = database.prepare('SELECT COUNT(*) AS count FROM household_lists').get() as {
      count: number;
    };
    const pocketMoneyCount = database
      .prepare('SELECT COUNT(*) AS count FROM pocket_money_settings')
      .get() as { count: number };
    expect(householdCount.count).toBe(0);
    expect(memberCount.count).toBe(0);
    expect(listCount.count).toBe(0);
    expect(pocketMoneyCount.count).toBe(0);
    repository.close();
  });

  it('survives restart and can be restored from a closed development backup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-admin-'));
    temporaryDirectories.push(directory);
    const livePath = join(directory, 'hearth.sqlite');
    const backupPath = join(directory, 'hearth.backup.sqlite');

    const first = new SqliteAdminRepository(await openHearthDatabase(livePath));
    await first.updateHousehold(DEMO_HOUSEHOLD_ID, DEMO_ADMIN_ACTOR_ID, {
      requestId: 'request_restart_household',
      name: 'Persistent household',
      timezone: 'Australia/Perth',
    });
    await first.createMember(DEMO_HOUSEHOLD_ID, DEMO_ADMIN_ACTOR_ID, {
      requestId: 'request_restart_member',
      displayName: 'Alex',
      role: 'child',
      color: '#718778',
      administrator: false,
    });
    first.close();
    await copyFile(livePath, backupPath);

    const restarted = new SqliteAdminRepository(await openHearthDatabase(livePath));
    const afterRestart = await restarted.getOverview(DEMO_HOUSEHOLD_ID, DEMO_ADMIN_ACTOR_ID);
    expect(afterRestart.household.name).toBe('Persistent household');
    expect(afterRestart.household.members.map((member) => member.displayName)).toContain('Alex');
    restarted.close();

    const restored = new SqliteAdminRepository(await openHearthDatabase(backupPath));
    const afterRestore = await restored.getOverview(DEMO_HOUSEHOLD_ID, DEMO_ADMIN_ACTOR_ID);
    expect(afterRestore.household.name).toBe('Persistent household');
    expect(afterRestore.recentAudit.map((event) => event.action)).toContain('member.create');
    restored.close();
  });

  it('stores only a television credential hash and revokes its session', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-admin-'));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, 'hearth.sqlite');
    const database = await openHearthDatabase(databasePath);
    const repository = new SqliteAdminRepository(database);
    const pairingSecret = 'b'.repeat(43);
    const pairing = await repository.createPairing(
      'Living room Google TV',
      'request_tv_repository_start',
      credentialHash(pairingSecret),
      '0.1.0-test',
    );
    const device = await repository.approvePairing(
      DEMO_HOUSEHOLD_ID,
      DEMO_ADMIN_ACTOR_ID,
      pairing.code,
      'request_tv_repository_approve',
    );
    const session = await repository.exchangeTvPairing(
      pairing.id,
      pairingSecret,
      'request_tv_repository_exchange',
    );
    const stored = database
      .prepare('SELECT credential_reference FROM paired_devices WHERE id = ?')
      .get(device.id) as { credential_reference: string };

    expect(session).toMatchObject({ deviceId: device.id, householdId: DEMO_HOUSEHOLD_ID });
    expect(repository.authenticateDeviceCredential(pairingSecret)).toMatchObject({
      id: device.id,
      type: 'device',
      source: 'tv',
    });
    expect(stored.credential_reference).toBe(`sha256:${credentialHash(pairingSecret)}`);
    expect(stored.credential_reference).not.toContain(pairingSecret);

    await repository.revokeDevice(
      DEMO_HOUSEHOLD_ID,
      device.id,
      DEMO_ADMIN_ACTOR_ID,
      'request_tv_repository_revoke',
    );
    expect(() => repository.authenticateDeviceCredential(pairingSecret)).toThrow(
      /not paired with Hearth/,
    );
    repository.close();
  });

  it('persists, replays and restores bounded local member profile photos', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-admin-'));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, 'hearth.sqlite');
    const database = await openHearthDatabase(databasePath);
    const repository = new SqliteAdminRepository(database);
    const dataBase64 = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
    const input = {
      requestId: 'request_avatar_repository_update',
      mimeType: 'image/jpeg' as const,
      dataBase64,
    };

    const updated = await repository.updateMemberAvatar(
      DEMO_HOUSEHOLD_ID,
      'member_ezra',
      DEMO_ADMIN_ACTOR_ID,
      input,
    );
    const replay = await repository.updateMemberAvatar(
      DEMO_HOUSEHOLD_ID,
      'member_ezra',
      DEMO_ADMIN_ACTOR_ID,
      input,
    );
    const asset = await repository.getMemberAvatar(DEMO_HOUSEHOLD_ID, 'member_ezra');
    const receipt = database
      .prepare(
        `SELECT response_json FROM command_receipts
         WHERE request_id = 'request_avatar_repository_update'`,
      )
      .get() as { response_json: string };

    expect(updated).toMatchObject({
      replayed: false,
      member: { avatarUrl: expect.stringContaining('/member_ezra/avatar?v=') },
      audit: { action: 'member.avatar.update' },
    });
    expect(replay).toMatchObject({ replayed: true, member: updated.member });
    expect(Buffer.from(asset.bytes)).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    expect(receipt.response_json).not.toContain(dataBase64);

    repository.close();
    const restarted = new SqliteAdminRepository(await openHearthDatabase(databasePath));
    const persisted = await restarted.getMemberAvatar(DEMO_HOUSEHOLD_ID, 'member_ezra');
    expect(Buffer.from(persisted.bytes)).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    const reset = await restarted.resetMemberAvatar(
      DEMO_HOUSEHOLD_ID,
      'member_ezra',
      DEMO_ADMIN_ACTOR_ID,
      'request_avatar_repository_reset',
    );
    expect(reset).toMatchObject({
      replayed: false,
      member: { avatarUrl: '/demo/ezra.png' },
      audit: { action: 'member.avatar.reset', result: 'reversed' },
    });
    await expect(restarted.getMemberAvatar(DEMO_HOUSEHOLD_ID, 'member_ezra')).rejects.toThrow(
      /could not be found/,
    );
    await expect(
      restarted.updateMemberAvatar(DEMO_HOUSEHOLD_ID, 'member_ezra', 'member_ezra', {
        ...input,
        requestId: 'request_avatar_child_denied',
      }),
    ).rejects.toThrow(/administrator/);
    restarted.close();
  });
});
