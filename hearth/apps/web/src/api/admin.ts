import {
  ActivityFeedSchema,
  AdminOverviewSchema,
  MemberAvatarCommandResultSchema,
  MemberSchema,
  PairedDeviceSchema,
  SystemBackupCommandResultSchema,
  SystemStatusSchema,
  type ActivityFeed,
  type SystemBackupCommandResult,
  type SystemStatus,
} from '@hearth/shared';

import { demoAdminHeaders, householdApiBase, request } from './core';

export const adminApi = {
  getAdmin: () =>
    request(`${householdApiBase()}/admin`, AdminOverviewSchema, {
      headers: demoAdminHeaders,
    }),
  getActivity: (): Promise<ActivityFeed> =>
    request(`${householdApiBase()}/activity?limit=50`, ActivityFeedSchema, {
      headers: demoAdminHeaders,
    }),
  getSystemStatus: (): Promise<SystemStatus> =>
    request(`${householdApiBase()}/system-status`, SystemStatusSchema, {
      headers: demoAdminHeaders,
    }),
  createSystemBackup: (requestId: string): Promise<SystemBackupCommandResult> =>
    request(`${householdApiBase()}/system-backups`, SystemBackupCommandResultSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId }),
    }),
  updateHousehold: (input: { requestId: string; name: string; timezone: string }) =>
    request(`${householdApiBase()}/settings`, AdminOverviewSchema, {
      method: 'PATCH',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  createMember: (input: {
    requestId: string;
    displayName: string;
    role: 'adult' | 'child';
    color: string;
    administrator: boolean;
  }) =>
    request(`${householdApiBase()}/members`, MemberSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  updateMember: (
    memberId: string,
    input: {
      requestId: string;
      displayName: string;
      role: 'adult' | 'child';
      color: string;
      administrator: boolean;
    },
  ) =>
    request(`${householdApiBase()}/members/${memberId}`, MemberSchema, {
      method: 'PATCH',
      headers: demoAdminHeaders,
      body: JSON.stringify(input),
    }),
  updateMemberAvatar: (memberId: string, requestId: string, dataBase64: string) =>
    request(`${householdApiBase()}/members/${memberId}/avatar`, MemberAvatarCommandResultSchema, {
      method: 'PUT',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId, mimeType: 'image/jpeg', dataBase64 }),
    }),
  resetMemberAvatar: (memberId: string, requestId: string) =>
    request(
      `${householdApiBase()}/members/${memberId}/avatar-resets`,
      MemberAvatarCommandResultSchema,
      { method: 'POST', headers: demoAdminHeaders, body: JSON.stringify({ requestId }) },
    ),
  archiveMember: (memberId: string, requestId: string) =>
    request(`${householdApiBase()}/members/${memberId}/archives`, MemberSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId }),
    }),
  approvePairing: (code: string, requestId: string) =>
    request(`${householdApiBase()}/pairing-approvals`, PairedDeviceSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify({ code, requestId }),
    }),
  revokeDevice: (deviceId: string, requestId: string) =>
    request(`${householdApiBase()}/paired-devices/${deviceId}/revocations`, PairedDeviceSchema, {
      method: 'POST',
      headers: demoAdminHeaders,
      body: JSON.stringify({ requestId }),
    }),
};
