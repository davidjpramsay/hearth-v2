import { TodaySummarySchema, type HearthReminder } from '@hearth/shared';
import type { HearthRepository } from './repository.js';
import type { AdminRepository } from './admin-repository.js';
import type { PlanningRepository } from './planning-repository.js';
import type { PhotoRepository } from './photo-repository.js';
import type { TodayContentRepository } from './today-content-repository.js';
import type { ReminderRepository } from './reminder-repository.js';
import type { DailyVerseProvider } from './integrations/daily-verse-provider.js';
import { TodayVerseCache } from './integrations/today-verse-cache.js';
import type { RealtimeHub } from './realtime.js';
import { localDateInTimezone } from '@hearth/core';

export function createTodayReader({
  repository,
  adminRepository,
  planningRepository,
  photoRepository,
  todayContentRepository,
  reminderRepository,
  dailyVerseProvider,
  realtime,
  now = () => new Date(),
}: {
  repository: HearthRepository;
  adminRepository: AdminRepository;
  planningRepository: PlanningRepository;
  photoRepository: PhotoRepository;
  todayContentRepository: TodayContentRepository;
  reminderRepository: ReminderRepository;
  dailyVerseProvider: DailyVerseProvider;
  realtime: RealtimeHub;
  now?: () => Date;
}) {
  const verseCache = new TodayVerseCache(dailyVerseProvider, (id) =>
    realtime.publish(id, 'today.changed', id),
  );
  return async (householdId: string, localDate: string) => {
    const [today, household, lists, meals, gallery, todayConfiguration, activeNotice] =
      await Promise.all([
        repository.getToday(householdId, localDate),
        adminRepository.getHousehold(householdId),
        planningRepository.getLists(householdId),
        planningRepository.getMealPlan(householdId, localDate),
        photoRepository.getGallery(householdId).catch(() => null),
        todayContentRepository.getConfiguration(householdId),
        todayContentRepository.getActiveNotice(householdId),
      ]);
    const reminderOverview = todayConfiguration.sections.reminders
      ? await reminderRepository.getOverview(householdId, false).catch(() => null)
      : null;
    const members = new Map(household.members.map((member) => [member.id, member]));
    const primaryList = lists.lists[0];
    const dinner = meals.days[0]?.entries.find((entry) => entry.slot === 'dinner');
    const featuredPhoto =
      gallery?.photos.find((photo) => photo.id === gallery.featuredPhotoId) ?? null;
    const dailyVerse = todayConfiguration.sections.dailyVerse
      ? verseCache.read(
          householdId,
          localDate,
          localDate === localDateInTimezone(now().toISOString(), household.timezone),
        )
      : null;
    const openReminders = (reminderOverview?.reminders ?? [])
      .filter((reminder) => !reminder.isCompleted)
      .toSorted((left, right) => compareTodayReminders(left, right, localDate));
    const reminderSummary =
      todayConfiguration.sections.reminders && reminderOverview !== null
        ? {
            openCount: reminderOverview.lists.reduce(
              (total, list) => total + list.incompleteCount,
              0,
            ),
            items: openReminders.slice(0, 3).map((reminder) => ({
              id: reminder.id,
              title: reminder.title,
              dueAt: reminder.dueAt,
              hasDueTime: reminder.hasDueTime,
            })),
          }
        : null;
    return TodaySummarySchema.parse({
      ...today,
      household: { ...household, mode: today.household.mode },
      dinner: dinner?.mealName ?? today.dinner,
      listSummary:
        primaryList === undefined
          ? today.listSummary
          : { name: primaryList.name, remainingCount: primaryList.remainingCount },
      notice: activeNotice?.message ?? null,
      dailyVerse,
      reminderSummary,
      sections: todayConfiguration.sections,
      photo: !todayConfiguration.sections.photo
        ? null
        : gallery === null
          ? today.photo
          : featuredPhoto === null
            ? null
            : {
                url: featuredPhoto.displayUrl,
                alt: featuredPhoto.alt,
                orientation: featuredPhoto.orientation,
                width: featuredPhoto.width,
                height: featuredPhoto.height,
              },
      calendars: today.calendars.map((calendar) => ({
        ...calendar,
        owner: calendar.owner === null ? null : (members.get(calendar.owner.id) ?? calendar.owner),
      })),
      events: today.events.map((event) => ({
        ...event,
        owner: event.owner === null ? null : (members.get(event.owner.id) ?? event.owner),
      })),
      chores: today.chores.map((chore) => ({
        ...chore,
        assignee: members.get(chore.assignee.id) ?? chore.assignee,
      })),
    });
  };
}

function compareTodayReminders(
  left: HearthReminder,
  right: HearthReminder,
  localDate: string,
): number {
  const priority = reminderPriority(left, localDate) - reminderPriority(right, localDate);
  if (priority !== 0) return priority;
  const leftDue = left.dueAt ?? left.dueLocalDate ?? '';
  const rightDue = right.dueAt ?? right.dueLocalDate ?? '';
  const due = leftDue.localeCompare(rightDue);
  if (due !== 0) return due;
  const title = left.title.localeCompare(right.title);
  return title === 0 ? left.id.localeCompare(right.id) : title;
}

function reminderPriority(reminder: HearthReminder, localDate: string): number {
  if (reminder.dueLocalDate === null) return 2;
  if (reminder.dueLocalDate < localDate) return 0;
  if (reminder.dueLocalDate === localDate) return 1;
  return 3;
}
