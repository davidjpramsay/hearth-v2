import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

import type {
  AdditionalPasskeyOptionsRequest,
  FirstUsePasskeyOptionsRequest,
  PasskeyRegistrationResult,
  PasskeySession,
  RecoveryCodeReveal,
  RecoveryPasskeyOptionsRequest,
} from '@hearth/shared';

import { adultAccessApi } from '../api/adultAccess';
import { runtimeApi as hearthApi } from '../api/runtime';

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

export async function createAdditionalPasskey(
  input: AdditionalPasskeyOptionsRequest,
): Promise<PasskeyRegistrationResult> {
  assertPasskeysAvailable();
  const ceremony = await adultAccessApi.getAdditionalRegistrationOptions(input);
  const response = await startRegistration({
    optionsJSON: ceremony.options as unknown as PublicKeyCredentialCreationOptionsJSON,
  });
  return adultAccessApi.verifyAdditionalRegistration(ceremony.ceremonyId, serializable(response));
}

export async function createConfirmedRecoveryCode(): Promise<RecoveryCodeReveal> {
  assertPasskeysAvailable();
  const ceremony = await adultAccessApi.getRecoveryConfirmationOptions();
  const response = await startAuthentication({
    optionsJSON: ceremony.options as unknown as PublicKeyCredentialRequestOptionsJSON,
  });
  return adultAccessApi.createRecoveryCode(ceremony.ceremonyId, serializable(response));
}

export async function recoverWithCode(
  input: RecoveryPasskeyOptionsRequest,
): Promise<PasskeySession> {
  assertPasskeysAvailable();
  const ceremony = await hearthApi.getRecoveryRegistrationOptions(input);
  const response = await startRegistration({
    optionsJSON: ceremony.options as unknown as PublicKeyCredentialCreationOptionsJSON,
  });
  return hearthApi.verifyRecoveryRegistration(ceremony.ceremonyId, serializable(response));
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
