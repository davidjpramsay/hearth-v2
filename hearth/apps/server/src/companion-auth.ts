import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import type Database from 'better-sqlite3';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type CredentialDeviceType,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';

import {
  AdultAccessSummarySchema,
  AuditSummarySchema,
  PasskeyAuthStatusSchema,
  PasskeyCeremonyOptionsSchema,
  PasskeyCredentialSummarySchema,
  PasskeyRegistrationResultSchema,
  PasskeyRevocationResultSchema,
  PasskeySessionSchema,
  RecoveryCodeRevealSchema,
  type FirstUsePasskeyOptionsRequest,
  type AdditionalPasskeyOptionsRequest,
  type AdultAccessSummary,
  type AuditSummary,
  type PasskeyAuthStatus,
  type PasskeyCeremonyOptions,
  type PasskeyCredentialSummary,
  type PasskeyRegistrationResult,
  type PasskeyRevocationResult,
  type PasskeySession,
  type RecoveryCodeReveal,
  type RecoveryPasskeyOptionsRequest,
  type RuntimeMode,
} from '@hearth/shared';

import { RepositoryError, type CommandActor } from './repository.js';

const CEREMONY_LIFETIME_MS = 5 * 60 * 1000;
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const INVALID_SETUP_WINDOW_MS = 15 * 60 * 1000;
const MAX_INVALID_SETUP_ATTEMPTS = 5;
const AUTHENTICATION_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const MAX_AUTHENTICATION_OPTIONS_PER_ADDRESS = 20;
const MAX_PENDING_AUTHENTICATION_CEREMONIES = 128;
const MAX_TRACKED_AUTHENTICATION_ADDRESSES = 512;
const RECOVERY_CODE_LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;
const ADULT_CAPABILITIES = [
  'household.admin',
  'household.view',
  'chores.complete',
  'lists.change',
  'meals.change',
  'pocket-money.view',
  'home.control',
] as const;

export const HEARTH_COMPANION_COOKIE = 'hearth_session';

interface RegistrationCeremony {
  challenge: string;
  expiresAt: number;
  setupCodeDigest: Buffer;
  userId: Uint8Array;
  input: Omit<FirstUsePasskeyOptionsRequest, 'setupCode'>;
}

interface AuthenticationCeremony {
  challenge: string;
  expiresAt: number;
}

interface AdditionalRegistrationCeremony {
  challenge: string;
  expiresAt: number;
  householdId: string;
  memberId: string;
  actorId: string;
  passkeyLabel: string;
  userId: Uint8Array;
}

interface RecoveryConfirmationCeremony {
  challenge: string;
  expiresAt: number;
  householdId: string;
  actorId: string;
}

interface RecoveryRegistrationCeremony {
  challenge: string;
  expiresAt: number;
  codeId: string;
  codeDigest: string;
  householdId: string;
  memberId: string;
  passkeyLabel: string;
  userId: Uint8Array;
}

interface InvalidSetupAttempts {
  count: number;
  windowStartedAt: number;
}

interface PasskeyCredential {
  id: string;
  publicKey: Uint8Array<ArrayBuffer>;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
  deviceType: CredentialDeviceType;
  backedUp: boolean;
}

export interface PasskeyEngine {
  registrationOptions(input: {
    rpId: string;
    adultName: string;
    userId: Uint8Array<ArrayBuffer>;
    excludeCredentials?: Array<{
      id: string;
      transports?: AuthenticatorTransportFuture[];
    }>;
  }): Promise<PublicKeyCredentialCreationOptionsJSON>;
  verifyRegistration(input: {
    response: unknown;
    expectedChallenge: string;
    expectedOrigin: string;
    expectedRpId: string;
  }): Promise<PasskeyCredential | null>;
  authenticationOptions(input: { rpId: string }): Promise<PublicKeyCredentialRequestOptionsJSON>;
  verifyAuthentication(input: {
    response: unknown;
    expectedChallenge: string;
    expectedOrigin: string;
    expectedRpId: string;
    credential: Pick<PasskeyCredential, 'id' | 'publicKey' | 'counter' | 'transports'>;
  }): Promise<number | null>;
}

export class SimpleWebAuthnEngine implements PasskeyEngine {
  async registrationOptions(input: {
    rpId: string;
    adultName: string;
    userId: Uint8Array<ArrayBuffer>;
    excludeCredentials?: Array<{
      id: string;
      transports?: AuthenticatorTransportFuture[];
    }>;
  }): Promise<PublicKeyCredentialCreationOptionsJSON> {
    return generateRegistrationOptions({
      rpName: 'Hearth',
      rpID: input.rpId,
      userID: input.userId,
      userName: input.adultName,
      userDisplayName: input.adultName,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
      supportedAlgorithmIDs: [-7, -257],
      timeout: CEREMONY_LIFETIME_MS,
      ...(input.excludeCredentials === undefined
        ? {}
        : { excludeCredentials: input.excludeCredentials }),
    });
  }

  async verifyRegistration(input: {
    response: unknown;
    expectedChallenge: string;
    expectedOrigin: string;
    expectedRpId: string;
  }): Promise<PasskeyCredential | null> {
    const result = await verifyRegistrationResponse({
      response: input.response as RegistrationResponseJSON,
      expectedChallenge: input.expectedChallenge,
      expectedOrigin: input.expectedOrigin,
      expectedRPID: input.expectedRpId,
      requireUserVerification: true,
      supportedAlgorithmIDs: [-7, -257],
    });
    if (!result.verified) return null;
    return {
      id: result.registrationInfo.credential.id,
      publicKey: result.registrationInfo.credential.publicKey,
      counter: result.registrationInfo.credential.counter,
      ...(result.registrationInfo.credential.transports === undefined
        ? {}
        : { transports: result.registrationInfo.credential.transports }),
      deviceType: result.registrationInfo.credentialDeviceType,
      backedUp: result.registrationInfo.credentialBackedUp,
    };
  }

  async authenticationOptions(input: {
    rpId: string;
  }): Promise<PublicKeyCredentialRequestOptionsJSON> {
    return generateAuthenticationOptions({
      rpID: input.rpId,
      userVerification: 'required',
      timeout: CEREMONY_LIFETIME_MS,
    });
  }

  async verifyAuthentication(input: {
    response: unknown;
    expectedChallenge: string;
    expectedOrigin: string;
    expectedRpId: string;
    credential: Pick<PasskeyCredential, 'id' | 'publicKey' | 'counter' | 'transports'>;
  }): Promise<number | null> {
    const result = await verifyAuthenticationResponse({
      response: input.response as AuthenticationResponseJSON,
      expectedChallenge: input.expectedChallenge,
      expectedOrigin: input.expectedOrigin,
      expectedRPID: input.expectedRpId,
      credential: input.credential,
      requireUserVerification: true,
    });
    return result.verified ? result.authenticationInfo.newCounter : null;
  }
}

