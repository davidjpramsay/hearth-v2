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
  it('rejects writes above capacity and keeps over-limit legacy rows readable and removable', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'hearth-reminder-capacity-'));
    temporaryDirectories.push(directory);
    const database = await openHearthDatabase(join(directory, 'hearth.sqlite'));
    const clock = new FixedClock(DEMO_NOW);
    const admin = new SqliteAdminRepository(database, { seedDemo: true, now: () => clock.now() });
    const reminders = new ReminderService(admin, database, { seedDemo: true, clock });
    const initial = await reminders.getOverview(DEMO_HOUSEHOLD_ID, true);
    const template = initial.reminders[0]!;
    const insert = database.prepare(`INSERT INTO hearth_reminders
      SELECT ?, household_id, list_id, title, due_local_date, due_at, has_due_time,
        is_completed, completed_at, created_at, updated_at, deleted_at FROM hearth_reminders WHERE id = ?`);
    database.transaction(() => {
      for (let index = initial.reminders.length; index < 1000; index += 1)
        insert.run(`reminder_capacity_${index}`, template.id);
    })();
    await expect(
      reminders.create(
        DEMO_HOUSEHOLD_ID,
        {
          requestId: 'request_excess_reminder',
          title: 'Overflow',
          dueLocalDate: null,
          dueAt: null,
          hasDueTime: false,
        },
        DEMO_TV_ACTOR,
      ),
    ).rejects.toThrow(/Remove an old reminder/);
    insert.run('reminder_legacy_excess', template.id);
    const legacy = await reminders.getOverview(DEMO_HOUSEHOLD_ID, true);
    expect(legacy.reminders).toHaveLength(1000);
    expect(legacy.hasMore).toBe(true);
    expect(legacy.lists[0]?.reminderCount).toBe(1001);
    await reminders.delete(
      DEMO_HOUSEHOLD_ID,
      'reminder_legacy_excess',
      'request_remove_legacy_excess',
      DEMO_TV_ACTOR,
    );
    expect((await reminders.getOverview(DEMO_HOUSEHOLD_ID, true)).hasMore).toBeUndefined();
    database
      .prepare("UPDATE hearth_reminders SET due_local_date = '9999-99-99' WHERE id = ?")
      .run(template.id);
    const malformed = (await reminders.getOverview(DEMO_HOUSEHOLD_ID, true)).reminders.find(
      (item) => item.id === template.id,
    );
    expect(malformed).toMatchObject({ dueLocalDate: null, dueDateUnavailable: true });
    database.close();
  });
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

    const legacyReceipt = {
      ...created,
      reminder: { ...created.reminder, dueLocalDate: '9999-99-99' },
    };
    database
      .prepare('UPDATE command_receipts SET response_json = ? WHERE request_id = ?')
      .run(JSON.stringify(legacyReceipt), createInput.requestId);
    expect(await reminders.create(DEMO_HOUSEHOLD_ID, createInput, DEMO_TV_ACTOR)).toMatchObject({
      replayed: true,
      reminder: { dueLocalDate: null, dueDateUnavailable: true },
    });
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
