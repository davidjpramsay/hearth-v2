import {
  TodayConfigurationCommandResultSchema,
  TodayConfigurationSchema,
  TodaySummarySchema,
  type TodaySectionVisibility,
} from '@hearth/shared';

import { demoAdminHeaders, getHearthRuntime, householdApiBase, request } from './core';

export const todayApi = {
  getToday: () =>
    request(`${householdApiBase()}/today?date=${getHearthRuntime().localDate}`, TodaySummarySchema),
  getTodayConfiguration: () =>
    request(`${householdApiBase()}/today-configuration`, TodayConfigurationSchema, {
      headers: demoAdminHeaders,
    }),
  updateTodaySections: (sections: TodaySectionVisibility, requestId: string) =>
    request(`${householdApiBase()}/today-sections`, TodayConfigurationCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId, ...sections }),
    }),
  createNotice: (input: {
    requestId: string;
    message: string;
    priority: 'standard' | 'important';
    startsAt: string;
    expiresAt: string | null;
  }) =>
    request(`${householdApiBase()}/notices`, TodayConfigurationCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  updateNotice: (
    noticeId: string,
    input: {
      requestId: string;
      message: string;
      priority: 'standard' | 'important';
      startsAt: string;
      expiresAt: string | null;
    },
  ) =>
    request(`${householdApiBase()}/notices/${noticeId}`, TodayConfigurationCommandResultSchema, {
      method: 'PATCH',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  archiveNotice: (noticeId: string, requestId: string) =>
    request(
      `${householdApiBase()}/notices/${noticeId}/archives`,
      TodayConfigurationCommandResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId }),
      },
    ),
};
