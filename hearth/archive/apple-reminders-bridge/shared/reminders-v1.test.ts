import { describe, expect, it } from 'vitest';

import {
  MAX_REMINDER_SNAPSHOT_ITEMS,
  ReminderSnapshotItemInputSchema,
  ReminderSourceDeviceSessionSchema,
  ReplaceReminderSnapshotRequestSchema,
} from './reminders.js';

const baseSnapshot = {
  contractVersion: 1 as const,
  requestId: 'request_reminders_snapshot_001',
  snapshotId: 'snapshot_reminders_001',
  sequence: 1,
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
};

describe('Reminders v1 wire contract', () => {
  it('accepts one bounded full EventKit snapshot', () => {
    const snapshot = ReplaceReminderSnapshotRequestSchema.parse(baseSnapshot);
    expect(snapshot).toMatchObject({
      contractVersion: 1,
      sequence: 1,
      lists: [{ title: 'Family Reminders' }],
      reminders: [{ title: 'Put the bins out', hasDueTime: true }],
    });
  });

  it('normalizes blank user-facing titles without changing source identifiers', () => {
    const snapshot = ReplaceReminderSnapshotRequestSchema.parse({
      ...baseSnapshot,
      lists: [{ sourceListId: '  exact-list-id  ', title: ' ' }],
      reminders: [
        {
          ...baseSnapshot.reminders[0],
          sourceReminderId: '  exact-reminder-id  ',
          sourceListId: '  exact-list-id  ',
          title: '',
        },
      ],
    });
    expect(snapshot.lists[0]).toEqual({
      sourceListId: '  exact-list-id  ',
      title: 'Reminders',
    });
    expect(snapshot.reminders[0]?.title).toBe('Untitled reminder');
    expect(snapshot.reminders[0]?.sourceReminderId).toBe('  exact-reminder-id  ');
  });

  it('rejects duplicate, orphaned and internally inconsistent reminder rows', () => {
    expect(
      ReplaceReminderSnapshotRequestSchema.safeParse({
        ...baseSnapshot,
        lists: [...baseSnapshot.lists, ...baseSnapshot.lists],
      }).success,
    ).toBe(false);
    expect(
      ReplaceReminderSnapshotRequestSchema.safeParse({
        ...baseSnapshot,
        reminders: [
          {
            ...baseSnapshot.reminders[0],
            sourceListId: 'eventkit-list-not-in-snapshot',
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      ReminderSnapshotItemInputSchema.safeParse({
        ...baseSnapshot.reminders[0],
        dueAt: null,
        hasDueTime: true,
      }).success,
    ).toBe(false);
    expect(
      ReminderSnapshotItemInputSchema.safeParse({
        ...baseSnapshot.reminders[0],
        isCompleted: false,
        completedAt: '2026-08-25T10:00:00+08:00',
      }).success,
    ).toBe(false);
  });

  it('accepts an intentional empty full snapshot and rejects payloads beyond the v1 bound', () => {
    expect(
      ReplaceReminderSnapshotRequestSchema.parse({
        ...baseSnapshot,
        lists: [],
        reminders: [],
      }),
    ).toMatchObject({ lists: [], reminders: [] });

    const reminders = Array.from({ length: MAX_REMINDER_SNAPSHOT_ITEMS + 1 }, (_, index) => ({
      ...baseSnapshot.reminders[0],
      sourceReminderId: `eventkit-reminder-${index}`,
    }));
    expect(
      ReplaceReminderSnapshotRequestSchema.safeParse({ ...baseSnapshot, reminders }).success,
    ).toBe(false);
  });

  it('keeps native source sessions narrowly scoped', () => {
    const session = ReminderSourceDeviceSessionSchema.parse({
      contractVersion: 1,
      householdId: 'household_ramsay',
      deviceId: 'reminder_device_001',
      sourceId: 'reminder_source_001',
      scopes: ['reminders.snapshot.write'],
      pairedAt: '2026-08-25T10:00:00+08:00',
      nextSnapshotSequence: 1,
    });
    expect(session.scopes).toEqual(['reminders.snapshot.write']);
    expect(JSON.stringify(session)).not.toMatch(/calendar|chores|lists.change/i);
  });
});
