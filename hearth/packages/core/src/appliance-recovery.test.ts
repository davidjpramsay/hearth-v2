import { describe, expect, it } from 'vitest';
import { ApplianceRecoveryPolicySchema } from '@hearth/shared';
import { applianceRecoveryReadiness } from './appliance-recovery.js';

describe('advisory appliance recovery readiness', () => {
  it.each([
    [['member_owner'], false, 'owner-only'],
    [['member_owner', 'member_other'], false, 'trusted-adult'],
    [['member_owner'], true, 'recovery-card'],
    [['member_owner', 'member_other'], true, 'both'],
  ])(
    'classifies %j / offline=%s as %s',
    (recoveryAdultIds, offlineRecoveryAcknowledged, expected) => {
      const policy = ApplianceRecoveryPolicySchema.parse({
        version: 1,
        ownerMemberId: 'member_owner',
        recoveryAdultIds,
        offlineRecoveryAcknowledged,
      });
      const before = JSON.stringify(policy);
      expect(applianceRecoveryReadiness(policy)).toBe(expected);
      expect(JSON.stringify(policy)).toBe(before);
    },
  );

  it('does not treat the owner alone as another trusted adult', () => {
    expect(
      applianceRecoveryReadiness({
        version: 1,
        ownerMemberId: 'member_owner',
        recoveryAdultIds: ['member_owner'],
        offlineRecoveryAcknowledged: false,
      }),
    ).toBe('owner-only');
  });
});
