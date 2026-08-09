import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

import type { FirstUsePasskeyOptionsRequest, PasskeySession } from '@hearth/shared';

import { hearthApi } from '../api/client';

export async function createFirstUsePasskey(
  input: FirstUsePasskeyOptionsRequest,
): Promise<PasskeySession> {
  assertPasskeysAvailable();
  const ceremony = await hearthApi.getFirstUseRegistrationOptions(input);
  const response = await startRegistration({
    optionsJSON: ceremony.options as unknown as PublicKeyCredentialCreationOptionsJSON,
  });
  return hearthApi.verifyFirstUseRegistration(ceremony.ceremonyId, serializable(response));
}

export async function authenticateWithPasskey(): Promise<PasskeySession> {
  assertPasskeysAvailable();
  const ceremony = await hearthApi.getAuthenticationOptions();
  const response = await startAuthentication({
    optionsJSON: ceremony.options as unknown as PublicKeyCredentialRequestOptionsJSON,
  });
  return hearthApi.verifyAuthentication(ceremony.ceremonyId, serializable(response));
}

export function passkeysAvailable(): boolean {
  return window.isSecureContext && 'PublicKeyCredential' in window;
}

function assertPasskeysAvailable(): void {
  if (!passkeysAvailable()) {
    throw new Error('Passkeys need Hearth to be opened from its private HTTPS address.');
  }
}

function serializable(value: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