export interface CompanionAuthConfiguration {
  mode: RuntimeMode;
  rpId: string;
  origin: string;
  secureCookie: boolean;
  readFirstUseCode: () => Promise<string>;
  consumeFirstUseCode: () => Promise<void>;
  now?: () => Date;
  engine?: PasskeyEngine;
}

export interface CompanionAuthRepository {
  status(token: string | null): PasskeyAuthStatus;
  firstUseRegistrationOptions(
    input: FirstUsePasskeyOptionsRequest,
    remoteAddress: string,
  ): Promise<PasskeyCeremonyOptions>;
  verifyFirstUseRegistration(
    ceremonyId: string,
    response: unknown,
  ): Promise<{ session: PasskeySession; token: string }>;
  authenticationOptions(remoteAddress: string): Promise<PasskeyCeremonyOptions>;
  verifyAuthentication(
    ceremonyId: string,
    response: unknown,
  ): Promise<{ session: PasskeySession; token: string }>;
  adultAccess(householdId: string, actor: CommandActor): AdultAccessSummary;
  additionalRegistrationOptions(
    householdId: string,
    actor: CommandActor,
    input: AdditionalPasskeyOptionsRequest,
  ): Promise<PasskeyCeremonyOptions>;
  verifyAdditionalRegistration(
    householdId: string,
    actor: CommandActor,
    ceremonyId: string,
    response: unknown,
  ): Promise<PasskeyRegistrationResult>;
  recoveryConfirmationOptions(
    householdId: string,
    actor: CommandActor,
  ): Promise<PasskeyCeremonyOptions>;
  createRecoveryCode(
    householdId: string,
    actor: CommandActor,
    ceremonyId: string,
    response: unknown,
  ): Promise<RecoveryCodeReveal>;
  recoveryRegistrationOptions(
    input: RecoveryPasskeyOptionsRequest,
    remoteAddress: string,
  ): Promise<PasskeyCeremonyOptions>;
  verifyRecoveryRegistration(
    ceremonyId: string,
    response: unknown,
  ): Promise<{ session: PasskeySession; token: string }>;
  revokePasskey(
    householdId: string,
    passkeyId: string,
    actor: CommandActor,
    requestId: string,
  ): PasskeyRevocationResult;
  session(token: string): PasskeySession;
  authenticate(token: string): CommandActor;
  signOut(token: string): void;
  sessionCookie(token: string): string;
  clearSessionCookie(): string;
}

export class CompanionAuthService implements CompanionAuthRepository {
  private readonly registrationCeremonies = new Map<string, RegistrationCeremony>();
  private readonly authenticationCeremonies = new Map<string, AuthenticationCeremony>();
  private readonly additionalRegistrationCeremonies = new Map<
    string,
    AdditionalRegistrationCeremony
  >();
  private readonly recoveryConfirmationCeremonies = new Map<string, RecoveryConfirmationCeremony>();
  private readonly recoveryRegistrationCeremonies = new Map<string, RecoveryRegistrationCeremony>();
  private readonly invalidSetupAttempts = new Map<string, InvalidSetupAttempts>();
  private readonly authenticationAttempts = new Map<string, InvalidSetupAttempts>();
  private readonly recoveryAttempts = new Map<string, InvalidSetupAttempts>();
  private readonly now: () => Date;
  private readonly engine: PasskeyEngine;

  constructor(
    private readonly database: InstanceType<typeof Database>,
    private readonly configuration: CompanionAuthConfiguration,
  ) {
    this.now = configuration.now ?? (() => new Date());
    this.engine = configuration.engine ?? new SimpleWebAuthnEngine();
  }

  status(token: string | null): PasskeyAuthStatus {
    const member = token === null ? null : this.readSession(token, false);
    return PasskeyAuthStatusSchema.parse({
      mode: this.configuration.mode,
      configured: true,
      secureOrigin: this.configuration.origin.startsWith('https://'),
      requiresSetup: this.householdId() === null,
      authenticated: member !== null,
      actor:
        member === null
          ? null
          : { id: member.memberId, displayName: member.displayName, role: member.role },
    });
  }

  async firstUseRegistrationOptions(
    input: FirstUsePasskeyOptionsRequest,
    remoteAddress: string,
  ): Promise<PasskeyCeremonyOptions> {
    this.assertSetupAvailable();
    this.assertNotRateLimited(remoteAddress);
    const expectedCode = await this.readSetupCode();
    if (!safeEqual(input.setupCode, expectedCode)) {
      this.recordInvalidSetupAttempt(remoteAddress);
      throw new RepositoryError('FORBIDDEN', 'The first-use code was not accepted.');
    }
    this.invalidSetupAttempts.delete(remoteAddress);
    const userId = Uint8Array.from(randomBytes(32));
    const options = await this.engine.registrationOptions({
      rpId: this.configuration.rpId,
      adultName: input.adultName,
      userId,
    });
    const ceremonyId = opaqueId('ceremony_registration');
    const expiresAt = this.now().getTime() + CEREMONY_LIFETIME_MS;
    this.registrationCeremonies.set(ceremonyId, {
      challenge: options.challenge,
      expiresAt,
      setupCodeDigest: digest(expectedCode),
      userId,
      input: {
        householdName: input.householdName,
        adultName: input.adultName,
        timezone: input.timezone,
        passkeyLabel: input.passkeyLabel,
      },
    });
    return PasskeyCeremonyOptionsSchema.parse({
      ceremonyId,
      options: serializableRecord(options),
      expiresAt: new Date(expiresAt).toISOString(),
    });
  }

