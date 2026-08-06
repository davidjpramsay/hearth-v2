import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SqliteAdminRepository } from './admin-repository.js';
import { openHearthDatabase } from './database.js';
import { HomeService } from './home-repository.js';
import { FakeHomeAssistantProvider } from './integrations/home-assistant-provider.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true })),
  );
});

describe('SQLite HomeService', () => {
  it('persists curated cache, command receipts and safe audit summaries', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-home-'));
    temporaryDirectories.push(directory);
    const database = await openHearthDatabase(join(directory, 'hearth.sqlite'));
    const admin = new SqliteAdminRepository(database);
    const provider = new FakeHomeAssistantProvider();
    const service = new HomeService(provider, database);
    const actor = { id: 'member_maya', type: 'member', source: 'companion' } as const;

    await service.getStatus('household_hearth_demo');
    const first = await service.executeAction(
      'household_hearth_demo',
      'evening-mode',
      { requestId: 'request_home_sqlite_001', confirmed: false },
      actor,
    );
    const replay = await service.executeAction(
      'household_hearth_demo',
      'evening-mode',
      { requestId: 'request_home_sqlite_001', confirmed: false },
      actor,
    );

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(provider.calls).toEqual(['script.hearth_evening']);
    expect(
      database
        .prepare('SELECT protected_media_active FROM home_state_cache WHERE household_id = ?')
        .get('household_hearth_demo'),
    ).toEqual({ protected_media_active: 0 });
    expect(
      database
        .prepare(
          "SELECT action_type, target_type, safe_summary_json FROM audit_events WHERE action_type = 'home.action.execute'",
        )
        .get(),
    ).toEqual({
      action_type: 'home.action.execute',
      target_type: 'home_action',
      safe_summary_json: '{}',
    });
    admin.close();
  });
});
