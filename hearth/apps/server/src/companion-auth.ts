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
  PasskeyAuthStatusSchema,
  PasskeyCeremonyOptionsSchema,
  PasskeySessionSchema,
  type FirstUsePasskeyOptionsRequest,
  type PasskeyAuthStatus,
  type PasskeyCeremonyOptions,
  type PasskeySession,
  type RuntimeMode,
} from '@hearth/shared';

import { RepositoryError, type CommandActor } from './repository.js';

const CEREMONY_LIFETIME_MS = 5 * 60 * 1000;
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const INVALID_SETUP_WINDOW_MS = 15 * 60 * 1000;
const MAX_INVALID_SETUP_ATTEMPTS = 5;
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
  authenticationOptions(): Promise<PasskeyCeremonyOptions>;
  verifyAuthentication(
    ceremonyId: string,
    response: unknown,
  ): Promise<{ session: PasskeySession; token: string }>;
  session(token: string): PasskeySession;
  authenticate(token: string): CommandActor;
  signOut(token: string): void;
  sessionCookie(token: string): string;
  clearSessionCookie(): string;
}

export class CompanionAuthService implements CompanionAuthRepository {
  private readonly registrationCeremonies = new Map<string, RegistrationCeremony>();
  private readonly authenticationCeremonies = new Map<string, AuthenticationCeremony>();
  private readonly invalidSetupAttempts = new Map<string, InvalidSetupAttempts>();
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
    const session = this.createSession(householdId, memberId);
    return session;
  }

  async authenticationOptions(): Promise<PasskeyCeremonyOptions> {
    if (this.householdId() === null) {
      throw new RepositoryError('CONFLICT', 'Finish first-use setup before signing in.');
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
    const credentialId = credentialIdFromResponse(response);
    const credential = this.database
      .prepare(
        `SELECT credential_id, household_id, member_id, public_key, counter, transports_json
         FROM passkey_credentials
         WHERE credential_id = ? AND revoked_at IS NULL`,
      )
      .get(credentialId) as PasskeyCredentialRow | undefined;
    if (credential === undefined) {
      throw new RepositoryError('UNAUTHENTICATED', 'That passkey is not recognised by Hearth.');
    }
    const transports = parseTransports(credential.transports_json);
    const newCounter = await this.engine.verifyAuthentication({
      response,
      expectedChallenge: ceremony.challenge,
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
    const now = this.now().toISOString();
    this.database
      .prepare(
        `UPDATE passkey_credentials SET counter = ?, last_used_at = ?
         WHERE credential_id = ? AND revoked_at IS NULL`,
      )
      .run(newCounter, now, credential.credential_id);
    return this.createSession(credential.household_id, credential.member_id);
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

  private createSession(
    householdId: string,
    memberId: string,
  ): { session: PasskeySession; token: string } {
    const token = randomBytes(32).toString('base64url');
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + SESSION_LIFETIME_MS).toISOString();
    this.database
      .prepare(
        `INSERT INTO companion_sessions
          (token_hash, household_id, member_id, created_at, last_seen_at, expires_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      )
      .run(
        tokenDigest(token),
        householdId,
        memberId,
        createdAt.toISOString(),
        createdAt.toISOString(),
        expiresAt,
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
      .prepare('SELECT id FROM households ORDER BY created_at LIMIT 1')
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

function safeEqual(actual: string, expected: string): boolean {
  return timingSafeEqual(digest(actual), digest(expected));
}

function opaqueId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '_')}`;
}