  async verifyFirstUseRegistration(
    ceremonyId: string,
    response: unknown,
  ): Promise<{ session: PasskeySession; token: string }> {
    this.assertSetupAvailable();
    const ceremony = this.takeRegistrationCeremony(ceremonyId);
    const expectedCode = await this.readSetupCode();
    if (!timingSafeEqual(ceremony.setupCodeDigest, digest(expectedCode))) {
      throw new RepositoryError('CONFLICT', 'The first-use code changed. Start setup again.');
    }
    const credential = await this.engine.verifyRegistration({
      response,
      expectedChallenge: ceremony.challenge,
      expectedOrigin: this.configuration.origin,
      expectedRpId: this.configuration.rpId,
    });
    if (credential === null) {
      throw new RepositoryError('UNAUTHENTICATED', 'That passkey could not be verified.');
    }

    const now = this.now().toISOString();
    const householdId = opaqueId('household');
    const memberId = opaqueId('member');
    const credentialRowId = opaqueId('passkey');
    const webauthnUserId = Buffer.from(ceremony.userId).toString('base64url');
    const createHousehold = this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO households
            (id, name, timezone, locale, week_starts_on, created_at, updated_at)
           VALUES (?, ?, ?, 'en-AU', 1, ?, ?)`,
        )
        .run(householdId, ceremony.input.householdName, ceremony.input.timezone, now, now);
      this.database
        .prepare(
          `INSERT INTO members
            (id, household_id, display_name, colour, avatar_key, role, archived_at,
             created_at, updated_at, capabilities_json)
           VALUES (?, ?, ?, '#2f766d', '/brand/hearth-mark.png', 'adult', NULL, ?, ?, ?)`,
        )
        .run(
          memberId,
          householdId,
          ceremony.input.adultName,
          now,
          now,
          JSON.stringify(ADULT_CAPABILITIES),
        );
      this.insertDefaultLists(householdId, now);
      this.database
        .prepare(
          `INSERT INTO passkey_credentials
            (id, credential_id, household_id, member_id, webauthn_user_id, public_key, counter,
             device_type, backed_up, transports_json, label, created_at, last_used_at, revoked_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
        )
        .run(
          credentialRowId,
          credential.id,
          householdId,
          memberId,
          webauthnUserId,
          Buffer.from(credential.publicKey),
          credential.counter,
          credential.deviceType,
          credential.backedUp ? 1 : 0,
          JSON.stringify(credential.transports ?? []),
          ceremony.input.passkeyLabel,
          now,
        );
      this.database
        .prepare(
          `INSERT INTO audit_events
            (id, occurred_at, household_id, actor_type, actor_id, source_channel, action_type,
             target_type, target_id, request_id, result, safe_summary_json)
           VALUES (?, ?, ?, 'member', ?, 'companion', 'auth.passkey.register',
                   'passkey_credential', ?, NULL, 'succeeded', ?)`,
        )
        .run(
          opaqueId('audit_auth'),
          now,
          householdId,
          memberId,
          credentialRowId,
          JSON.stringify({ firstUse: true }),
        );
    });
    createHousehold();

    await this.configuration.consumeFirstUseCode().catch(() => undefined);
    const session = this.createSession(householdId, memberId, credential.id);
    return session;
  }

  async authenticationOptions(remoteAddress: string): Promise<PasskeyCeremonyOptions> {
    if (this.householdId() === null) {
      throw new RepositoryError('CONFLICT', 'Finish first-use setup before signing in.');
    }
    this.pruneExpiredAuthenticationState();
    this.recordAuthenticationAttempt(remoteAddress);
    if (this.authenticationCeremonies.size >= MAX_PENDING_AUTHENTICATION_CEREMONIES) {
      throw new RepositoryError(
        'FORBIDDEN',
        'Too many sign-in attempts are already open. Wait a few minutes and try again.',
      );
    }
    const options = await this.engine.authenticationOptions({ rpId: this.configuration.rpId });
    const ceremonyId = opaqueId('ceremony_authentication');
    const expiresAt = this.now().getTime() + CEREMONY_LIFETIME_MS;
    this.authenticationCeremonies.set(ceremonyId, {
      challenge: options.challenge,
      expiresAt,
    });
    return PasskeyCeremonyOptionsSchema.parse({
      ceremonyId,
      options: serializableRecord(options),
      expiresAt: new Date(expiresAt).toISOString(),
    });
  }

  async verifyAuthentication(
    ceremonyId: string,
    response: unknown,
  ): Promise<{ session: PasskeySession; token: string }> {
    const ceremony = this.takeAuthenticationCeremony(ceremonyId);
    const credential = await this.verifyExistingCredential(ceremony.challenge, response);
    return this.createSession(
      credential.household_id,
      credential.member_id,
      credential.credential_id,
    );
  }

  adultAccess(householdId: string, actor: CommandActor): AdultAccessSummary {
    this.assertAdultAdministrator(householdId, actor);
    const members = this.database
      .prepare(
        `SELECT id, display_name, avatar_key
         FROM members
         WHERE household_id = ? AND role = 'adult' AND archived_at IS NULL
         ORDER BY datetime(created_at), rowid`,
      )
      .all(householdId) as AdultMemberRow[];
    const now = this.now().toISOString();
    return AdultAccessSummarySchema.parse({
      householdId,
      actorMemberId: actor.id,
      adults: members.map((member) => {
        const passkeys = this.database
          .prepare(
            `SELECT id, member_id, label, device_type, backed_up, created_at, last_used_at
             FROM passkey_credentials
             WHERE household_id = ? AND member_id = ? AND revoked_at IS NULL
             ORDER BY datetime(created_at), rowid`,
          )
          .all(householdId, member.id)
          .map(passkeySummary);
        const recovery = this.database
          .prepare(
            `SELECT created_at, expires_at
             FROM companion_recovery_codes
             WHERE household_id = ? AND member_id = ?
               AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > ?
             LIMIT 1`,
          )
          .get(householdId, member.id, now) as RecoveryCodeStatusRow | undefined;
        return {
          member: {
            id: member.id,
            displayName: member.display_name,
            avatarUrl: member.avatar_key ?? '/brand/hearth-mark.png',
          },
          passkeys,
          recovery: {
            configured: recovery !== undefined,
            createdAt: recovery?.created_at ?? null,
            expiresAt: recovery?.expires_at ?? null,
          },
        };
      }),
    });
  }

  async additionalRegistrationOptions(
    householdId: string,
    actor: CommandActor,
    input: AdditionalPasskeyOptionsRequest,
  ): Promise<PasskeyCeremonyOptions> {
    this.assertAdultAdministrator(householdId, actor);
    const member = this.readAdultMember(householdId, input.memberId);
    this.pruneExpiredRegistrationState();
    const userId = this.webAuthnUserId(householdId, member.id);
    const existingCredentials = this.activeCredentials(householdId, member.id);
    const options = await this.engine.registrationOptions({
      rpId: this.configuration.rpId,
      adultName: member.display_name,
      userId,
      excludeCredentials: existingCredentials.map((credential) => ({
        id: credential.credential_id,
        ...(parseTransports(credential.transports_json).length === 0
          ? {}
          : { transports: parseTransports(credential.transports_json) }),
      })),
    });
    const ceremonyId = opaqueId('ceremony_registration');
    const expiresAt = this.now().getTime() + CEREMONY_LIFETIME_MS;
    this.additionalRegistrationCeremonies.set(ceremonyId, {
      challenge: options.challenge,
      expiresAt,
      householdId,
      memberId: member.id,
      actorId: actor.id,
      passkeyLabel: input.passkeyLabel,
      userId,
    });
    return ceremonyOptions(ceremonyId, options, expiresAt);
  }

  async verifyAdditionalRegistration(
    householdId: string,
    actor: CommandActor,
    ceremonyId: string,
    response: unknown,
  ): Promise<PasskeyRegistrationResult> {
    this.assertAdultAdministrator(householdId, actor);
    const ceremony = this.takeAdditionalRegistrationCeremony(ceremonyId);
    if (ceremony.householdId !== householdId || ceremony.actorId !== actor.id) {
      throw new RepositoryError('FORBIDDEN', 'That passkey setup belongs to another adult.');
    }
    const credential = await this.verifyNewCredential(ceremony.challenge, response);
    const now = this.now().toISOString();
    const credentialRowId = opaqueId('passkey');
    const audit = this.database.transaction(() => {
      this.assertCredentialIsNew(credential.id);
      this.insertCredential({
        id: credentialRowId,
        credential,
        householdId,
        memberId: ceremony.memberId,
        userId: ceremony.userId,
        label: ceremony.passkeyLabel,
        now,
      });
      return this.writeAudit({
        householdId,
        actorId: actor.id,
        action: 'auth.passkey.register',
        targetType: 'passkey_credential',
        targetId: credentialRowId,
        now,
        safeSummary: { firstUse: false, memberId: ceremony.memberId },
      });
    })();
    return PasskeyRegistrationResultSchema.parse({
      credential: this.readPasskeySummary(credentialRowId),
      audit,
    });
  }

  async recoveryConfirmationOptions(
    householdId: string,
    actor: CommandActor,
  ): Promise<PasskeyCeremonyOptions> {
    this.assertAdultAdministrator(householdId, actor);
    this.pruneExpiredRegistrationState();
    const options = await this.engine.authenticationOptions({ rpId: this.configuration.rpId });
    const ceremonyId = opaqueId('ceremony_recovery_confirmation');
    const expiresAt = this.now().getTime() + CEREMONY_LIFETIME_MS;
    this.recoveryConfirmationCeremonies.set(ceremonyId, {
      challenge: options.challenge,
      expiresAt,
      householdId,
      actorId: actor.id,
    });
    return ceremonyOptions(ceremonyId, options, expiresAt);
  }

  async createRecoveryCode(
    householdId: string,
    actor: CommandActor,
    ceremonyId: string,
    response: unknown,
  ): Promise<RecoveryCodeReveal> {
    this.assertAdultAdministrator(householdId, actor);
    const ceremony = this.takeRecoveryConfirmationCeremony(ceremonyId);
    if (ceremony.householdId !== householdId || ceremony.actorId !== actor.id) {
      throw new RepositoryError(
        'FORBIDDEN',
        'That recovery confirmation belongs to another adult.',
      );
    }
    await this.verifyExistingCredential(ceremony.challenge, response, {
      householdId,
      memberId: actor.id,
    });
    const code = recoveryCode();
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + RECOVERY_CODE_LIFETIME_MS);
    const codeId = opaqueId('recovery');
    this.database.transaction(() => {
      this.database
        .prepare(
          `UPDATE companion_recovery_codes SET revoked_at = ?
           WHERE household_id = ? AND member_id = ?
             AND consumed_at IS NULL AND revoked_at IS NULL`,
        )
        .run(createdAt.toISOString(), householdId, actor.id);
      this.database
        .prepare(
          `INSERT INTO companion_recovery_codes
            (id, household_id, member_id, code_hash, created_by_member_id, created_at,
             expires_at, consumed_at, revoked_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
        )
        .run(
          codeId,
          householdId,
          actor.id,
          recoveryCodeDigest(code),
          actor.id,
          createdAt.toISOString(),
          expiresAt.toISOString(),
        );
      this.writeAudit({
        householdId,
        actorId: actor.id,
        action: 'auth.recovery-code.rotate',
        targetType: 'companion_recovery_code',
        targetId: codeId,
        now: createdAt.toISOString(),
        safeSummary: { expiresAt: expiresAt.toISOString() },
      });
    })();
    return RecoveryCodeRevealSchema.parse({
      code,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  }

  async recoveryRegistrationOptions(
    input: RecoveryPasskeyOptionsRequest,
    remoteAddress: string,
  ): Promise<PasskeyCeremonyOptions> {
    this.pruneRecoveryAttempts();
    this.recordRecoveryAttempt(remoteAddress);
    const codeHash = recoveryCodeDigest(input.recoveryCode);
    const now = this.now().toISOString();
    const row = this.database
      .prepare(
        `SELECT r.id, r.household_id, r.member_id, m.display_name
         FROM companion_recovery_codes r
         JOIN members m ON m.id = r.member_id AND m.household_id = r.household_id
         WHERE r.code_hash = ? AND r.consumed_at IS NULL AND r.revoked_at IS NULL
           AND r.expires_at > ? AND m.archived_at IS NULL AND m.role = 'adult'`,
      )
      .get(codeHash, now) as RecoveryCodeMemberRow | undefined;
    if (row === undefined) {
      throw new RepositoryError('UNAUTHENTICATED', 'That recovery code was not accepted.');
    }
    const userId = this.webAuthnUserId(row.household_id, row.member_id);
    const options = await this.engine.registrationOptions({
      rpId: this.configuration.rpId,
      adultName: row.display_name,
      userId,
    });
    const ceremonyId = opaqueId('ceremony_recovery_registration');
    const expiresAt = this.now().getTime() + CEREMONY_LIFETIME_MS;
    this.recoveryRegistrationCeremonies.set(ceremonyId, {
      challenge: options.challenge,
      expiresAt,
      codeId: row.id,
      codeDigest: codeHash,
      householdId: row.household_id,
      memberId: row.member_id,
      passkeyLabel: input.passkeyLabel,
      userId,
    });
    return ceremonyOptions(ceremonyId, options, expiresAt);
  }

  async verifyRecoveryRegistration(
    ceremonyId: string,
    response: unknown,
  ): Promise<{ session: PasskeySession; token: string }> {
    const ceremony = this.takeRecoveryRegistrationCeremony(ceremonyId);
    const activeCode = this.database
      .prepare(
        `SELECT code_hash FROM companion_recovery_codes
         WHERE id = ? AND household_id = ? AND member_id = ?
           AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
      )
      .get(ceremony.codeId, ceremony.householdId, ceremony.memberId, this.now().toISOString()) as
      { code_hash: string } | undefined;
    if (activeCode === undefined || !safeEqual(activeCode.code_hash, ceremony.codeDigest)) {
      throw new RepositoryError('UNAUTHENTICATED', 'That recovery attempt expired. Start again.');
    }
    const credential = await this.verifyNewCredential(ceremony.challenge, response);
    const now = this.now().toISOString();
    const credentialRowId = opaqueId('passkey');
    this.database.transaction(() => {
      this.assertCredentialIsNew(credential.id);
      this.database
        .prepare(
          `UPDATE passkey_credentials SET revoked_at = ?
           WHERE household_id = ? AND member_id = ? AND revoked_at IS NULL`,
        )
        .run(now, ceremony.householdId, ceremony.memberId);
      this.database
        .prepare(
          `UPDATE companion_sessions SET revoked_at = ?
           WHERE household_id = ? AND member_id = ? AND revoked_at IS NULL`,
        )
        .run(now, ceremony.householdId, ceremony.memberId);
      this.database
        .prepare(
          `UPDATE companion_recovery_codes SET consumed_at = ?
           WHERE id = ? AND consumed_at IS NULL AND revoked_at IS NULL`,
        )
        .run(now, ceremony.codeId);
      this.insertCredential({
        id: credentialRowId,
        credential,
        householdId: ceremony.householdId,
        memberId: ceremony.memberId,
        userId: ceremony.userId,
        label: ceremony.passkeyLabel,
        now,
      });
      this.writeAudit({
        householdId: ceremony.householdId,
        actorId: ceremony.memberId,
        action: 'auth.account.recover',
        targetType: 'passkey_credential',
        targetId: credentialRowId,
        now,
        safeSummary: { previousAccessRevoked: true },
      });
    })();
    return this.createSession(ceremony.householdId, ceremony.memberId, credential.id);
  }

  revokePasskey(
    householdId: string,
    passkeyId: string,
    actor: CommandActor,
    requestId: string,
  ): PasskeyRevocationResult {
    this.assertAdultAdministrator(householdId, actor);
    const commandType = `auth.passkey.revoke:${passkeyId}`;
    const receipt = this.readRevocationReceipt(householdId, requestId, commandType);
    if (receipt !== null) return { ...receipt, replayed: true };
    const row = this.database
      .prepare(
        `SELECT id, credential_id, member_id
         FROM passkey_credentials
         WHERE id = ? AND household_id = ? AND revoked_at IS NULL`,
      )
      .get(passkeyId, householdId) as RevocablePasskeyRow | undefined;
    if (row === undefined) throw new RepositoryError('NOT_FOUND', 'That passkey was not found.');
    const activeCount = this.database
      .prepare(
        `SELECT COUNT(*) AS count FROM passkey_credentials
         WHERE household_id = ? AND member_id = ? AND revoked_at IS NULL`,
      )
      .get(householdId, row.member_id) as { count: number };
    const hasRecovery = this.hasActiveRecoveryCode(householdId, row.member_id);
    if (activeCount.count <= 1 && !hasRecovery) {
      throw new RepositoryError(
        'CONFLICT',
        'Create a recovery code before removing this adult’s final passkey.',
      );
    }
    const now = this.now().toISOString();
    return this.database.transaction(() => {
      this.database
        .prepare('UPDATE passkey_credentials SET revoked_at = ? WHERE id = ?')
        .run(now, passkeyId);
      this.database
        .prepare(
          `UPDATE companion_sessions SET revoked_at = ?
           WHERE credential_id = ? AND revoked_at IS NULL`,
        )
        .run(now, row.credential_id);
      const audit = this.writeAudit({
        householdId,
        actorId: actor.id,
        action: 'auth.passkey.revoke',
        targetType: 'passkey_credential',
        targetId: passkeyId,
        requestId,
        now,
        safeSummary: { memberId: row.member_id },
      });
      const result = PasskeyRevocationResultSchema.parse({
        access: this.adultAccess(householdId, actor),
        audit,
        replayed: false,
      });
      this.database
        .prepare(
          `INSERT INTO command_receipts
            (household_id, request_id, command_type, response_json, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(householdId, requestId, commandType, JSON.stringify(result), now);
      return result;
    })();
  }

  session(token: string): PasskeySession {
    const row = this.readSession(token, true);
    if (row === null) throw new RepositoryError('UNAUTHENTICATED', 'Sign in to continue.');
    return PasskeySessionSchema.parse({
      authenticated: true,
      householdId: row.householdId,
      memberId: row.memberId,
      displayName: row.displayName,
      expiresAt: row.expiresAt,
    });
  }

  authenticate(token: string): CommandActor {
    const session = this.session(token);
    return { id: session.memberId, type: 'member', source: 'companion' };
  }

  signOut(token: string): void {
    this.database
      .prepare(
        'UPDATE companion_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL',
      )
      .run(this.now().toISOString(), tokenDigest(token));
  }

  sessionCookie(token: string): string {
    const secure = this.configuration.secureCookie ? '; Secure' : '';
    return `${HEARTH_COMPANION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(SESSION_LIFETIME_MS / 1000)}${secure}`;
  }

  clearSessionCookie(): string {
    const secure = this.configuration.secureCookie ? '; Secure' : '';
    return `${HEARTH_COMPANION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
  }

  private async verifyExistingCredential(
    challenge: string,
    response: unknown,
    expected?: { householdId: string; memberId: string },
  ): Promise<PasskeyCredentialRow> {
    const credentialId = credentialIdFromResponse(response);
    const credential = this.database
      .prepare(
        `SELECT credential_id, household_id, member_id, public_key, counter, transports_json
         FROM passkey_credentials
         WHERE credential_id = ? AND revoked_at IS NULL`,
      )
      .get(credentialId) as PasskeyCredentialRow | undefined;
    if (
      credential === undefined ||
      (expected !== undefined &&
        (credential.household_id !== expected.householdId ||
          credential.member_id !== expected.memberId))
    ) {
      throw new RepositoryError('UNAUTHENTICATED', 'That passkey is not recognised by Hearth.');
    }
    const transports = parseTransports(credential.transports_json);
    const newCounter = await this.engine.verifyAuthentication({
      response,
      expectedChallenge: challenge,
      expectedOrigin: this.configuration.origin,
      expectedRpId: this.configuration.rpId,
      credential: {
        id: credential.credential_id,
        publicKey: Uint8Array.from(credential.public_key),
        counter: credential.counter,
        ...(transports.length === 0 ? {} : { transports }),
      },
    });
    if (newCounter === null) {
      throw new RepositoryError('UNAUTHENTICATED', 'That passkey could not be verified.');
    }
    this.database
      .prepare(
        `UPDATE passkey_credentials SET counter = ?, last_used_at = ?
         WHERE credential_id = ? AND revoked_at IS NULL`,
      )
      .run(newCounter, this.now().toISOString(), credential.credential_id);
    return credential;
  }

  private async verifyNewCredential(
    challenge: string,
    response: unknown,
  ): Promise<PasskeyCredential> {
    const credential = await this.engine.verifyRegistration({
      response,
      expectedChallenge: challenge,
      expectedOrigin: this.configuration.origin,
      expectedRpId: this.configuration.rpId,
    });
    if (credential === null) {
      throw new RepositoryError('UNAUTHENTICATED', 'That passkey could not be verified.');
    }
    return credential;
  }

  private assertAdultAdministrator(householdId: string, actor: CommandActor): void {
    if (actor.type !== 'member' || actor.source !== 'companion') {
      throw new RepositoryError('FORBIDDEN', 'Only an adult administrator can manage access.');
    }
    const row = this.database
      .prepare(
        `SELECT role, capabilities_json FROM members
         WHERE id = ? AND household_id = ? AND archived_at IS NULL`,
      )
      .get(actor.id, householdId) as { role: string; capabilities_json: string } | undefined;
    const capabilities = row === undefined ? [] : (JSON.parse(row.capabilities_json) as unknown);
    if (
      row?.role !== 'adult' ||
      !Array.isArray(capabilities) ||
      !capabilities.includes('household.admin')
    ) {
      throw new RepositoryError('FORBIDDEN', 'Only an adult administrator can manage access.');
    }
  }

  private readAdultMember(householdId: string, memberId: string): AdultMemberRow {
    const member = this.database
      .prepare(
        `SELECT id, display_name, avatar_key FROM members
         WHERE id = ? AND household_id = ? AND role = 'adult' AND archived_at IS NULL`,
      )
      .get(memberId, householdId) as AdultMemberRow | undefined;
    if (member === undefined) {
      throw new RepositoryError('NOT_FOUND', 'Choose an active adult household member.');
    }
    return member;
  }

  private webAuthnUserId(householdId: string, memberId: string): Uint8Array<ArrayBuffer> {
    const row = this.database
      .prepare(
        `SELECT webauthn_user_id FROM passkey_credentials
         WHERE household_id = ? AND member_id = ?
         ORDER BY datetime(created_at), rowid LIMIT 1`,
      )
      .get(householdId, memberId) as { webauthn_user_id: string } | undefined;
    return row === undefined
      ? Uint8Array.from(randomBytes(32))
      : Uint8Array.from(Buffer.from(row.webauthn_user_id, 'base64url'));
  }

  private activeCredentials(householdId: string, memberId: string): ExistingCredentialRow[] {
    return this.database
      .prepare(
        `SELECT credential_id, transports_json FROM passkey_credentials
         WHERE household_id = ? AND member_id = ? AND revoked_at IS NULL`,
      )
      .all(householdId, memberId) as ExistingCredentialRow[];
  }

  private assertCredentialIsNew(credentialId: string): void {
    const existing = this.database
      .prepare('SELECT 1 FROM passkey_credentials WHERE credential_id = ?')
      .get(credentialId);
    if (existing !== undefined) {
      throw new RepositoryError('CONFLICT', 'That passkey is already enrolled with Hearth.');
    }
  }

  private insertCredential(input: {
    id: string;
    credential: PasskeyCredential;
    householdId: string;
    memberId: string;
    userId: Uint8Array;
    label: string;
    now: string;
  }): void {
    this.database
      .prepare(
        `INSERT INTO passkey_credentials
          (id, credential_id, household_id, member_id, webauthn_user_id, public_key, counter,
           device_type, backed_up, transports_json, label, created_at, last_used_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
      )
      .run(
        input.id,
        input.credential.id,
        input.householdId,
        input.memberId,
        Buffer.from(input.userId).toString('base64url'),
        Buffer.from(input.credential.publicKey),
        input.credential.counter,
        input.credential.deviceType,
        input.credential.backedUp ? 1 : 0,
        JSON.stringify(input.credential.transports ?? []),
        input.label,
        input.now,
      );
  }

  private readPasskeySummary(passkeyId: string): PasskeyCredentialSummary {
    const row = this.database
      .prepare(
        `SELECT id, member_id, label, device_type, backed_up, created_at, last_used_at
         FROM passkey_credentials WHERE id = ?`,
      )
      .get(passkeyId) as PasskeySummaryRow | undefined;
    if (row === undefined) throw new RepositoryError('NOT_FOUND', 'That passkey was not found.');
    return passkeySummary(row);
  }

  private writeAudit(input: {
    householdId: string;
    actorId: string;
    action: AuditSummary['action'];
    targetType: string;
    targetId: string;
    now: string;
    requestId?: string;
    safeSummary: Record<string, unknown>;
  }): AuditSummary {
    const id = opaqueId('audit_auth');
    this.database
      .prepare(
        `INSERT INTO audit_events
          (id, occurred_at, household_id, actor_type, actor_id, source_channel, action_type,
           target_type, target_id, request_id, result, safe_summary_json)
         VALUES (?, ?, ?, 'member', ?, 'companion', ?, ?, ?, ?, 'succeeded', ?)`,
      )
      .run(
        id,
        input.now,
        input.householdId,
        input.actorId,
        input.action,
        input.targetType,
        input.targetId,
        input.requestId ?? null,
        JSON.stringify(input.safeSummary),
      );
    return AuditSummarySchema.parse({
      id,
      actorType: 'member',
      actorId: input.actorId,
      source: 'companion',
      action: input.action,
      targetId: input.targetId,
      occurredAt: input.now,
      result: 'succeeded',
    });
  }

  private hasActiveRecoveryCode(householdId: string, memberId: string): boolean {
    return (
      this.database
        .prepare(
          `SELECT 1 FROM companion_recovery_codes
           WHERE household_id = ? AND member_id = ?
             AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
        )
        .get(householdId, memberId, this.now().toISOString()) !== undefined
    );
  }

  private readRevocationReceipt(
    householdId: string,
    requestId: string,
    commandType: string,
  ): PasskeyRevocationResult | null {
    const row = this.database
      .prepare(
        `SELECT response_json FROM command_receipts
         WHERE household_id = ? AND request_id = ? AND command_type = ?`,
      )
      .get(householdId, requestId, commandType) as { response_json: string } | undefined;
    return row === undefined
      ? null
      : PasskeyRevocationResultSchema.parse(JSON.parse(row.response_json) as unknown);
  }

  private recordRecoveryAttempt(remoteAddress: string): void {
    const now = this.now().getTime();
    const current = this.recoveryAttempts.get(remoteAddress);
    if (current !== undefined) {
      if (current.count >= MAX_INVALID_SETUP_ATTEMPTS) {
        throw new RepositoryError(
          'FORBIDDEN',
          'Too many recovery attempts. Wait a little before trying again.',
        );
      }
      current.count += 1;
      return;
    }
    if (this.recoveryAttempts.size >= MAX_TRACKED_AUTHENTICATION_ADDRESSES) {
      throw new RepositoryError(
        'FORBIDDEN',
        'Too many recovery attempts. Wait a little before trying again.',
      );
    }
    this.recoveryAttempts.set(remoteAddress, { count: 1, windowStartedAt: now });
  }

  private pruneRecoveryAttempts(): void {
    const now = this.now().getTime();
    for (const [remoteAddress, attempt] of this.recoveryAttempts) {
      if (now - attempt.windowStartedAt >= INVALID_SETUP_WINDOW_MS) {
        this.recoveryAttempts.delete(remoteAddress);
      }
    }
  }

  private pruneExpiredRegistrationState(): void {
    const now = this.now().getTime();
    for (const ceremonies of [
      this.additionalRegistrationCeremonies,
      this.recoveryConfirmationCeremonies,
      this.recoveryRegistrationCeremonies,
    ]) {
      for (const [ceremonyId, ceremony] of ceremonies) {
        if (ceremony.expiresAt <= now) ceremonies.delete(ceremonyId);
      }
    }
  }

  private takeAdditionalRegistrationCeremony(ceremonyId: string): AdditionalRegistrationCeremony {
    const ceremony = this.additionalRegistrationCeremonies.get(ceremonyId);
    this.additionalRegistrationCeremonies.delete(ceremonyId);
    if (ceremony === undefined || ceremony.expiresAt <= this.now().getTime()) {
      throw new RepositoryError('UNAUTHENTICATED', 'That passkey setup expired. Start again.');
    }
    return ceremony;
  }

  private takeRecoveryConfirmationCeremony(ceremonyId: string): RecoveryConfirmationCeremony {
    const ceremony = this.recoveryConfirmationCeremonies.get(ceremonyId);
    this.recoveryConfirmationCeremonies.delete(ceremonyId);
    if (ceremony === undefined || ceremony.expiresAt <= this.now().getTime()) {
      throw new RepositoryError('UNAUTHENTICATED', 'That confirmation expired. Start again.');
    }
    return ceremony;
  }

  private takeRecoveryRegistrationCeremony(ceremonyId: string): RecoveryRegistrationCeremony {
    const ceremony = this.recoveryRegistrationCeremonies.get(ceremonyId);
    this.recoveryRegistrationCeremonies.delete(ceremonyId);
    if (ceremony === undefined || ceremony.expiresAt <= this.now().getTime()) {
      throw new RepositoryError('UNAUTHENTICATED', 'That recovery attempt expired. Start again.');
    }
    return ceremony;
  }

  private createSession(
    householdId: string,
    memberId: string,
    credentialId: string,
  ): { session: PasskeySession; token: string } {
    const token = randomBytes(32).toString('base64url');
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + SESSION_LIFETIME_MS).toISOString();
    this.database
      .prepare(
        `INSERT INTO companion_sessions
          (token_hash, household_id, member_id, created_at, last_seen_at, expires_at, revoked_at,
           credential_id)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      )
      .run(
        tokenDigest(token),
        householdId,
        memberId,
        createdAt.toISOString(),
        createdAt.toISOString(),
        expiresAt,
        credentialId,
      );
    const member = this.readMember(householdId, memberId);
    return {
      token,
      session: PasskeySessionSchema.parse({
        authenticated: true,
        householdId,
        memberId,
        displayName: member.displayName,
        expiresAt,
      }),
    };
  }

  private readSession(token: string, touch: boolean): SessionMember | null {
    const now = this.now().toISOString();
    const row = this.database
      .prepare(
        `SELECT s.household_id, s.member_id, s.expires_at, m.display_name, m.role
         FROM companion_sessions s
         JOIN members m ON m.id = s.member_id AND m.household_id = s.household_id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
           AND m.archived_at IS NULL`,
      )
      .get(tokenDigest(token), now) as SessionMemberRow | undefined;
    if (row === undefined) return null;
    if (touch) {
      this.database
        .prepare('UPDATE companion_sessions SET last_seen_at = ? WHERE token_hash = ?')
        .run(now, tokenDigest(token));
    }
    return {
      householdId: row.household_id,
      memberId: row.member_id,
      displayName: row.display_name,
      role: row.role,
      expiresAt: row.expires_at,
    };
  }

  private readMember(householdId: string, memberId: string): Pick<SessionMember, 'displayName'> {
    const row = this.database
      .prepare(
        `SELECT display_name FROM members
         WHERE id = ? AND household_id = ? AND archived_at IS NULL`,
      )
      .get(memberId, householdId) as { display_name: string } | undefined;
    if (row === undefined) throw new RepositoryError('UNAUTHENTICATED', 'Sign in to continue.');
    return { displayName: row.display_name };
  }

  private insertDefaultLists(householdId: string, now: string): void {
    const insert = this.database.prepare(
      `INSERT INTO household_lists
        (id, household_id, name, list_type, colour, sort_order, archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    );
    insert.run(opaqueId('list'), householdId, 'Groceries', 'grocery', '#d77747', 0, now, now);
    insert.run(opaqueId('list'), householdId, 'To-do', 'custom', '#2f766d', 1, now, now);
  }

  private householdId(): string | null {
    const row = this.database
      .prepare('SELECT id FROM households ORDER BY datetime(created_at), rowid LIMIT 1')
      .get() as { id: string } | undefined;
    return row?.id ?? null;
  }

  private assertSetupAvailable(): void {
    if (this.householdId() !== null) {
      throw new RepositoryError('CONFLICT', 'This Hearth household is already set up.');
    }
  }

  private async readSetupCode(): Promise<string> {
    let value: string;
    try {
      value = (await this.configuration.readFirstUseCode()).trim();
    } catch {
      throw new RepositoryError(
        'INTEGRATION_UNAVAILABLE',
        'The local first-use code is not ready yet.',
      );
    }
    if (value.length < 12 || value.length > 160) {
      throw new RepositoryError(
        'INTEGRATION_UNAVAILABLE',
        'The local first-use code is not ready yet.',
      );
    }
    return value;
  }

  private assertNotRateLimited(remoteAddress: string): void {
    const attempt = this.invalidSetupAttempts.get(remoteAddress);
    if (attempt === undefined) return;
    if (this.now().getTime() - attempt.windowStartedAt >= INVALID_SETUP_WINDOW_MS) {
      this.invalidSetupAttempts.delete(remoteAddress);
      return;
    }
    if (attempt.count >= MAX_INVALID_SETUP_ATTEMPTS) {
      throw new RepositoryError(
        'FORBIDDEN',
        'Too many first-use attempts. Wait a little before trying again.',
      );
    }
  }

  private recordInvalidSetupAttempt(remoteAddress: string): void {
    const now = this.now().getTime();
    const current = this.invalidSetupAttempts.get(remoteAddress);
    if (current === undefined || now - current.windowStartedAt >= INVALID_SETUP_WINDOW_MS) {
      this.invalidSetupAttempts.set(remoteAddress, { count: 1, windowStartedAt: now });
      return;
    }
    current.count += 1;
  }

  private recordAuthenticationAttempt(remoteAddress: string): void {
    const now = this.now().getTime();
    const current = this.authenticationAttempts.get(remoteAddress);
    if (current !== undefined) {
      if (current.count >= MAX_AUTHENTICATION_OPTIONS_PER_ADDRESS) {
        throw new RepositoryError(
          'FORBIDDEN',
          'Too many sign-in attempts. Wait a few minutes and try again.',
        );
      }
      current.count += 1;
      return;
    }
    if (this.authenticationAttempts.size >= MAX_TRACKED_AUTHENTICATION_ADDRESSES) {
      throw new RepositoryError(
        'FORBIDDEN',
        'Too many sign-in attempts. Wait a few minutes and try again.',
      );
    }
    this.authenticationAttempts.set(remoteAddress, { count: 1, windowStartedAt: now });
  }

  private pruneExpiredAuthenticationState(): void {
    const now = this.now().getTime();
    for (const [ceremonyId, ceremony] of this.authenticationCeremonies) {
      if (ceremony.expiresAt <= now) this.authenticationCeremonies.delete(ceremonyId);
    }
    for (const [remoteAddress, attempt] of this.authenticationAttempts) {
      if (now - attempt.windowStartedAt >= AUTHENTICATION_ATTEMPT_WINDOW_MS) {
        this.authenticationAttempts.delete(remoteAddress);
      }
    }
  }

  private takeRegistrationCeremony(ceremonyId: string): RegistrationCeremony {
    const ceremony = this.registrationCeremonies.get(ceremonyId);
    this.registrationCeremonies.delete(ceremonyId);
    if (ceremony === undefined || ceremony.expiresAt <= this.now().getTime()) {
      throw new RepositoryError('UNAUTHENTICATED', 'That setup attempt expired. Start again.');
    }
    return ceremony;
  }

  private takeAuthenticationCeremony(ceremonyId: string): AuthenticationCeremony {
    const ceremony = this.authenticationCeremonies.get(ceremonyId);
    this.authenticationCeremonies.delete(ceremonyId);
    if (ceremony === undefined || ceremony.expiresAt <= this.now().getTime()) {
      throw new RepositoryError('UNAUTHENTICATED', 'That sign-in attempt expired. Try again.');
    }
    return ceremony;
  }
}

interface PasskeyCredentialRow {
  credential_id: string;
  household_id: string;
  member_id: string;
  public_key: Buffer;
  counter: number;
  transports_json: string;
}

interface ExistingCredentialRow {
  credential_id: string;
  transports_json: string;
}

interface PasskeySummaryRow {
  id: string;
  member_id: string;
  label: string;
  device_type: CredentialDeviceType;
  backed_up: number;
  created_at: string;
  last_used_at: string | null;
}

interface AdultMemberRow {
  id: string;
  display_name: string;
  avatar_key: string | null;
}

interface RecoveryCodeStatusRow {
  created_at: string;
  expires_at: string;
}

interface RecoveryCodeMemberRow {
  id: string;
  household_id: string;
  member_id: string;
  display_name: string;
}

interface RevocablePasskeyRow {
  id: string;
  credential_id: string;
  member_id: string;
}

interface SessionMemberRow {
  household_id: string;
  member_id: string;
  display_name: string;
  role: 'adult' | 'child';
  expires_at: string;
}

interface SessionMember {
  householdId: string;
  memberId: string;
  displayName: string;
  role: 'adult' | 'child';
  expiresAt: string;
}

function serializableRecord(value: object): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function ceremonyOptions(
  ceremonyId: string,
  options: object,
  expiresAt: number,
): PasskeyCeremonyOptions {
  return PasskeyCeremonyOptionsSchema.parse({
    ceremonyId,
    options: serializableRecord(options),
    expiresAt: new Date(expiresAt).toISOString(),
  });
}

function passkeySummary(value: unknown): PasskeyCredentialSummary {
  const row = value as PasskeySummaryRow;
  return PasskeyCredentialSummarySchema.parse({
    id: row.id,
    memberId: row.member_id,
    label: row.label,
    deviceType: row.device_type,
    backedUp: row.backed_up === 1,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  });
}

function credentialIdFromResponse(value: unknown): string {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    typeof value.id !== 'string' ||
    value.id.length === 0
  ) {
    throw new RepositoryError('VALIDATION_ERROR', 'The passkey response was incomplete.');
  }
  return value.id;
}

function parseTransports(value: string): AuthenticatorTransportFuture[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isTransport);
}

function isTransport(value: unknown): value is AuthenticatorTransportFuture {
  return (
    typeof value === 'string' &&
    ['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb'].includes(value)
  );
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

function tokenDigest(token: string): string {
  return digest(token).toString('hex');
}

function recoveryCode(): string {
  return randomBytes(16)
    .toString('hex')
    .toUpperCase()
    .match(/.{1,4}/g)!
    .join('-');
}

function recoveryCodeDigest(value: string): string {
  const normalized = value.replaceAll('-', '').replaceAll(' ', '').toUpperCase();
  if (!/^[A-F0-9]{32}$/.test(normalized)) {
    throw new RepositoryError('UNAUTHENTICATED', 'That recovery code was not accepted.');
  }
  return digest(normalized).toString('hex');
}

function safeEqual(actual: string, expected: string): boolean {
  return timingSafeEqual(digest(actual), digest(expected));
}

function opaqueId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '_')}`;
}
