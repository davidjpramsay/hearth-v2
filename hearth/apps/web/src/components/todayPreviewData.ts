import type { TodaySummary } from '@hearth/shared';

import { formatEventTime } from '../utils/date';

export interface PreviewPerson {
  avatarUrl: string;
  initial: string;
}

interface PreviewRow {
  id: string;
  title: string;
  person: PreviewPerson;
}

export interface TodayPreviewData {
  eyebrow: string;
  displayTime: string;
  displayDate: string;
  weather: { temperature: string; condition: string } | null;
  events: Array<PreviewRow & { time: string; color: string }>;
  chores: PreviewRow[];
  dinner: string | null;
  listSummary: string | null;
  notice: string | null;
  dailyVerse: TodaySummary['dailyVerse'];
  reminderSummary: TodaySummary['reminderSummary'];
  photo: TodaySummary['photo'];
}

export function createTodayPreviewData(
  today: TodaySummary | undefined,
  activeNotice: string | null,
): TodayPreviewData {
  if (today === undefined) {
    return {
      eyebrow: 'Household',
      displayTime: '—:—',
      displayDate: 'Today',
      weather: null,
      events: [],
      chores: [],
      dinner: null,
      listSummary: null,
      notice: activeNotice,
      dailyVerse: null,
      reminderSummary: null,
      photo: null,
    };
  }

  return {
    eyebrow: today.household.mode,
    displayTime: today.displayTime,
    displayDate: today.displayDate,
    weather:
      today.weather === null
        ? null
        : {
            temperature: `${today.weather.temperatureCelsius}°`,
            condition: today.weather.condition,
          },
    events: today.events.map((event) => ({
      id: event.id,
      title: event.title,
      time: formatEventTime(event, today.household.timezone),
      color: event.color,
      person: previewPerson(event.owner?.displayName ?? 'Family', event.owner?.avatarUrl ?? ''),
    })),
    chores: today.chores.map((chore) => ({
      id: chore.id,
      title: chore.title,
      person: previewPerson(chore.assignee.displayName, chore.assignee.avatarUrl),
    })),
    dinner: today.dinner,
    listSummary:
      today.listSummary === null
        ? null
        : `${today.listSummary.name} · ${today.listSummary.remainingCount} left`,
    notice: activeNotice ?? today.notice,
    dailyVerse: today.dailyVerse,
    reminderSummary: today.reminderSummary,
    photo: today.photo,
  };
}

function previewPerson(displayName: string, avatarUrl: string): PreviewPerson {
  return {
    avatarUrl,
    initial: displayName.slice(0, 1).toUpperCase(),
  };
}
