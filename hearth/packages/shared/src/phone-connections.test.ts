import { describe, expect, it } from 'vitest';
import {
  OwnerPhoneClaimSchema,
  PhoneInvitationClaimSchema,
  PhoneInvitationCreateSchema,
  PhoneCommandSchema,
  PhoneConnectionSchema,
} from './phone-connections.js';
describe('phone access contract', () => {
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
