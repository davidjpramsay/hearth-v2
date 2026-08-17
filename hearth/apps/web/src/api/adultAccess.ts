import {
  AdultAccessSummarySchema,
  PasskeyCeremonyOptionsSchema,
  PasskeyRegistrationResultSchema,
  PasskeyRevocationResultSchema,
  RecoveryCodeRevealSchema,
  type AdditionalPasskeyOptionsRequest,
} from '@hearth/shared';

import { householdApiBase, request } from './core';

export const adultAccessApi = {
  getAdultAccess: () => request(`${householdApiBase()}/adult-access`, AdultAccessSummarySchema),
  getAdditionalRegistrationOptions: (input: AdditionalPasskeyOptionsRequest) =>
    request(
      `${householdApiBase()}/adult-access/passkey-registration-options`,
      PasskeyCeremonyOptionsSchema,
      { method: 'POST', body: JSON.stringify(input) },
    ),
  verifyAdditionalRegistration: (ceremonyId: string, response: Record<string, unknown>) =>
    request(
      `${householdApiBase()}/adult-access/passkey-registration-verifications`,
      PasskeyRegistrationResultSchema,
      { method: 'POST', body: JSON.stringify({ ceremonyId, response }) },
    ),
  getRecoveryConfirmationOptions: () =>
    request(
      `${householdApiBase()}/adult-access/recovery-confirmation-options`,
      PasskeyCeremonyOptionsSchema,
      { method: 'POST' },
    ),
  createRecoveryCode: (ceremonyId: string, response: Record<string, unknown>) =>
    request(`${householdApiBase()}/adult-access/recovery-codes`, RecoveryCodeRevealSchema, {
      method: 'POST',
      body: JSON.stringify({ ceremonyId, response }),
    }),
  revokePasskey: (passkeyId: string, requestId: string) =>
    request(
      `${householdApiBase()}/adult-access/passkeys/${passkeyId}/revocations`,
      PasskeyRevocationResultSchema,
      { method: 'POST', body: JSON.stringify({ requestId }) },
    ),
};
