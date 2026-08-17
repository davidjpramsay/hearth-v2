import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildServer } from './app.js';
import { SqliteAdminRepository } from './admin-repository.js';
import { CompanionAuthService, type PasskeyEngine } from './companion-auth.js';
import { openHearthDatabase } from './database.js';
import { FixedClock } from './runtime-context.js';

const temporaryDirectories: string[] = [];
const servers: ReturnType<typeof buildServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => server.close()));
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true })),
  );
});

describe('companion passkey authentication', () => {
  it('creates first-use household data and stores only passkey material and a session hash', async () => {
    const harness = await authHarness();
    const options = await harness.auth.firstUseRegistrationOptions(setupInput(), '127.0.0.1');
    const result = await harness.auth.verifyFirstUseRegistration(options.ceremonyId, {
      id: 'credential_private_adult',
    });

    expect(result.session).toMatchObject({ authenticated: true, displayName: 'David' });
    expect(harness.consumed()).toBe(true);
    expect(harness.auth.status(result.token)).toMatchObject({
      configured: true,
      secureOrigin: true,
      requiresSetup: false,
      authenticated: true,
      actor: { displayName: 'David', role: 'adult' },
    });
    expect(harness.auth.authenticate(result.token)).toMatchObject({
      type: 'member',
      source: 'companion',
    });

    const household = harness.database.prepare('SELECT name, timezone FROM households').get();
    const member = harness.database
      .prepare('SELECT display_name, role, capabilities_json FROM members')
      .get() as { display_name: string; role: string; capabilities_json: string };
    const lists = harness.database
      .prepare('SELECT name, list_type FROM household_lists ORDER BY sort_order')
      .all();
    const storedSession = harness.database
      .prepare('SELECT token_hash FROM companion_sessions')
      .get() as { token_hash: string };
    const credential = harness.database
      .prepare(
        'SELECT credential_id, length(public_key) AS public_key_bytes FROM passkey_credentials',
      )
      .get();
    const audit = harness.database
      .prepare('SELECT action_type, safe_summary_json FROM audit_events')
      .get();

    expect(household).toEqual({ name: 'Ramsay home', timezone: 'Australia/Perth' });
    expect(member).toMatchObject({ display_name: 'David', role: 'adult' });
    expect(JSON.parse(member.capabilities_json)).toContain('household.admin');
    expect(lists).toEqual([
      { name: 'Groceries', list_type: 'grocery' },
      { name: 'To-do', list_type: 'custom' },
    ]);
    expect(storedSession.token_hash).toHaveLength(64);
    expect(storedSession.token_hash).not.toContain(result.token);
    expect(credential).toEqual({ credential_id: 'credential_private_adult', public_key_bytes: 4 });
    expect(audit).toEqual({
      action_type: 'auth.passkey.register',
      safe_summary_json: '{"firstUse":true}',
    });
    expect(JSON.stringify(household)).not.toContain('correct horse');
    harness.database.close();
  });

  it('uses a discoverable passkey, advances its counter and revokes sign-out sessions', async () => {
    const harness = await authHarness();
    const registration = await harness.auth.firstUseRegistrationOptions(setupInput(), '127.0.0.1');
    await harness.auth.verifyFirstUseRegistration(registration.ceremonyId, {
      id: 'credential_private_adult',
    });
    const options = await harness.auth.authenticationOptions('127.0.0.1');
    expect(options.options).not.toHaveProperty('allowCredentials');
    const signedIn = await harness.auth.verifyAuthentication(options.ceremonyId, {
      id: 'credential_private_adult',
    });
    expect(harness.auth.session(signedIn.token)).toMatchObject({ displayName: 'David' });
    expect(harness.database.prepare('SELECT counter FROM passkey_credentials').get()).toEqual({
      counter: 7,
    });

    harness.auth.signOut(signedIn.token);
    expect(() => harness.auth.session(signedIn.token)).toThrow(/Sign in to continue/);
    expect(harness.auth.clearSessionCookie()).toContain('Max-Age=0');
    harness.database.close();
  });

  it('rate-limits invalid first-use codes without revealing the expected code', async () => {
    const harness = await authHarness();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        harness.auth.firstUseRegistrationOptions(
          { ...setupInput(), setupCode: 'wrong-code-value' },
          '192.0.2.10',
        ),
      ).rejects.toThrow(/not accepted/);
    }
    await expect(
      harness.auth.firstUseRegistrationOptions(setupInput(), '192.0.2.10'),
    ).rejects.toThrow(/Too many first-use attempts/);
    expect(
      JSON.stringify(harness.database.prepare('SELECT * FROM households').all()),
    ).not.toContain('correct horse');
    harness.database.close();
  });

  it('bounds unauthenticated sign-in ceremonies and prunes expired attempts', async () => {
    const harness = await authHarness();
    const registration = await harness.auth.firstUseRegistrationOptions(setupInput(), '127.0.0.1');
    await harness.auth.verifyFirstUseRegistration(registration.ceremonyId, {
      id: 'credential_private_adult',
    });

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await harness.auth.authenticationOptions('192.0.2.10');
    }
    await expect(harness.auth.authenticationOptions('192.0.2.10')).rejects.toThrow(
      /Too many sign-in attempts/,
    );

    harness.advance(5 * 60 * 1000 + 1);
    await expect(harness.auth.authenticationOptions('192.0.2.10')).resolves.toBeDefined();
    for (let index = 1; index < 128; index += 1) {
      await harness.auth.authenticationOptions(`198.51.100.${index}`);
    }
    await expect(harness.auth.authenticationOptions('203.0.113.1')).rejects.toThrow(
      /Too many sign-in attempts/,
    );
    harness.database.close();
  });

  it('serves no-store auth routes, sets the HttpOnly cookie and clears it on sign out', async () => {
    const harness = await authHarness();
    const app = buildServer({
      logger: false,
      demoMode: false,
      companionAuth: harness.auth,
    });
    servers.push(app);
    const status = await app.inject({ method: 'GET', url: '/api/v1/auth/status' });
    expect(status.statusCode).toBe(200);
    expect(status.headers['cache-control']).toBe('no-store');
    expect(status.json()).toMatchObject({ requiresSetup: true, authenticated: false });
    const malformedCookieStatus = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/status',
      headers: { cookie: 'hearth_session=%' },
    });
    expect(malformedCookieStatus.statusCode).toBe(200);
    expect(malformedCookieStatus.json()).toMatchObject({ authenticated: false });

    const options = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/first-use/registration-options',
      payload: setupInput(),
    });
    const verification = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/first-use/registration-verifications',
      payload: {
        ceremonyId: options.json().ceremonyId,
        response: { id: 'credential_private_adult' },
      },
    });
    expect(verification.statusCode).toBe(200);
    expect(verification.headers['set-cookie']).toMatch(
      /hearth_session=.*HttpOnly; SameSite=Strict.*Secure/,
    );
    const setCookie = verification.headers['set-cookie'];
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0];
    const session = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: cookie === undefined ? {} : { cookie },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({ displayName: 'David' });

    const signedOut = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-outs',
      headers: cookie === undefined ? {} : { cookie },
    });
    expect(signedOut.json()).toEqual({ signedOut: true });
    expect(signedOut.headers['set-cookie']).toContain('Max-Age=0');
    harness.database.close();
  });

  it('adds a passkey for another named adult and revokes a spare idempotently', async () => {
    const harness = await authHarness();
    const registration = await harness.auth.firstUseRegistrationOptions(setupInput(), '127.0.0.1');
    const first = await harness.auth.verifyFirstUseRegistration(registration.ceremonyId, {
      id: 'credential_private_adult',
    });
    const actor = harness.auth.authenticate(first.token);
    insertAdult(harness.database, 'member_alex', 'Alex');

    harness.setRegistrationCredentialId('credential_alex_phone');
    const options = await harness.auth.additionalRegistrationOptions(
      first.session.householdId,
      actor,
      { memberId: 'member_alex', passkeyLabel: 'Alex’s iPhone' },
    );
    const enrolled = await harness.auth.verifyAdditionalRegistration(
      first.session.householdId,
      actor,
      options.ceremonyId,
      { id: 'credential_alex_phone' },
    );
    expect(enrolled.credential).toMatchObject({
      memberId: 'member_alex',
      label: 'Alex’s iPhone',
      backedUp: true,
    });
    expect(enrolled.audit.action).toBe('auth.passkey.register');
    expect(harness.auth.adultAccess(first.session.householdId, actor).adults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          member: expect.objectContaining({ displayName: 'Alex' }),
          passkeys: [expect.objectContaining({ label: 'Alex’s iPhone' })],
        }),
      ]),
    );

    harness.setRegistrationCredentialId('credential_alex_tablet');
    const spareOptions = await harness.auth.additionalRegistrationOptions(
      first.session.householdId,
      actor,
      { memberId: 'member_alex', passkeyLabel: 'Alex’s iPad' },
    );
    const spare = await harness.auth.verifyAdditionalRegistration(
      first.session.householdId,
      actor,
      spareOptions.ceremonyId,
      { id: 'credential_alex_tablet' },
    );
    const revoked = harness.auth.revokePasskey(
      first.session.householdId,
      spare.credential.id,
      actor,
      'request_revoke_alex_tablet',
    );
    expect(revoked.replayed).toBe(false);
    expect(
      revoked.access.adults.find((adult) => adult.member.id === 'member_alex')?.passkeys,
    ).toHaveLength(1);
    expect(
      harness.auth.revokePasskey(
        first.session.householdId,
        spare.credential.id,
        actor,
        'request_revoke_alex_tablet',
      ).replayed,
    ).toBe(true);
    const alexOnly = enrolled.credential.id;
    expect(() =>
      harness.auth.revokePasskey(
        first.session.householdId,
        alexOnly,
        actor,
        'request_revoke_alex_final',
      ),
    ).toThrow(/final passkey/);
    harness.database.close();
  });

  it('reveals a recovery code once and replaces all previous access after recovery', async () => {
    const harness = await authHarness();
    const registration = await harness.auth.firstUseRegistrationOptions(setupInput(), '127.0.0.1');
    const first = await harness.auth.verifyFirstUseRegistration(registration.ceremonyId, {
      id: 'credential_private_adult',
    });
    const actor = harness.auth.authenticate(first.token);
    const confirmation = await harness.auth.recoveryConfirmationOptions(
      first.session.householdId,
      actor,
    );
    const recovery = await harness.auth.createRecoveryCode(
      first.session.householdId,
      actor,
      confirmation.ceremonyId,
      { id: 'credential_private_adult' },
    );
    expect(recovery.code).toMatch(/^([A-F0-9]{4}-){7}[A-F0-9]{4}$/);
    const stored = harness.database
      .prepare('SELECT code_hash FROM companion_recovery_codes')
      .get() as { code_hash: string };
    expect(stored.code_hash).toHaveLength(64);
    expect(stored.code_hash).not.toContain(recovery.code.replaceAll('-', ''));
    expect(
      harness.auth.adultAccess(first.session.householdId, actor).adults[0]?.recovery.configured,
    ).toBe(true);

    harness.setRegistrationCredentialId('credential_recovered_phone');
    const recoveryOptions = await harness.auth.recoveryRegistrationOptions(
      { recoveryCode: recovery.code, passkeyLabel: 'Replacement iPhone' },
      '192.0.2.20',
    );
    const recovered = await harness.auth.verifyRecoveryRegistration(recoveryOptions.ceremonyId, {
      id: 'credential_recovered_phone',
    });
    expect(recovered.session).toMatchObject({ displayName: 'David' });
    expect(() => harness.auth.session(first.token)).toThrow(/Sign in to continue/);
    expect(
      harness.database
        .prepare('SELECT credential_id FROM passkey_credentials WHERE revoked_at IS NULL')
        .all(),
    ).toEqual([{ credential_id: 'credential_recovered_phone' }]);
    expect(
      harness.database.prepare('SELECT consumed_at FROM companion_recovery_codes').get(),
    ).toEqual({
      consumed_at: '2026-08-02T23:42:00.000Z',
    });
    await expect(
      harness.auth.recoveryRegistrationOptions(
        { recoveryCode: recovery.code, passkeyLabel: 'Replay phone' },
        '192.0.2.20',
      ),
    ).rejects.toThrow(/not accepted/);
    expect(
      harness.database
        .prepare(
          "SELECT action_type FROM audit_events WHERE action_type LIKE 'auth.%' ORDER BY rowid",
        )
        .all(),
    ).toEqual([
      { action_type: 'auth.passkey.register' },
      { action_type: 'auth.recovery-code.rotate' },
      { action_type: 'auth.account.recover' },
    ]);
    harness.database.close();
  });

  it('serves the authenticated adult-access and unauthenticated recovery route contracts', async () => {
    const harness = await authHarness();
    const registration = await harness.auth.firstUseRegistrationOptions(setupInput(), '127.0.0.1');
    const first = await harness.auth.verifyFirstUseRegistration(registration.ceremonyId, {
      id: 'credential_private_adult',
    });
    const app = buildServer({
      logger: false,
      adminRepository: new SqliteAdminRepository(harness.database, { seedDemo: false }),
      companionAuth: harness.auth,
      runtime: {
        mode: 'private',
        householdId: first.session.householdId,
        clock: new FixedClock('2026-08-03T07:42:00+08:00'),
      },
    });
    servers.push(app);
    const cookie = harness.auth.sessionCookie(first.token).split(';')[0];
    const headers = { cookie };

    const access = await app.inject({
      method: 'GET',
      url: `/api/v1/households/${first.session.householdId}/adult-access`,
      headers,
    });
    expect(access.statusCode).toBe(200);
    expect(access.json()).toMatchObject({
      actorMemberId: first.session.memberId,
      adults: [{ member: { displayName: 'David' } }],
    });
    const invalid = await app.inject({
      method: 'POST',
      url: `/api/v1/households/${first.session.householdId}/adult-access/passkey-registration-options`,
      headers,
      payload: { memberId: first.session.memberId },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

    harness.setRegistrationCredentialId('credential_spare_phone');
    const options = await app.inject({
      method: 'POST',
      url: `/api/v1/households/${first.session.householdId}/adult-access/passkey-registration-options`,
      headers,
      payload: { memberId: first.session.memberId, passkeyLabel: 'Spare phone' },
    });
    const verification = await app.inject({
      method: 'POST',
      url: `/api/v1/households/${first.session.householdId}/adult-access/passkey-registration-verifications`,
      headers,
      payload: {
        ceremonyId: options.json().ceremonyId,
        response: { id: 'credential_spare_phone' },
      },
    });
    expect(verification.statusCode).toBe(200);
    expect(verification.json()).toMatchObject({ credential: { label: 'Spare phone' } });

    const confirmation = await app.inject({
      method: 'POST',
      url: `/api/v1/households/${first.session.householdId}/adult-access/recovery-confirmation-options`,
      headers,
    });
    const code = await app.inject({
      method: 'POST',
      url: `/api/v1/households/${first.session.householdId}/adult-access/recovery-codes`,
      headers,
      payload: {
        ceremonyId: confirmation.json().ceremonyId,
        response: { id: 'credential_private_adult' },
      },
    });
    expect(code.statusCode).toBe(200);
    expect(code.json().code).toMatch(/^([A-F0-9]{4}-){7}[A-F0-9]{4}$/);

    harness.setRegistrationCredentialId('credential_route_recovery');
    const recoveryOptions = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/recovery/registration-options',
      payload: { recoveryCode: code.json().code, passkeyLabel: 'Recovered phone' },
    });
    const recovered = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/recovery/registration-verifications',
      payload: {
        ceremonyId: recoveryOptions.json().ceremonyId,
        response: { id: 'credential_route_recovery' },
      },
    });
    expect(recovered.statusCode).toBe(200);
    expect(recovered.headers['set-cookie']).toContain('HttpOnly');
    expect(recovered.json()).toMatchObject({ authenticated: true, displayName: 'David' });
    harness.database.close();
  });
});

