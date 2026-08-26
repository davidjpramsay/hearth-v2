import {
  ReminderOverviewSchema,
  ReminderSourceCommandResultSchema,
  ReminderSourcePairingRequestSchema,
  ReminderSourceSettingsSchema,
  type ReminderSourceCommandResult,
  type ReminderSourcePairingRequest,
  type ReminderSourceSettings,
  type ReminderOverview,
} from '@hearth/shared';

import { createRequestId, demoAdminHeaders, householdApiBase, request } from './core';

export const remindersApi = {
  getOverview: (includeCompleted = false): Promise<ReminderOverview> =>
    request(
      `${householdApiBase()}/reminders?includeCompleted=${includeCompleted ? 'true' : 'false'}`,
      ReminderOverviewSchema,
    ),
  getSources: (): Promise<ReminderSourceSettings> =>
    request(`${householdApiBase()}/reminder-sources`, ReminderSourceSettingsSchema, {
      headers: demoAdminHeaders,
    }),
  approvePairing: (code: string): Promise<ReminderSourcePairingRequest> =>
    request(
      `${householdApiBase()}/reminder-source-pairing-approvals`,
      ReminderSourcePairingRequestSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({
          requestId: createRequestId('reminder_pairing_approval'),
          code,
        }),
      },
    ),
  revokeDevice: (deviceId: string): Promise<ReminderSourceCommandResult> =>
    request(
      `${householdApiBase()}/reminder-source-devices/${deviceId}/revocations`,
      ReminderSourceCommandResultSchema,
      {
        method: 'POST',
        headers: demoAdminHeaders,
        body: JSON.stringify({ requestId: createRequestId('reminder_device_revoke') }),
      },
    ),
};
