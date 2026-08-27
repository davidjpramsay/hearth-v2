import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SqliteAdminRepository } from './admin-repository.js';
import { openHearthDatabase } from './database.js';
import { DEMO_HOUSEHOLD_ID, DEMO_NOW } from './demo/seed.js';
import { ReminderService } from './reminder-repository.js';
import { DEMO_TV_ACTOR } from './repository.js';
import { FixedClock } from './runtime-context.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Hearth reminder repository', () => {
  it('creates, edits, completes, reopens and removes local reminders idempotently', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-reminders-'));
    temporaryDirectories.push(directory);
    const database = await openHearthDatabase(join(directory, 'hearth.sqlite'));
    const clock = new FixedClock(DEMO_NOW);
    const admin = new SqliteAdminRepository(database, { seedDemo: true, now: () => clock.now() });
    const reminders = new ReminderService(admin, database, { seedDemo: true, clock });

    const initial = await reminders.getOverview(DEMO_HOUSEHOLD_ID, false);
    expect(initial.reminders).toHaveLength(3);
    expect(initial).not.toHaveProperty('source');

    const createInput = {
      requestId: 'request_reminder_create_test',
      title: 'Pack library bag',
      dueLocalDate: null,
      dueAt: null,
      hasDueTime: false,
    };
    const created = await reminders.create(DEMO_HOUSEHOLD_ID, createInput, DEMO_TV_ACTOR);
    const replay = await reminders.create(DEMO_HOUSEHOLD_ID, createInput, DEMO_TV_ACTOR);
    expect(created.replayed).toBe(false);
    expect(replay).toMatchObject({ replayed: true, reminder: { id: created.reminder.id } });
    expect((await reminders.getOverview(DEMO_HOUSEHOLD_ID, false)).reminders).toHaveLength(4);

    const updated = await reminders.update(
      DEMO_HOUSEHOLD_ID,
      created.reminder.id,
      {
        requestId: 'request_reminder_update_test',
        title: 'Pack books',
        dueLocalDate: '2026-08-04',
        dueAt: null,
        hasDueTime: false,
      },
      DEMO_TV_ACTOR,
    );
    expect(updated.reminder).toMatchObject({ title: 'Pack books', dueLocalDate: '2026-08-04' });

    const completed = await reminders.setCompletion(
      DEMO_HOUSEHOLD_ID,
      created.reminder.id,
      { requestId: 'request_reminder_complete_test', isCompleted: true },
      DEMO_TV_ACTOR,
    );
    expect(completed.reminder).toMatchObject({ isCompleted: true });
    expect((await reminders.getOverview(DEMO_HOUSEHOLD_ID, false)).reminders).toHaveLength(3);
    expect((await reminders.getOverview(DEMO_HOUSEHOLD_ID, true)).reminders).toHaveLength(4);

    await reminders.setCompletion(
      DEMO_HOUSEHOLD_ID,
      created.reminder.id,
      { requestId: 'request_reminder_reopen_test', isCompleted: false },
      DEMO_TV_ACTOR,
    );
    await reminders.delete(
      DEMO_HOUSEHOLD_ID,
      created.reminder.id,
      'request_reminder_delete_test',
      DEMO_TV_ACTOR,
    );
    expect((await reminders.getOverview(DEMO_HOUSEHOLD_ID, true)).reminders).toHaveLength(3);

    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'reminder_sources'",
        )
        .get(),
    ).toBeUndefined();
    database.close();
  });
});
