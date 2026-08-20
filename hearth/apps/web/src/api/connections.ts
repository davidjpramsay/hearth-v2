import {
  CalendarConnectionCommandResultSchema,
  CalendarConnectionSettingsSchema,
  CalendarConnectionTestResultSchema,
  HomeAssistantConnectionCommandResultSchema,
  HomeAssistantConnectionSettingsSchema,
  HomeAssistantConnectionTestResultSchema,
  type HomeAssistantConnectionCommandResult,
  type HomeAssistantConnectionSettings,
  type HomeAssistantConnectionTestResult,
} from '@hearth/shared';

import { demoAdminHeaders, householdApiBase, request } from './core';

export const connectionsApi = {
  getCalendarConnection: () =>
    request(
      `${householdApiBase()}/calendar-connection`,
      CalendarConnectionSettingsSchema.nullable(),
      { headers: demoAdminHeaders },
    ),
  testCalendarConnection: (input: { serverUrl: string; username: string; appPassword: string }) =>
    request(`${householdApiBase()}/calendar-connection-tests`, CalendarConnectionTestResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  saveCalendarConnection: (input: {
    requestId: string;
    testId: string;
    label: string;
    calendars: Array<{ calendarId: string; ownerMemberId: string | null }>;
  }) =>
    request(`${householdApiBase()}/calendar-connection`, CalendarConnectionCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  updateCalendarMappings: (input: {
    requestId: string;
    calendars: Array<{ calendarId: string; ownerMemberId: string | null }>;
  }) =>
    request(
      `${householdApiBase()}/calendar-connection/mappings`,
      CalendarConnectionCommandResultSchema,
      {
        method: 'PATCH',
        headers: demoAdminHeaders,
        body: JSON.stringify(input),
      },
    ),
  removeCalendarConnection: (requestId: string) =>
    request(
      `${householdApiBase()}/calendar-connection/removals`,
      CalendarConnectionCommandResultSchema,
      { method: 'POST', headers: demoAdminHeaders, body: JSON.stringify({ requestId }) },
    ),
  getHomeAssistantConnection: (): Promise<HomeAssistantConnectionSettings | null> =>
    request(
      `${householdApiBase()}/home-assistant-connection`,
      HomeAssistantConnectionSettingsSchema.nullable(),
      { headers: demoAdminHeaders },
    ),
  testHomeAssistantConnection: (input: {
    serverUrl: string;
    accessToken: string;
  }): Promise<HomeAssistantConnectionTestResult> =>
    request(
      `${householdApiBase()}/home-assistant-connection-tests`,
      HomeAssistantConnectionTestResultSchema,
      { method: 'POST', headers: demoAdminHeaders, body: JSON.stringify(input) },
    ),
  saveHomeAssistantConnection: (input: {
    requestId: string;
    testId: string;
    label: string;
    mappings: {
      occupancyId: string;
      televisionPowerId: string;
      hearthForegroundId: string;
      protectedMediaId: string;
      eveningScriptId: string;
      goodnightScriptId: string;
      screenOffScriptId: string;
    };
  }): Promise<HomeAssistantConnectionCommandResult> =>
    request(
      `${householdApiBase()}/home-assistant-connection`,
      HomeAssistantConnectionCommandResultSchema,
      { method: 'PUT', headers: demoAdminHeaders, body: JSON.stringify(input) },
    ),
  removeHomeAssistantConnection: (
    requestId: string,
  ): Promise<HomeAssistantConnectionCommandResult> =>
    request(
      `${householdApiBase()}/home-assistant-connection/removals`,
      HomeAssistantConnectionCommandResultSchema,
      { method: 'POST', headers: demoAdminHeaders, body: JSON.stringify({ requestId }) },
    ),
};
