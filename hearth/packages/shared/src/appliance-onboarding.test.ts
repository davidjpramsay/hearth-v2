import { describe, expect, it } from 'vitest';
import setupFixture from '../fixtures/appliance-onboarding-v1/setup.json' with { type: 'json' };
import recoveryFixture from '../fixtures/appliance-onboarding-v1/recovery.json' with { type: 'json' };
import {
  ApplianceDiscoverySchema,
  ApplianceInitialClaimSchema,
  ApplianceRecoveryClaimSchema,
  ApplianceRecoveryPolicySchema,
  ApplianceRecoveryQrSchema,
  ApplianceSetupQrSchema,
  decodeApplianceQr,
  encodeApplianceQr,
} from './appliance-onboarding.js';

const setup = ApplianceSetupQrSchema.parse(setupFixture);
const recovery = ApplianceRecoveryQrSchema.parse(recoveryFixture);
const claim = {
  version: 1,
  requestId: 'request_fixture',
  applianceId: 'appliance_fixture',
  householdName: 'Fixture home',
  adultName: 'Fixture adult',
  phoneName: 'Fixture phone',
  timezone: 'Australia/Perth',
};

describe('appliance onboarding v1 foundation', () => {
  it.each([setup, recovery])('round-trips the private $purpose fixture', (qr) => {
    expect(decodeApplianceQr(encodeApplianceQr(qr))).toEqual(qr);
  });

  it('keeps initial setup and later recovery purposes disjoint', () => {
    expect(ApplianceSetupQrSchema.safeParse(recovery).success).toBe(false);
    expect(ApplianceRecoveryQrSchema.safeParse(setup).success).toBe(false);
    expect(
      decodeApplianceQr(JSON.stringify({ ...setup, recoverySecret: recovery.recoverySecret })),
    ).toBeNull();
  });

  it.each(['', 'ABC123', 'a'.repeat(42), 'a'.repeat(44), 'a'.repeat(42) + 'B'])(
    'rejects invalid proof shape without echoing it: %s',
    (setupSecret) => {
      expect(decodeApplianceQr(JSON.stringify({ ...setup, setupSecret }))).toBeNull();
    },
  );

  it('rejects malformed, non-object, oversize and unknown-version input', () => {
    for (const value of [
      undefined,
      null,
      1,
      {},
      '{',
      'null',
      '[]',
      ' '.repeat(1025),
      JSON.stringify({ ...setup, version: 2 }),
      JSON.stringify({ ...setup, format: 'unknown' }),
      'https://example.invalid/#setup=not_a_qr_payload',
    ])
      expect(decodeApplianceQr(value)).toBeNull();
  });

  it('rejects network addresses, Wi-Fi credentials and extra authority in QR payloads', () => {
    for (const extra of [
      { origin: 'https://attacker.invalid' },
      { wifiPassword: 'not_a_real_password' },
      { token: 'not_a_real_token' },
      { owner: true },
      { purpose: 'invite' },
    ])
      expect(decodeApplianceQr(JSON.stringify({ ...setup, ...extra }))).toBeNull();
  });

  it('requires identity-fingerprint shape and an opaque appliance identifier', () => {
    for (const change of [
      { identityFingerprint: 'ABC123' },
      { identityFingerprint: 'A'.repeat(64) },
      { applianceId: 'https://attacker.invalid' },
    ])
      expect(decodeApplianceQr(JSON.stringify({ ...setup, ...change }))).toBeNull();
  });

  it('does not accept setup generation for recovery or vice versa', () => {
    expect(decodeApplianceQr(JSON.stringify({ ...setup, generation: 1 }))).toBeNull();
    for (const generation of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(decodeApplianceQr(JSON.stringify({ ...recovery, generation }))).toBeNull();
    }
  });

  it('provides a constant encoder error rather than including private input', () => {
    expect(() => encodeApplianceQr({ ...setup, setupSecret: 'private-invalid-fixture' })).toThrow(
      'That Hearth code is not supported.',
    );
  });

  it('accepts bounded initial metadata but not caller-selected authority', () => {
    expect(ApplianceInitialClaimSchema.parse(claim)).toEqual(claim);
    for (const extra of [
      { role: 'adult' },
      { capabilities: ['household.admin'] },
      { verified: true },
      { recoveryAdultIds: ['member_other'] },
      { householdId: 'household_other' },
      { setupSecret: setup.setupSecret },
      { wifiPassword: 'not_a_real_password' },
    ])
      expect(ApplianceInitialClaimSchema.safeParse({ ...claim, ...extra }).success).toBe(false);
    expect(ApplianceInitialClaimSchema.safeParse({ ...claim, phoneName: '' }).success).toBe(false);
    expect(
      ApplianceInitialClaimSchema.safeParse({ ...claim, timezone: 'not_a_zone' }).success,
    ).toBe(false);
  });

  it('leaves recovery identity and proof verification to the authenticated adapter', () => {
    const metadata = {
      version: 1,
      requestId: 'request_fixture',
      applianceId: 'appliance_fixture',
      generation: 1,
      phoneName: 'Replacement phone',
    };
    expect(ApplianceRecoveryClaimSchema.parse(metadata)).toEqual(metadata);
    for (const extra of [
      { memberId: 'member_other' },
      { verified: true },
      { owner: true },
      { recoverySecret: recovery.recoverySecret },
    ])
      expect(ApplianceRecoveryClaimSchema.safeParse({ ...metadata, ...extra }).success).toBe(false);
  });

  it('makes public discovery non-authoritative and path/credential-free', () => {
    const discovery = {
      version: 1,
      applianceId: 'appliance_fixture',
      claimState: 'unclaimed',
      transports: ['ethernet', 'wifi', 'bluetooth-le'],
    };
    expect(ApplianceDiscoverySchema.safeParse(discovery).success).toBe(true);
    for (const extra of [
      { setupSecret: setup.setupSecret },
      { householdId: 'household_private' },
      { ownerMemberId: 'member_private' },
      { wifiPassword: 'not_a_real_password' },
    ])
      expect(ApplianceDiscoverySchema.safeParse({ ...discovery, ...extra }).success).toBe(false);
    expect(
      ApplianceDiscoverySchema.safeParse({ ...discovery, transports: ['wifi', 'wifi'] }).success,
    ).toBe(false);
  });

  it('retains at least the owner and rejects duplicate recovery authorities', () => {
    const policy = {
      version: 1,
      ownerMemberId: 'member_owner',
      recoveryAdultIds: ['member_owner'],
      offlineRecoveryAcknowledged: false,
    };
    expect(ApplianceRecoveryPolicySchema.parse(policy)).toEqual(policy);
    for (const recoveryAdultIds of [[], ['member_other'], ['member_owner', 'member_owner']]) {
      expect(ApplianceRecoveryPolicySchema.safeParse({ ...policy, recoveryAdultIds }).success).toBe(
        false,
      );
    }
  });
});
