import type { ApplianceRecoveryPolicy } from '@hearth/shared';

export type ApplianceRecoveryReadiness = 'owner-only' | 'trusted-adult' | 'recovery-card' | 'both';

// Advisory UI state only, never authentication or permission to replace a phone.
// Server proof and current-adult verification remain mandatory at replacement.
export function applianceRecoveryReadiness(
  policy: ApplianceRecoveryPolicy,
): ApplianceRecoveryReadiness {
  const hasOtherAdult = policy.recoveryAdultIds.some((id) => id !== policy.ownerMemberId);
  if (hasOtherAdult && policy.offlineRecoveryAcknowledged) return 'both';
  if (hasOtherAdult) return 'trusted-adult';
  return policy.offlineRecoveryAcknowledged ? 'recovery-card' : 'owner-only';
}
