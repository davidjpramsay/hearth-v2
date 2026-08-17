import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SqliteAdminRepository } from './admin-repository.js';
import { openHearthDatabase } from './database.js';
import { DEMO_HOUSEHOLD_ID } from './demo/seed.js';
import { TodayContentService } from './today-content-repository.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('SQLite Today content', () => {
  it('persists notice, visibility, audit and idempotent receipt state across restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-today-content-'));
    directories.push(directory);
    const database = await openHearthDatabase(join(directory, 'hearth.sqlite'));
    new SqliteAdminRepository(database);
    const service = new TodayContentService(database);
    const actor = { id: 'member_maya', type: 'member', source: 'companion' } as const;

    const created = await service.createNotice(
      DEMO_HOUSEHOLD_ID,
      {
        requestId: 'request_notice_persist',
        message: 'Library books tomorrow',
        priority: 'important',
        startsAt: '2026-08-02T00:00:00.000Z',
        expiresAt: '2026-08-04T00:00:00.000Z',
      },
      actor,
    );
    const replay = await service.createNotice(
      DEMO_HOUSEHOLD_ID,
      {
        requestId: 'request_notice_persist',
        message: 'Library books tomorrow',
        priority: 'important',
        startsAt: '2026-08-02T00:00:00.000Z',
        expiresAt: '2026-08-04T00:00:00.000Z',
      },
      actor,
    );
    expect(created.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.audit.id).toBe(created.audit.id);

    await service.updateSections(
      DEMO_HOUSEHOLD_ID,
      {
        requestId: 'request_sections_persist',
        dinner: false,
        listSummary: true,
        notice: true,
        photo: false,
      },
      actor,
    );
    const restarted = new TodayContentService(database);
    const configuration = await restarted.getConfiguration(DEMO_HOUSEHOLD_ID);
    expect(configuration.sections).toEqual({
      dinner: false,
      listSummary: true,
      notice: true,
      photo: false,
    });
    expect(configuration.notices).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: 'Library books tomorrow' })]),
    );
    expect(database.prepare('SELECT COUNT(*) AS count FROM audit_events').get()).toEqual({
      count: 2,
    });
    expect(database.prepare('SELECT COUNT(*) AS count FROM command_receipts').get()).toEqual({
      count: 2,
    });
    database.close();
  });
});