async function authHarness() {
  const directory = await mkdtemp(join(tmpdir(), 'hearth-auth-'));
  temporaryDirectories.push(directory);
  const database = await openHearthDatabase(join(directory, 'hearth.sqlite'));
  let consumed = false;
  let now = Date.parse('2026-08-03T07:42:00+08:00');
  let registrationCredentialId = 'credential_private_adult';
  const engine: PasskeyEngine = {
    registrationOptions: async () =>
      creationOptions('registration_challenge') as Awaited<
        ReturnType<PasskeyEngine['registrationOptions']>
      >,
    verifyRegistration: async () => ({
      id: registrationCredentialId,
      publicKey: Uint8Array.from([1, 2, 3, 4]),
      counter: 0,
      transports: ['internal'],
      deviceType: 'multiDevice',
      backedUp: true,
    }),
    authenticationOptions: async () =>
      ({
        challenge: 'authentication_challenge',
        rpId: 'hearth.home.arpa',
        userVerification: 'required',
      }) as Awaited<ReturnType<PasskeyEngine['authenticationOptions']>>,
    verifyAuthentication: async () => 7,
  };
  const auth = new CompanionAuthService(database, {
    mode: 'private',
    rpId: 'hearth.home.arpa',
    origin: 'https://hearth.home.arpa',
    secureCookie: true,
    readFirstUseCode: async () => 'correct horse battery staple',
    consumeFirstUseCode: async () => {
      consumed = true;
    },
    now: () => new Date(now),
    engine,
  });
  return {
    auth,
    database,
    consumed: () => consumed,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
    setRegistrationCredentialId: (credentialId: string) => {
      registrationCredentialId = credentialId;
    },
  };
}

