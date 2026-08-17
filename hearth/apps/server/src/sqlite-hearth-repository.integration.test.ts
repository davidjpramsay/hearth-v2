import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { SqliteAdminRepository } from './admin-repository.js';
import { openHearthDatabase } from './database.js';
import { DEMO_HOUSEHOLD_ID } from './demo/seed.js';
import { DEMO_TV_ACTOR, type CommandActor, type RepositoryError } from './repository.js';
import { SqliteHearthRepository } from './sqlite-hearth-repository.js';

const temporaryDirectories: string[] = [];
const openDatabases: InstanceType<typeof Database>[] = [];

afterEach(async () => {
  for (const database of openDatabases.splice(0)) {
    if (database.open) database.close();
  }
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true })),
  );
});

async function repositoryAt(path: string) {
  const database = await openHearthDatabase(path);
  openDatabases.push(database);
  new SqliteAdminRepository(database);
  return { database, repository: new SqliteHearthRepository(database) };
}

const adult: CommandActor = { id: 'member_maya', type: 'member', source: 'companion' };
const child: CommandActor = { id: 'member_ezra', type: 'member', source: 'companion' };
const automation: CommandActor = {
  id: 'service_home_assistant',
  type: 'service',
  source: 'automation',
};

describe('SQLite Hearth repository', () => {
  it('serves a complete Month grid from the durable calendar projection during outage', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-month-'));
    temporaryDirectories.push(directory);
    const { repository } = await repositoryAt(join(directory, 'hearth.sqlite'));

    const current = await repository.getMonth(DEMO_HOUSEHOLD_ID, '2026-08');
    expect(current).toMatchObject({
      gridStartDate: '2026-07-27',
      gridEndDate: '2026-09-06',
      displayMonth: 'August',
      freshness: 'current',
    });
    expect(current.days).toHaveLength(42);
    expect(current.events).toHaveLength(22);

    repository.setScenario('unavailable');
    const cached = await repository.getMonth(DEMO_HOUSEHOLD_ID, '2026-08');
    expect(cached).toMatchObject({
      freshness: 'stale',
      statusMessage: 'Calendar is unavailable · Showing saved plans.',
    });
    expect(cached.events).toHaveLength(current.events.length);
  });

  it('persists a command receipt and occurrence state across restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-chores-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'hearth.sqlite');
    const backupPath = join(directory, 'hearth.backup.sqlite');
    const first = await repositoryAt(path);
    const completed = await first.repository.complete(
      DEMO_HOUSEHOLD_ID,
      'occurrence_school_bag',
      'request_persist_complete',
      DEMO_TV_ACTOR,
    );
    first.database.close();
    openDatabases.splice(openDatabases.indexOf(first.database), 1);
    await copyFile(path, backupPath);

    const restarted = await repositoryAt(path);
    const chores = await restarted.repository.getChores(DEMO_HOUSEHOLD_ID, '2026-08-03');
    const persisted = chores.groups
      .flatMap((group) => group.occurrences)
      .find((occurrence) => occurrence.id === 'occurrence_school_bag');
    const replay = await restarted.repository.complete(
      DEMO_HOUSEHOLD_ID,
      'occurrence_school_bag',
      'request_persist_complete',
      DEMO_TV_ACTOR,
    );
    expect(persisted).toMatchObject({ state: 'completed', completionId: completed.completionId });
    expect(replay).toMatchObject({ replayed: true, completionId: completed.completionId });
    expect(
      restarted.database
        .prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action_type = 'chore.complete'")
        .get(),
    ).toEqual({ count: 1 });

    const restored = await repositoryAt(backupPath);
    const restoredChores = await restored.repository.getChores(DEMO_HOUSEHOLD_ID, '2026-08-03');
    expect(
      restoredChores.groups
        .flatMap((group) => group.occurrences)
        .find((occurrence) => occurrence.id === 'occurrence_school_bag'),
    ).toMatchObject({ state: 'completed', completionId: completed.completionId });
  });

  it('keeps historical occurrence snapshots while new dates use edited templates', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-chores-'));
    temporaryDirectories.push(directory);
    const { database, repository } = await repositoryAt(join(directory, 'hearth.sqlite'));
    const oldDate = await repository.getChores(DEMO_HOUSEHOLD_ID, '2026-08-03');
    database
      .prepare("UPDATE chore_templates SET title = 'Give Pepper breakfast' WHERE id = ?")
      .run('template_feed_pepper');
    const newDate = await repository.getChores(DEMO_HOUSEHOLD_ID, '2026-08-04');
    expect(
      oldDate.groups
        .flatMap((group) => group.occurrences)
        .find((item) => item.id === 'occurrence_feed_pepper')?.title,
    ).toBe('Feed Pepper');
    expect(
      newDate.groups
        .flatMap((group) => group.occurrences)
        .find((item) => item.assignee.id === 'member_ezra' && item.title.includes('Pepper'))?.title,
    ).toBe('Give Pepper breakfast');
  });

  it('enforces TV, adult, child and automation permissions and audits outcomes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-chores-'));
    temporaryDirectories.push(directory);
    const { database, repository } = await repositoryAt(join(directory, 'hearth.sqlite'));

    await repository.complete(
      DEMO_HOUSEHOLD_ID,
      'occurrence_school_bag',
      'request_child_own',
      child,
    );
    await expect(
      repository.complete(DEMO_HOUSEHOLD_ID, 'occurrence_laundry', 'request_child_other', child),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<RepositoryError>);
    await repository.skip(
      DEMO_HOUSEHOLD_ID,
      'occurrence_laundry',
      'request_adult_skip',
      'Waiting for dry weather',
      adult,
    );
    await repository.complete(
      DEMO_HOUSEHOLD_ID,
      'occurrence_herbs',
      'request_automation_complete',
      automation,
    );
    await repository.complete(
      DEMO_HOUSEHOLD_ID,
      'occurrence_dishes',
      'request_tv_complete',
      DEMO_TV_ACTOR,
    );
    await repository.complete(
      DEMO_HOUSEHOLD_ID,
      'occurrence_feed_pepper',
      'request_voice_complete',
      { id: 'member_maya', type: 'member', source: 'voice' },
    );

    const rows = database
      .prepare(
        `SELECT actor_type, source_channel, action_type, result FROM audit_events
         WHERE action_type LIKE 'chore.%' ORDER BY request_id`,
      )
      .all() as Array<Record<string, string>>;
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actor_type: 'member',
          action_type: 'chore.complete',
          result: 'rejected',
        }),
        expect.objectContaining({
          source_channel: 'companion',
          action_type: 'chore.skip',
          result: 'succeeded',
        }),
        expect.objectContaining({ source_channel: 'automation', result: 'succeeded' }),
        expect.objectContaining({ actor_type: 'device', source_channel: 'tv' }),
        expect.objectContaining({ actor_type: 'member', source_channel: 'voice' }),
      ]),
    );
  });

  it('persists reasoned skip, excuse, reassignment and adult-readable occurrence history', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-chore-management-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'hearth.sqlite');
    const first = await repositoryAt(path);

    const initial = await first.repository.getChoreOccurrenceDetail(
      DEMO_HOUSEHOLD_ID,
      'occurrence_laundry',
      adult,
    );
    expect(initial).toMatchObject({
      occurrence: { state: 'pending', dueTime: '07:20' },
      history: [],
    });
    await expect(
      first.repository.getChoreOccurrenceDetail(DEMO_HOUSEHOLD_ID, 'occurrence_laundry', child),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<RepositoryError>);

    const skipped = await first.repository.skip(
      DEMO_HOUSEHOLD_ID,
      'occurrence_laundry',
      'request_reasoned_skip',
      'Waiting for dry weather',
      adult,
    );
    const skipReplay = await first.repository.skip(
      DEMO_HOUSEHOLD_ID,
      'occurrence_laundry',
      'request_reasoned_skip',
      'Waiting for dry weather',
      adult,
    );
    expect(skipped).toMatchObject({ occurrence: { state: 'skipped' }, replayed: false });
    expect(skipReplay).toMatchObject({ occurrence: { state: 'skipped' }, replayed: true });

    const excused = await first.repository.excuse(
      DEMO_HOUSEHOLD_ID,
      'occurrence_laundry',
      'request_reasoned_excuse',
      'Maya is away at school camp',
      adult,
    );
    expect(excused.occurrence.state).toBe('excused');

    const reassigned = await first.repository.reassign(
      DEMO_HOUSEHOLD_ID,
      'occurrence_school_bag',
      'request_reasoned_reassign',
      'member_maya',
      'Ezra and Maya swapped morning jobs',
      adult,
    );
    const reassignReplay = await first.repository.reassign(
      DEMO_HOUSEHOLD_ID,
      'occurrence_school_bag',
      'request_reasoned_reassign',
      'member_maya',
      'Ezra and Maya swapped morning jobs',
      adult,
    );
    expect(reassigned).toMatchObject({
      occurrence: { state: 'pending', assignee: { id: 'member_maya' } },
      replayed: false,
    });
    expect(reassignReplay.replayed).toBe(true);

    first.database.close();
    openDatabases.splice(openDatabases.indexOf(first.database), 1);
    const restarted = await repositoryAt(path);
    const excuseHistory = await restarted.repository.getChoreOccurrenceDetail(
      DEMO_HOUSEHOLD_ID,
      'occurrence_laundry',
      adult,
    );
    expect(excuseHistory.history).toMatchObject([
      { action: 'chore.excuse', reason: 'Maya is away at school camp' },
      { action: 'chore.skip', reason: 'Waiting for dry weather' },
    ]);
    const reassignHistory = await restarted.repository.getChoreOccurrenceDetail(
      DEMO_HOUSEHOLD_ID,
      'occurrence_school_bag',
      adult,
    );
    expect(reassignHistory).toMatchObject({
      occurrence: { assignee: { id: 'member_maya' } },
      history: [
        {
          action: 'chore.reassign',
          label: 'Reassigned from Ezra to Maya',
          reason: 'Ezra and Maya swapped morning jobs',
        },
      ],
    });
    expect(
      restarted.database
        .prepare(
          `SELECT COUNT(*) AS count FROM audit_events
           WHERE action_type IN ('chore.skip', 'chore.excuse', 'chore.reassign')
             AND result = 'succeeded'`,
        )
        .get(),
    ).toEqual({ count: 3 });
  });
});
