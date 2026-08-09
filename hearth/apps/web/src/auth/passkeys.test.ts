import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  startRegistration,
  startAuthentication,
  getFirstUseRegistrationOptions,
  verifyFirstUseRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
} = vi.hoisted(() => ({
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
  getFirstUseRegistrationOptions: vi.fn(),
  verifyFirstUseRegistration: vi.fn(),
  getAuthenticationOptions: vi.fn(),
  verifyAuthentication: vi.fn(),
}));

vi.mock('@simplewebauthn/browser', () => ({ startRegistration, startAuthentication }));
vi.mock('../api/client', () => ({
  hearthApi: {
    getFirstUseRegistrationOptions,
    verifyFirstUseRegistration,
    getAuthenticationOptions,
    verifyAuthentication,
  },
}));

import { authenticateWithPasskey, createFirstUsePasskey, passkeysAvailable } from './passkeys';

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
});
