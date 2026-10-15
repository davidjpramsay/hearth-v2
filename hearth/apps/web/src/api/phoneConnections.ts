import {
  PhoneConnectionsSchema,
  PhoneInvitationRevealSchema,
  PhoneInvitationStateSchema,
  PhonePendingSchema,
  PhoneRemovalSchema,
  PhoneConfirmationSchema,
  PasskeySessionSchema,
  type OwnerPhoneClaim,
  PhoneRecoverySummarySchema,
  PhoneRecoveryCardRevealSchema,
  PhoneRecoveryCommandResultSchema,
  type PhoneRecoveryClaim,
} from '@hearth/shared';
import { API_BASE, householdApiBase, request, createRequestId } from './core';

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });
export const phoneApi = {
  list: () => request(`${householdApiBase()}/phone-connections`, PhoneConnectionsSchema),
  createInvitation: (memberId: string, requestId: string) =>
    request(
      `${householdApiBase()}/phone-invitations`,
      PhoneInvitationRevealSchema,
      post({ memberId, requestId }),
    ),
  invitation: (id: string) =>
    request(`${householdApiBase()}/phone-invitations/${id}`, PhoneInvitationStateSchema),
  approve: (id: string) =>
    request(
      `${householdApiBase()}/phone-invitations/${id}/approvals`,
      PhoneInvitationStateSchema,
      post({ requestId: createRequestId('phone_approve') }),
    ),
  cancel: (id: string) =>
    request(
      `${householdApiBase()}/phone-invitations/${id}/cancellations`,
      PhoneInvitationStateSchema,
      post({ requestId: createRequestId('phone_cancel') }),
    ),
  remove: (id: string, requestId: string) =>
    request(
      `${householdApiBase()}/phone-connections/${id}/revocations`,
      PhoneRemovalSchema,
      post({ requestId }),
    ),
  ownerClaim: (input: OwnerPhoneClaim) =>
    request(`${API_BASE}/auth/phones/owner-claims`, PasskeySessionSchema, post(input)),
  claim: (invitationSecret: string, phoneName: string) =>
    request(
      `${API_BASE}/auth/phones/invitation-claims`,
      PhoneInvitationStateSchema,
      post({ invitationSecret, phoneName }),
    ),
  claimCode: (code: string, phoneName: string) =>
    request(
      `${API_BASE}/auth/phones/invitation-claims`,
      PhoneInvitationStateSchema,
      post({ code, phoneName }),
    ),
  pending: () => request(`${API_BASE}/auth/phones/pending`, PhonePendingSchema),
  exchange: () => request(`${API_BASE}/auth/phones/exchanges`, PasskeySessionSchema, post({})),
  confirm: () =>
    request(`${API_BASE}/auth/phones/confirmations`, PhoneConfirmationSchema, post({})),
  recovery: () => request(`${householdApiBase()}/phone-recovery`, PhoneRecoverySummarySchema),
  updateRecovery: (trustedConnectionIds: string[], requestId: string) =>
    request(
      `${householdApiBase()}/phone-recovery/policies`,
      PhoneRecoveryCommandResultSchema,
      post({ trustedConnectionIds, requestId }),
    ),
  createRecoveryCard: (requestId: string) =>
    request(
      `${householdApiBase()}/phone-recovery/cards`,
      PhoneRecoveryCardRevealSchema,
      post({ requestId }),
    ),
  activateRecoveryCard: (id: string, requestId: string) =>
    request(
      `${householdApiBase()}/phone-recovery/cards/${id}/activations`,
      PhoneRecoveryCommandResultSchema,
      post({ requestId }),
    ),
  createRecoveryInvitation: (requestId: string) =>
    request(
      `${householdApiBase()}/phone-recovery/invitations`,
      PhoneInvitationRevealSchema,
      post({ requestId }),
    ),
  recoverWithCard: (input: PhoneRecoveryClaim) =>
    request(`${API_BASE}/auth/phones/recovery-claims`, PasskeySessionSchema, post(input)),
};
