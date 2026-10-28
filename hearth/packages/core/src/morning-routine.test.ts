import { describe, expect, it } from 'vitest';
import { morningClock } from './morning-routine.js';
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
