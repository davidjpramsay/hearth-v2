import { localDateInTimezone } from '@hearth/core';
import type { CalendarEvent } from '@hearth/shared';

import { eventsForDay } from './calendar';

export interface WeekTimeline {
  start: number;
  end: number;
}

export interface TimedWeekEventLayout {
  event: CalendarEvent;
  start: number;
  end: number;
  displayEnd: number;
  laneIndex: number;
  laneCount: number;
}

export interface WeekDayLayout {
  events: CalendarEvent[];
  allDay: CalendarEvent[];
  timed: TimedWeekEventLayout[];
  hiddenCount: number;
}

export function weekTimeline(
  events: CalendarEvent[],
  dates: string[],
  timezone: string,
): WeekTimeline {
  const segments = dates.flatMap((date) => timedSegments(events, date, timezone));
  const start = Math.floor(Math.min(480, ...segments.map((item) => item.start)) / 120) * 120;
  // Leave enough clock space for the last card's readable height, where midnight allows it.
  const lastCardEnd = (6 * Math.max(start, ...segments.map((item) => item.start)) - start) / 5;
  return {
    start,
    end: Math.min(
      1440,
      Math.ceil(Math.max(1200, lastCardEnd, ...segments.map((item) => item.end)) / 120) * 120,
    ),
  };
}

export function layoutWeekDay(
  events: CalendarEvent[],
  date: string,
  timezone: string,
  timeline: WeekTimeline,
): WeekDayLayout {
  const dayEvents = eventsForDay(events, date, timezone);
  const allDay = dayEvents.filter((event) => event.allDay).slice(0, 2);
  // Six readable card heights fit even on the compact television timeline.
  const minimumSpan = (timeline.end - timeline.start) / 6;
  const timed: TimedWeekEventLayout[] = [];
  let cluster: TimedWeekEventLayout[] = [];
  let laneEnds: number[] = [];
  const finishCluster = (): void => {
    timed.push(...cluster.map((item) => ({ ...item, laneCount: laneEnds.length })));
    cluster = [];
    laneEnds = [];
  };

  for (const segment of timedSegments(dayEvents, date, timezone)) {
    const end = Math.max(segment.end, segment.start + minimumSpan);
    if (end > timeline.end) continue;
    if (laneEnds.every((value) => value <= segment.start)) finishCluster();
    let laneIndex = laneEnds.findIndex((value) => value <= segment.start);
    if (laneIndex < 0) laneIndex = laneEnds.length;
    if (laneIndex >= 2) continue;
    laneEnds[laneIndex] = end;
    cluster.push({ ...segment, displayEnd: segment.end, end, laneIndex, laneCount: 1 });
  }
  finishCluster();
  return {
    events: [
      ...dayEvents.filter((event) => event.allDay),
      ...dayEvents.filter((event) => !event.allDay).sort(compareEvents),
    ],
    allDay,
    timed,
    hiddenCount: dayEvents.length - allDay.length - timed.length,
  };
}

function timedSegments(events: CalendarEvent[], date: string, timezone: string) {
  return eventsForDay(events, date, timezone)
    .filter((event) => !event.allDay)
    .map((event) => {
      const start =
        localDateInTimezone(event.start, timezone) < date ? 0 : clockMinutes(event.start, timezone);
      const end =
        localDateInTimezone(event.end, timezone) > date ? 1440 : clockMinutes(event.end, timezone);
      // A repeated daylight-saving hour can run backwards on a wall-clock grid.
      // Keep its real timestamps in details and give the card a positive span.
      return { event, start, end: Math.max(start + 1, end) };
    })
    .sort((left, right) => left.start - right.start || compareEvents(left.event, right.event));
}

function compareEvents(left: CalendarEvent, right: CalendarEvent): number {
  return (
    Date.parse(left.start) - Date.parse(right.start) ||
    Date.parse(left.end) - Date.parse(right.end) ||
    left.id.localeCompare(right.id)
  );
}

function clockMinutes(timestamp: string, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return Number(values.get('hour')) * 60 + Number(values.get('minute'));
}

export function timelineHourLabel(minutes: number): string {
  const hour = (minutes / 60) % 24;
  return `${hour % 12 || 12} ${hour < 12 ? 'am' : 'pm'}`;
}
