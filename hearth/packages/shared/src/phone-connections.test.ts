import { describe, expect, it } from 'vitest';
import {
  OwnerPhoneClaimSchema,
  PhoneInvitationClaimSchema,
  PhoneInvitationCreateSchema,
  PhoneCommandSchema,
  PhoneConnectionSchema,
  PhoneRecoveryClaimSchema,
  PhoneRecoveryPolicyCommandSchema,
} from './phone-connections.js';
describe('phone access contract', () => {
  it('accepts only private recovery proof and never caller-selected ownership or adult identity', () => {
    const input = {
      requestId: 'request_fixture',
      recoverySecret: 'A'.repeat(43),
      phoneName: 'Replacement phone',
    };
    expect(PhoneRecoveryClaimSchema.safeParse(input).success).toBe(true);
    for (const extra of [
      { memberId: 'member_other' },
      { owner: true },
      { role: 'adult' },
      { householdId: 'household_other' },
      { recoverySecret: 'ABC123' },
    ])
      expect(PhoneRecoveryClaimSchema.safeParse({ ...input, ...extra }).success).toBe(false);
  });
  it('keeps trust designation unique, bounded and request-identified', () => {
    expect(
      PhoneRecoveryPolicyCommandSchema.safeParse({
        requestId: 'request_fixture',
        trustedConnectionIds: ['phone_rachael'],
      }).success,
    ).toBe(true);
    expect(
      PhoneRecoveryPolicyCommandSchema.safeParse({
        requestId: 'request_fixture',
        trustedConnectionIds: ['phone_rachael', 'phone_rachael'],
      }).success,
    ).toBe(false);
    expect(
      PhoneRecoveryPolicyCommandSchema.safeParse({
        requestId: 'request_fixture',
        trustedConnectionIds: [],
        owner: true,
      }).success,
    ).toBe(false);
  });
  it('requires a strong bounded owner key without accepting passkey or password fields', () => {
    expect(
      OwnerPhoneClaimSchema.safeParse({ ownerKey: 'a'.repeat(64), phoneName: 'David’s phone' })
        .success,
    ).toBe(true);
    for (const input of [
      { ownerKey: '123456', phoneName: 'Phone' },
      { ownerKey: 'a'.repeat(161), phoneName: 'Phone' },
      { ownerKey: 'a'.repeat(64), phoneName: '' },
      { ownerKey: 'a'.repeat(64), phoneName: 'Phone', password: 'not_allowed' },
      { ownerKey: 'a'.repeat(64), phoneName: 'Phone', passkeyLabel: 'not_allowed' },
    ])
      expect(OwnerPhoneClaimSchema.safeParse(input).success).toBe(false);
  });
  it('rejects short display codes and raw URLs as invitation secrets', () => {
    expect(
      PhoneInvitationClaimSchema.safeParse({
        invitationSecret: 'a'.repeat(43),
        phoneName: 'Rachael’s phone',
      }).success,
    ).toBe(true);
    for (const invitationSecret of [
      'ABC123',
      'https://hearth.invalid/#connect-phone=example',
      'a'.repeat(129),
    ])
      expect(
        PhoneInvitationClaimSchema.safeParse({ invitationSecret, phoneName: 'Phone' }).success,
      ).toBe(false);
  });
  it('requires explicit target adult and command identifiers', () => {
    expect(
      PhoneInvitationCreateSchema.safeParse({
        memberId: 'member_rachael',
        requestId: 'request_phone',
      }).success,
    ).toBe(true);
    expect(PhoneInvitationCreateSchema.safeParse({ requestId: 'request_phone' }).success).toBe(
      false,
    );
    expect(
      PhoneCommandSchema.safeParse({ requestId: 'request_phone', memberId: 'member_changed' })
        .success,
    ).toBe(false);
  });
  it('rejects a connection projection carrying a session secret', () => {
    const parsed = PhoneConnectionSchema.parse({
      id: 'phone_example',
      memberId: 'member_example',
      adultName: 'Adult',
      phoneName: 'Phone',
      source: 'qr',
      createdAt: '2026-10-12T00:00:00Z',
      lastSeenAt: '2026-10-12T00:00:00Z',
      expiresAt: '2026-11-12T00:00:00Z',
      current: true,
      token: 'never_return',
    });
    expect(parsed).not.toHaveProperty('token');
  });
});