function insertAdult(
  database: Awaited<ReturnType<typeof openHearthDatabase>>,
  memberId: string,
  displayName: string,
): void {
  database
    .prepare(
      `INSERT INTO members
        (id, household_id, display_name, colour, avatar_key, role, archived_at,
         created_at, updated_at, capabilities_json)
       SELECT ?, id, ?, '#6f5a87', '/brand/hearth-mark.png', 'adult', NULL, ?, ?, ?
       FROM households LIMIT 1`,
    )
    .run(
      memberId,
      displayName,
      '2026-08-02T23:42:00.000Z',
      '2026-08-02T23:42:00.000Z',
      JSON.stringify([
        'household.admin',
        'household.view',
        'chores.complete',
        'lists.change',
        'meals.change',
        'pocket-money.view',
        'home.control',
      ]),
    );
}

function setupInput() {
  return {
    setupCode: 'correct horse battery staple',
    householdName: 'Ramsay home',
    adultName: 'David',
    timezone: 'Australia/Perth',
    passkeyLabel: 'David’s iPhone',
  };
}

function creationOptions(challenge: string) {
  return {
    challenge,
    rp: { name: 'Hearth', id: 'hearth.home.arpa' },
    user: { id: 'web_authn_user', name: 'David', displayName: 'David' },
    pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
    timeout: 300_000,
  };
}
