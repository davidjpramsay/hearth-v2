import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '@hearth/shared';

import { eventColorVariables, layoutTimedWeekEvents } from './calendar';

describe('calendar event presentation', () => {
  it('uses deep source-colour fills in light and dark themes', () => {
    expect(eventColorVariables('#6b4fa3')).toMatchObject({
      '--event-background': 'rgba(107, 79, 163, 0.36)',
      '--event-background-dark': 'rgba(107, 79, 163, 0.44)',
      '--event-border': 'rgba(107, 79, 163, 0.74)',
    });
  });

  it('assigns simultaneous events to stable side-by-side lanes', () => {
    const layouts = layoutTimedWeekEvents([
      event('second', '2026-08-03T08:30:00+08:00', '2026-08-03T09:30:00+08:00'),
      event('first', '2026-08-03T08:00:00+08:00', '2026-08-03T09:00:00+08:00'),
      event('later', '2026-08-03T11:00:00+08:00', '2026-08-03T12:00:00+08:00'),
    ]);

    expect(
      layouts.map(({ event: item, laneIndex, laneCount }) => [item.id, laneIndex, laneCount]),
    ).toEqual([
      ['first', 0, 2],
      ['second', 1, 2],
      ['later', 0, 1],
    ]);
  });

  it('accounts for the readable minimum card height when detecting collisions', () => {
    const layouts = layoutTimedWeekEvents([
      event('short-first', '2026-08-03T08:00:00+08:00', '2026-08-03T08:30:00+08:00'),
      event('short-second', '2026-08-03T09:00:00+08:00', '2026-08-03T09:30:00+08:00'),
      event('touching', '2026-08-03T11:00:00+08:00', '2026-08-03T11:30:00+08:00'),
    ]);

    expect(
      layouts.map(({ event: item, laneIndex, laneCount }) => [item.id, laneIndex, laneCount]),
    ).toEqual([
      ['short-first', 0, 2],
      ['short-second', 1, 2],
      ['touching', 0, 1],
    ]);
  });
});

function event(id: string, start: string, end: string): CalendarEvent {
  return {
    id,
    calendarId: 'calendar_test',
    title: id,
    owner: null,
    sourceLabel: 'Family',
    color: '#3f7251',
    start,
    end,
    startLocalDate: '2026-08-03',
    endLocalDate: '2026-08-03',
    allDay: false,
    location: null,
    providerVersion: 'test',
    recurrenceMasterId: null,
    isRecurrenceException: false,
  };
}
