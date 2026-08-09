import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildServer } from './app.js';
import { CompanionAuthService, type PasskeyEngine } from './companion-auth.js';
import { openHearthDatabase } from './database.js';

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
    const options = await harness.auth.authenticationOptions();
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
});

async function authHarness() {
  const directory = await mkdtemp(join(tmpdir(), 'hearth-auth-'));
  temporaryDirectories.push(directory);
  const database = await openHearthDatabase(join(directory, 'hearth.sqlite'));
  let consumed = false;
  const engine: PasskeyEngine = {
    registrationOptions: async () =>
      creationOptions('registration_challenge') as Awaited<
        ReturnType<PasskeyEngine['registrationOptions']>
      >,
    verifyRegistration: async () => ({
      id: 'credential_private_adult',
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
    engine,
  });
  return { auth, database, consumed: () => consumed };
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
