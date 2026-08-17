import { describe, expect, it } from 'vitest';

import type { ChoreList, TodaySummary } from '@hearth/shared';

import { buildAssistDaySummary, evaluateAutomaticScreenOff, resolveAssistChore } from './home.js';

const chores = {
  householdId: 'household_test',
  localDate: '2026-08-03',
  displayDate: 'Monday, 3 August',
  completedCount: 0,
  totalCount: 1,
  groups: [
    {
      member: {
        id: 'member_ezra',
        displayName: 'Ezra',
        color: '#1668b7',
        avatarUrl: '/demo/ezra.png',
        role: 'child',
        capabilities: ['household.view', 'chores.complete'],
      },
      occurrences: [
        {
          id: 'occurrence_dishwasher',
          title: 'Dishwasher',
          assignee: {
            id: 'member_ezra',
            displayName: 'Ezra',
            color: '#1668b7',
            avatarUrl: '/demo/ezra.png',
            role: 'child',
            capabilities: ['household.view', 'chores.complete'],
          },
          routineLabel: 'Evening',
          availableFromTime: '17:30',
          dueTime: '18:45',
          sortOrder: 0,
          localDate: '2026-08-03',
          state: 'pending',
          completionId: null,
          completedAt: null,
          completedLabel: null,
          locked: false,
        },
      ],
    },
  ],
} satisfies ChoreList;

describe('Home domain', () => {
  it('blocks automatic shutdown for protected native playback before other conditions', () => {
    expect(
      evaluateAutomaticScreenOff({
        hearthForeground: true,
        occupied: false,
        protectedMediaActive: true,
      }),
    ).toEqual({ automaticScreenOffAllowed: false, reason: 'protected-media-active' });
  });

  it('allows automatic shutdown only while Hearth is foreground, the room is clear and media is unprotected', () => {
    expect(
      evaluateAutomaticScreenOff({
        hearthForeground: true,
        occupied: false,
        protectedMediaActive: false,
      }),
    ).toEqual({ automaticScreenOffAllowed: true, reason: 'clear' });
    expect(
      evaluateAutomaticScreenOff({
        hearthForeground: false,
        occupied: false,
        protectedMediaActive: false,
      }).reason,
    ).toBe('hearth-not-foreground');
  });

  it('resolves one structured Assist chore without guessing', () => {
    expect(resolveAssistChore(chores, ' EZRA ', 'dishwasher').id).toBe('occurrence_dishwasher');
    expect(() => resolveAssistChore(chores, 'Maya', 'dishwasher')).toThrow('couldn’t find');
  });

  it('rejects ambiguous Assist chore matches', () => {
    const occurrence = chores.groups[0]?.occurrences[0];
    if (occurrence === undefined) throw new Error('Expected the test chore.');
    const ambiguous: ChoreList = {
      ...chores,
      totalCount: 2,
      groups: [
        {
          ...chores.groups[0]!,
          occurrences: [occurrence, { ...occurrence, id: 'occurrence_dishwasher_second' }],
        },
      ],
    };
    expect(() => resolveAssistChore(ambiguous, 'Ezra', 'dishwasher')).toThrow('More than one');
  });

  it('builds deterministic speech for Home Assistant to speak', () => {
    const today = {
      events: [{ title: 'School drop-off', start: '2026-08-03T08:15:00+08:00' }],
      chores: [{ state: 'pending' }, { state: 'completed' }],
      dinner: 'Lemon chicken',
    } as TodaySummary;
    expect(buildAssistDaySummary(today)).toBe(
      'Today has 1 event. The first event is School drop-off at 8:15 am. There is 1 chore still to do. Dinner is Lemon chicken.',
    );
  });
});
