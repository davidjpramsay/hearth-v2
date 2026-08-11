import { MonthScheduleSchema, WeekScheduleSchema } from '@hearth/shared';

import { getHearthRuntime, householdApiBase, request } from './core';

export const calendarApi = {
  getWeek: (start = getHearthRuntime().weekStart) =>
    request(`${householdApiBase()}/week?start=${start}`, WeekScheduleSchema),
  getMonth: (month = getHearthRuntime().currentMonth) =>
    request(`${householdApiBase()}/month?month=${month}`, MonthScheduleSchema),
};
