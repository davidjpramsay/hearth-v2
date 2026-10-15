import { describe, expect, it } from 'vitest';
import { ConnectionCodeSchema, normalizeConnectionCode } from './connection-codes.js';
import { BridgePairingApprovalSchema, BridgePairingStartSchema } from './home-assistant-bridge.js';
import { PhoneInvitationClaimSchema } from './phone-connections.js';
describe('human connection codes are not long-lived credentials', () => {
  it('normalises grouped lowercase input and rejects ambiguous letters, digits and invalid lengths', () => {
    expect(normalizeConnectionCode('abc-def')).toBe('ABCDEF');
    for (const code of ['ABCDE', 'ABCDEFG', 'ABCDIO', '123456', 'abcdef'])
      expect(ConnectionCodeSchema.safeParse(code).success).toBe(false);
    expect(ConnectionCodeSchema.safeParse('HEARTH').success).toBe(true);
  });
  it('keeps machine start separate from adult approval and rejects privilege flags', () => {
    expect(
      BridgePairingStartSchema.safeParse({ requestId: 'request_test', secret: 'ABCDEF' }).success,
    ).toBe(false);
    expect(
      BridgePairingStartSchema.safeParse({
        requestId: 'request_test',
        secret: `ha_${'A'.repeat(43)}`,
        shareChores: true,
      }).success,
    ).toBe(false);
    const approval = {
      requestId: 'request_test',
      code: 'ABCDEF',
      screenIds: [],
      shareChores: false,
      shareCalendar: false,
    };
    expect(BridgePairingApprovalSchema.safeParse(approval).success).toBe(true);
    expect(
      BridgePairingApprovalSchema.safeParse({ ...approval, controlChores: true }).success,
    ).toBe(false);
    expect(
      PhoneInvitationClaimSchema.safeParse({ code: 'ABCDEF', phoneName: 'Phone', owner: true })
        .success,
    ).toBe(false);
    expect(
      PhoneInvitationClaimSchema.safeParse({ code: 'ABCDEF', phoneName: 'Phone' }).success,
    ).toBe(true);
  });
});
