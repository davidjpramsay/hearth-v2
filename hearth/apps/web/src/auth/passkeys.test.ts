import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  startRegistration,
  startAuthentication,
  getFirstUseRegistrationOptions,
  verifyFirstUseRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
  getAdditionalRegistrationOptions,
  verifyAdditionalRegistration,
  getRecoveryConfirmationOptions,
  createRecoveryCode,
  getRecoveryRegistrationOptions,
  verifyRecoveryRegistration,
} = vi.hoisted(() => ({
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
  getFirstUseRegistrationOptions: vi.fn(),
  verifyFirstUseRegistration: vi.fn(),
  getAuthenticationOptions: vi.fn(),
  verifyAuthentication: vi.fn(),
  getAdditionalRegistrationOptions: vi.fn(),
  verifyAdditionalRegistration: vi.fn(),
  getRecoveryConfirmationOptions: vi.fn(),
  createRecoveryCode: vi.fn(),
  getRecoveryRegistrationOptions: vi.fn(),
  verifyRecoveryRegistration: vi.fn(),
}));

vi.mock('@simplewebauthn/browser', () => ({ startRegistration, startAuthentication }));
vi.mock('../api/runtime', () => ({
  runtimeApi: {
    getFirstUseRegistrationOptions,
    verifyFirstUseRegistration,
    getAuthenticationOptions,
    verifyAuthentication,
    getRecoveryRegistrationOptions,
    verifyRecoveryRegistration,
  },
}));
vi.mock('../api/adultAccess', () => ({
  adultAccessApi: {
    getAdditionalRegistrationOptions,
    verifyAdditionalRegistration,
    getRecoveryConfirmationOptions,
    createRecoveryCode,
  },
}));

import {
  authenticateWithPasskey,
  createAdditionalPasskey,
  createConfirmedRecoveryCode,
  createFirstUsePasskey,
  passkeysAvailable,
  recoverWithCode,
} from './passkeys';

describe('browser passkey ceremonies', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    vi.stubGlobal('PublicKeyCredential', class PublicKeyCredential {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates a passkey from server options and returns the verified first-use session', async () => {
    const input = {
      setupCode: 'local-first-use-code',
      householdName: 'Our home',
      adultName: 'David',
      timezone: 'Australia/Perth',
      passkeyLabel: 'David’s iPhone',
    };
    getFirstUseRegistrationOptions.mockResolvedValue({
      ceremonyId: 'ceremony_registration_test',
      options: { challenge: 'registration_challenge' },
    });
    startRegistration.mockResolvedValue({ id: 'credential_test', type: 'public-key' });
    verifyFirstUseRegistration.mockResolvedValue({
      authenticated: true,
      householdId: 'household_test',
      memberId: 'member_test',
      displayName: 'David',
      expiresAt: '2026-09-08T00:00:00.000Z',
    });

    const session = await createFirstUsePasskey(input);

    expect(getFirstUseRegistrationOptions).toHaveBeenCalledWith(input);
    expect(startRegistration).toHaveBeenCalledWith({
      optionsJSON: { challenge: 'registration_challenge' },
    });
    expect(verifyFirstUseRegistration).toHaveBeenCalledWith('ceremony_registration_test', {
      id: 'credential_test',
      type: 'public-key',
    });
    expect(session.displayName).toBe('David');
  });

  it('signs in with discoverable server options and refuses insecure contexts', async () => {
    getAuthenticationOptions.mockResolvedValue({
      ceremonyId: 'ceremony_authentication_test',
      options: { challenge: 'authentication_challenge' },
    });
    startAuthentication.mockResolvedValue({ id: 'credential_test', type: 'public-key' });
    verifyAuthentication.mockResolvedValue({ authenticated: true, displayName: 'David' });

    await authenticateWithPasskey();
    expect(verifyAuthentication).toHaveBeenCalledWith('ceremony_authentication_test', {
      id: 'credential_test',
      type: 'public-key',
    });

    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false });
    expect(passkeysAvailable()).toBe(false);
    await expect(authenticateWithPasskey()).rejects.toThrow(/private HTTPS address/);
  });

  it('creates an additional adult passkey through the authenticated access contract', async () => {
    getAdditionalRegistrationOptions.mockResolvedValue({
      ceremonyId: 'ceremony_additional_test',
      options: { challenge: 'additional_challenge' },
    });
    startRegistration.mockResolvedValue({ id: 'credential_additional', type: 'public-key' });
    verifyAdditionalRegistration.mockResolvedValue({
      credential: { id: 'passkey_additional', label: 'Alex’s iPhone' },
    });

    await createAdditionalPasskey({ memberId: 'member_alex', passkeyLabel: 'Alex’s iPhone' });

    expect(getAdditionalRegistrationOptions).toHaveBeenCalledWith({
      memberId: 'member_alex',
      passkeyLabel: 'Alex’s iPhone',
    });
    expect(verifyAdditionalRegistration).toHaveBeenCalledWith('ceremony_additional_test', {
      id: 'credential_additional',
      type: 'public-key',
    });
  });

  it('confirms code creation and recovers with a replacement passkey', async () => {
    getRecoveryConfirmationOptions.mockResolvedValue({
      ceremonyId: 'ceremony_recovery_confirmation',
      options: { challenge: 'confirmation_challenge' },
    });
    startAuthentication.mockResolvedValue({ id: 'credential_existing', type: 'public-key' });
    createRecoveryCode.mockResolvedValue({ code: 'ABCD-EF01' });
    await createConfirmedRecoveryCode();
    expect(createRecoveryCode).toHaveBeenCalledWith('ceremony_recovery_confirmation', {
      id: 'credential_existing',
      type: 'public-key',
    });

    getRecoveryRegistrationOptions.mockResolvedValue({
      ceremonyId: 'ceremony_recovery_registration',
      options: { challenge: 'recovery_challenge' },
    });
    startRegistration.mockResolvedValue({ id: 'credential_replacement', type: 'public-key' });
    verifyRecoveryRegistration.mockResolvedValue({ authenticated: true, displayName: 'David' });
    const input = {
      recoveryCode: 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111',
      passkeyLabel: 'Replacement iPhone',
    };
    await recoverWithCode(input);
    expect(getRecoveryRegistrationOptions).toHaveBeenCalledWith(input);
    expect(verifyRecoveryRegistration).toHaveBeenCalledWith('ceremony_recovery_registration', {
      id: 'credential_replacement',
      type: 'public-key',
    });
  });
});
