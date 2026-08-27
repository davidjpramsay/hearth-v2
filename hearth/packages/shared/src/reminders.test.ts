import { describe, expect, it } from 'vitest';

import {
  CreateReminderRequestSchema,
  HearthReminderSchema,
  ReminderOverviewSchema,
} from './reminders.js';

describe('Hearth reminders contract', () => {
  it('accepts a concise native reminder', () => {
    expect(
      CreateReminderRequestSchema.parse({
        requestId: 'request_reminder_create_001',
        title: 'Put the bins out',
        dueLocalDate: '2026-08-27',
        dueAt: null,
        hasDueTime: false,
      }),
    ).toMatchObject({ title: 'Put the bins out', dueLocalDate: '2026-08-27' });
  });

  it('rejects blank titles and inconsistent due fields', () => {
    expect(
      CreateReminderRequestSchema.safeParse({
        requestId: 'request_reminder_create_002',
        title: ' ',
        dueLocalDate: null,
        dueAt: null,
        hasDueTime: false,
      }).success,
    ).toBe(false);
    expect(
      CreateReminderRequestSchema.safeParse({
        requestId: 'request_reminder_create_003',
        title: 'School pickup',
        dueLocalDate: '2026-08-27',
        dueAt: null,
        hasDueTime: true,
      }).success,
    ).toBe(false);
  });

  it('keeps native reminders free of external-source fields', () => {
    const reminder = HearthReminderSchema.parse({
      id: 'reminder_bins',
      listId: 'reminder_list_home',
      title: 'Put the bins out',
      dueLocalDate: null,
      dueAt: null,
      hasDueTime: false,
      isCompleted: false,
      completedAt: null,
      createdAt: '2026-08-27T10:00:00.000Z',
      updatedAt: '2026-08-27T10:00:00.000Z',
    });
    expect(JSON.stringify(reminder)).not.toMatch(/eventkit|source|snapshot|device/i);
  });

  it('returns a household-owned overview without a connected source', () => {
    expect(
      ReminderOverviewSchema.parse({
        householdId: 'household_demo',
        generatedAt: '2026-08-27T10:00:00.000Z',
        lists: [
          {
            id: 'reminder_list_home',
            title: 'Reminders',
            reminderCount: 0,
            incompleteCount: 0,
          },
        ],
        reminders: [],
      }),
    ).not.toHaveProperty('source');
  });
});
