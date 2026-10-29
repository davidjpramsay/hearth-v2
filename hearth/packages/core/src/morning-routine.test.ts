import { describe, expect, it } from 'vitest';
import { morningClock, morningProfileForDate } from './morning-routine.js';
import { defaultMorningProfiles } from '@hearth/shared';
describe('household morning clock', () => {
  it.each([
    ['2026-10-26T06:59:59+08:00', 'before', 3600, 0],
    ['2026-10-26T07:00:00+08:00', 'running', 3600, 0],
    ['2026-10-26T07:30:00+08:00', 'running', 1800, 0.5],
    ['2026-10-26T07:59:59+08:00', 'running', 1, 3599 / 3600],
    ['2026-10-26T08:00:00+08:00', 'finished', 0, 1],
    ['2026-10-24T07:30:00+08:00', 'weekend', 1800, 0.5],
  ])(
    'projects %s independently of opening time',
    (instant, phase, remainingSeconds, elapsedFraction) => {
      expect(morningClock(instant as string, 'Australia/Perth', '07:00', '08:00')).toMatchObject({
        phase,
        remainingSeconds,
        elapsedFraction,
      });
    },
  );
  it('uses the household date across UTC midnight and daylight saving', () => {
    expect(morningClock('2026-10-25T23:30:00Z', 'Australia/Perth', '07:00', '08:00')).toMatchObject(
      { localDate: '2026-10-26', phase: 'running', remainingSeconds: 1800 },
    );
    expect(
      morningClock('2026-10-25T20:30:00Z', 'Australia/Sydney', '07:00', '08:00'),
    ).toMatchObject({ localDate: '2026-10-26', phase: 'running', remainingSeconds: 1800 });
  });
});

it('chooses the assigned profile including custom days, and permits untimed weekends', () => {
  const profiles = defaultMorningProfiles({
    startTime: '07:00',
    endTime: '08:00',
    selectedMemberIds: [],
    routines: [],
  });
  expect(morningProfileForDate('2026-10-26', profiles)).toBe('schoolDays');
  expect(morningProfileForDate('2026-10-31', profiles)).toBe('weekends');
  profiles.schoolDays.days = ['tue'];
  expect(morningProfileForDate('2026-10-26', profiles)).toBeNull();
  expect(
    morningClock('2026-10-31T07:30:00+08:00', 'Australia/Perth', '07:00', '08:00', {
      scheduled: true,
      countdownEnabled: false,
    }).phase,
  ).toBe('untimed');
  expect(
    morningClock('2026-10-31T09:30:00+08:00', 'Australia/Perth', '09:00', '10:00', {
      scheduled: true,
      countdownEnabled: true,
    }),
  ).toMatchObject({ phase: 'running', remainingSeconds: 1800 });
  expect(
    morningClock('2026-10-26T07:30:00+08:00', 'Australia/Perth', '07:00', '08:00', {
      scheduled: false,
      countdownEnabled: true,
    }).phase,
  ).toBe('unscheduled');
});
