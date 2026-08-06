import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DEMO_ADMIN_ACTOR_ID, SqliteAdminRepository, credentialHash } from './admin-repository.js';
import { openHearthDatabase } from './database.js';
import { DEMO_HOUSEHOLD_ID } from './demo/seed.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true })),
  );
});

describe('SQLite admin repository', () => {
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
    const database = await openHearthDatabase(join(directory, 'hearth.sqlite'));
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
});
