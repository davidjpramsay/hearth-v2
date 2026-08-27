import {
  ReminderCommandResultSchema,
  ReminderDeletionResultSchema,
  ReminderOverviewSchema,
  type ReminderCommandResult,
  type ReminderDeletionResult,
  type ReminderOverview,
} from '@hearth/shared';

import { createRequestId, demoAdminHeaders, householdApiBase, request } from './core';

export interface ReminderDetails {
  title: string;
  dueLocalDate: string | null;
}

function detailsBody(details: ReminderDetails, requestId: string) {
  return {
    requestId,
    title: details.title,
    dueLocalDate: details.dueLocalDate,
    dueAt: null,
    hasDueTime: false,
  };
}

export const remindersApi = {
  getOverview: (includeCompleted = false): Promise<ReminderOverview> =>
    request(
      `${householdApiBase()}/reminders?includeCompleted=${includeCompleted ? 'true' : 'false'}`,
      ReminderOverviewSchema,
    ),
  create: (details: ReminderDetails): Promise<ReminderCommandResult> =>
    request(`${householdApiBase()}/reminders`, ReminderCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify(detailsBody(details, createRequestId('reminder_create'))),
    }),
  update: (reminderId: string, details: ReminderDetails): Promise<ReminderCommandResult> =>
    request(`${householdApiBase()}/reminders/${reminderId}`, ReminderCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify(detailsBody(details, createRequestId('reminder_update'))),
    }),
  setCompletion: (reminderId: string, isCompleted: boolean): Promise<ReminderCommandResult> =>
    request(
      `${householdApiBase()}/reminders/${reminderId}/completion`,
      ReminderCommandResultSchema,
      {
        method: 'PUT',
        headers: demoAdminHeaders,
        body: JSON.stringify({
          requestId: createRequestId(isCompleted ? 'reminder_complete' : 'reminder_reopen'),
          isCompleted,
        }),
      },
    ),
  delete: (reminderId: string): Promise<ReminderDeletionResult> =>
    request(
      `${householdApiBase()}/reminders/${reminderId}/deletions`,
      ReminderDeletionResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId: createRequestId('reminder_delete') }),
      },
    ),
};
