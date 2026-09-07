import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '@hearth/shared';

import { eventColorVariables, eventsForDay } from './calendar';
import { layoutWeekDay, weekTimeline } from './weekLayout';
import { formatEventDateRange, formatEventDayTime } from './date';

describe('calendar event presentation', () => {
  it('uses opaque source-colour fills in light and dark themes', () => {
    expect(eventColorVariables('#6b4fa3')).toMatchObject({
      '--event-background': 'rgb(197, 186, 212)',
      '--event-background-dark': 'rgb(59, 49, 85)',
      '--event-border': '#6b4fa3',
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

function layoutTimedWeekEvents(events: CalendarEvent[]) {
  return layoutWeekDay(events, '2026-08-03', 'Australia/Perth', { start: 480, end: 1200 }).timed;
}

describe('bounded Week layout', () => {
  const timezone = 'Australia/Perth';
  const date = '2026-08-03';

  it('extends the shared clock axis for early and late plans', () => {
    const events = [
      event('early', `${date}T05:30:00+08:00`, `${date}T06:00:00+08:00`),
      event('late', `${date}T21:00:00+08:00`, `${date}T22:00:00+08:00`),
    ];
    const timeline = weekTimeline(events, [date], timezone);
    expect(timeline).toEqual({ start: 240, end: 1440 });
    expect(
      layoutWeekDay(events, date, timezone, timeline).timed.map((item) => item.event.id),
    ).toEqual(['early']);
    expect(layoutWeekDay(events, date, timezone, timeline).hiddenCount).toBe(1);
  });

  it('caps all-day rows and timed lanes while keeping every event in the full day', () => {
    const events = Array.from({ length: 10 }, (_, index) => ({
      ...event(`event-${index}`, `${date}T08:00:00+08:00`, `${date}T09:00:00+08:00`),
      allDay: index < 5,
    }));
    const layout = layoutWeekDay(events, date, timezone, { start: 480, end: 1200 });
    expect(layout.allDay).toHaveLength(2);
    expect(layout.timed).toHaveLength(2);
    expect(layout.timed.every((item) => item.laneCount === 2)).toBe(true);
    expect(layout.hiddenCount).toBe(6);
    expect(layout.events).toHaveLength(10);
  });

  it('leaves room for an evening card instead of hiding it at the old axis end', () => {
    const events = [event('evening', `${date}T19:00:00+08:00`, `${date}T19:30:00+08:00`)];
    const timeline = weekTimeline(events, [date], timezone);
    expect(timeline).toEqual({ start: 480, end: 1320 });
    expect(layoutWeekDay(events, date, timezone, timeline).hiddenCount).toBe(0);
  });

  it('counts a short last-minute event as overflow instead of drawing below midnight', () => {
    const events = [event('midnight', `${date}T23:55:00+08:00`, `${date}T23:59:00+08:00`)];
    const layout = layoutWeekDay(events, date, timezone, weekTimeline(events, [date], timezone));
    expect(layout.timed).toEqual([]);
    expect(layout.hiddenCount).toBe(1);
    expect(layout.events[0]?.id).toBe('midnight');
  });

  it('clips an overnight plan to each household day and labels its continuation', () => {
    const overnight = {
      ...event('overnight', `${date}T20:00:00+08:00`, '2026-08-04T06:00:00+08:00'),
      endLocalDate: '2026-08-04',
    };
    const dates = [date, '2026-08-04'];
    const timeline = weekTimeline([overnight], dates, timezone);
    expect(timeline).toEqual({ start: 0, end: 1440 });
    expect(layoutWeekDay([overnight], date, timezone, timeline).timed[0]).toMatchObject({
      start: 1200,
      end: 1440,
    });
    expect(layoutWeekDay([overnight], dates[1]!, timezone, timeline).timed[0]).toMatchObject({
      start: 0,
      end: 360,
    });
    expect(formatEventDayTime(overnight, dates[1]!, timezone)).toBe('Until 6:00 am');
    expect(formatEventDateRange(overnight, timezone)).toBe(
      'Monday 3 August · 8:00 pm – Tuesday 4 August · 6:00 am',
    );
  });

  it('does not repeat a midnight-exclusive end on the following day', () => {
    const midnight = {
      ...event('ends', `${date}T20:00:00+08:00`, '2026-08-04T00:00:00+08:00'),
      endLocalDate: '2026-08-04',
    };
    expect(eventsForDay([midnight], '2026-08-04', timezone)).toEqual([]);
    expect(eventsForDay([midnight], date, timezone)).toEqual([midnight]);
  });

  it('keeps a positive span across a repeated daylight-saving hour', () => {
    const repeated = {
      ...event('dst', '2026-04-05T02:45:00+11:00', '2026-04-05T02:15:00+10:00'),
      startLocalDate: '2026-04-05',
      endLocalDate: '2026-04-05',
    };
    const timeline = weekTimeline([repeated], ['2026-04-05'], 'Australia/Sydney');
    const layout = layoutWeekDay([repeated], '2026-04-05', 'Australia/Sydney', timeline);
    expect(layout.timed[0]!.end).toBeGreaterThan(layout.timed[0]!.start);
    expect(layout.events).toEqual([repeated]);
  });

  it('keeps all displayed cards inside the timeline with no same-lane collisions', () => {
    const events = Array.from({ length: 80 }, (_, index) => {
      const start = new Date(Date.parse(`${date}T00:00:00+08:00`) + index * 17 * 60_000);
      const end = new Date(start.getTime() + ((index % 5) + 1) * 20 * 60_000);
      return event(`dense-${index}`, start.toISOString(), end.toISOString());
    });
    const timeline = weekTimeline(events, [date], timezone);
    const layout = layoutWeekDay(events, date, timezone, timeline);
    expect(layout.hiddenCount + layout.timed.length).toBe(events.length);
    for (const [index, item] of layout.timed.entries()) {
      expect(item.start).toBeGreaterThanOrEqual(timeline.start);
      expect(item.end).toBeLessThanOrEqual(timeline.end);
      for (const other of layout.timed.slice(index + 1)) {
        if (item.laneIndex === other.laneIndex) expect(item.end).toBeLessThanOrEqual(other.start);
      }
    }
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
