import { getHearthRuntime, householdId } from './core';

export const queryKeys = {
  get today() {
    const runtime = getHearthRuntime();
    return [householdId(runtime), 'today', runtime.localDate] as const;
  },
  get weekRoot() {
    return [householdId(getHearthRuntime()), 'week'] as const;
  },
  get monthRoot() {
    return [householdId(getHearthRuntime()), 'month'] as const;
  },
  week: (start = getHearthRuntime().weekStart) =>
    [householdId(getHearthRuntime()), 'week', start] as const,
  month: (month = getHearthRuntime().currentMonth) =>
    [householdId(getHearthRuntime()), 'month', month] as const,
  get chores() {
    const runtime = getHearthRuntime();
    return [householdId(runtime), 'chores', runtime.localDate] as const;
  },
  get home() {
    return [householdId(getHearthRuntime()), 'home'] as const;
  },
  get photos() {
    return [householdId(getHearthRuntime()), 'photos'] as const;
  },
  get photoSource() {
    return [householdId(getHearthRuntime()), 'photo-source'] as const;
  },
  get admin() {
    return [householdId(getHearthRuntime()), 'admin'] as const;
  },
  get activity() {
    return [householdId(getHearthRuntime()), 'activity'] as const;
  },
  get adultAccess() {
    return [householdId(getHearthRuntime()), 'adult-access'] as const;
  },
  get todayConfiguration() {
    return [householdId(getHearthRuntime()), 'today-configuration'] as const;
  },
  get calendarConnection() {
    return [householdId(getHearthRuntime()), 'calendar-connection'] as const;
  },
  get weatherLocation() {
    return [householdId(getHearthRuntime()), 'weather-location'] as const;
  },
  get homeAssistantConnection() {
    return [householdId(getHearthRuntime()), 'home-assistant-connection'] as const;
  },
  get reminderSources() {
    return [householdId(getHearthRuntime()), 'reminder-sources'] as const;
  },
  get reminders() {
    return [householdId(getHearthRuntime()), 'reminders'] as const;
  },
  reminderOverview: (includeCompleted = false) =>
    [...queryKeys.reminders, includeCompleted ? 'all' : 'open'] as const,
  get systemStatus() {
    return [householdId(getHearthRuntime()), 'system-status'] as const;
  },
  get lists() {
    return [householdId(getHearthRuntime()), 'lists'] as const;
  },
  get listSettings() {
    return [householdId(getHearthRuntime()), 'list-settings'] as const;
  },
  meals: (startDate = getHearthRuntime().weekStart) =>
    [householdId(getHearthRuntime()), 'meals', startDate] as const,
  get savedMealLibrary() {
    return [householdId(getHearthRuntime()), 'saved-meal-library'] as const;
  },
  get pocketMoneyRoot() {
    return [householdId(getHearthRuntime()), 'pocket-money'] as const;
  },
  pocketMoney: (
    weekStart = getHearthRuntime().weekStart,
    asOfDate = getHearthRuntime().localDate,
  ) => [...queryKeys.pocketMoneyRoot, weekStart, asOfDate] as const,
  get choreTemplates() {
    return [householdId(getHearthRuntime()), 'chore-templates'] as const;
  },
  choreOccurrence: (occurrenceId: string) =>
    [householdId(getHearthRuntime()), 'chore-occurrence', occurrenceId] as const,
};
