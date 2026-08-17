import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from '@playwright/test';
import { afterAll, describe, expect, it } from 'vitest';

import { buildServer } from './app.js';
import { SqliteAdminRepository } from './admin-repository.js';
import { CompanionAuthService } from './companion-auth.js';
import { openHearthDatabase } from './database.js';

const temporaryDirectories: string[] = [];

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => rm(directory, { recursive: true })),
  );
});

describe('real browser WebAuthn contract', () => {
  it('registers and signs back in with a discoverable virtual passkey', async () => {
    const port = await availablePort();
    const origin = `http://localhost:${port}`;
    const directory = await mkdtemp(join(tmpdir(), 'hearth-webauthn-'));
    temporaryDirectories.push(directory);
    const database = await openHearthDatabase(join(directory, 'hearth.sqlite'));
    let setupCodeConsumed = false;
    const auth = new CompanionAuthService(database, {
      mode: 'private',
      rpId: 'localhost',
      origin,
      secureCookie: false,
      readFirstUseCode: async () => 'browser-only-first-use-code',
      consumeFirstUseCode: async () => {
        setupCodeConsumed = true;
      },
    });
    const app = buildServer({
      logger: false,
      demoMode: false,
      adminRepository: new SqliteAdminRepository(database, { seedDemo: false }),
      companionAuth: auth,
    });
    await app.listen({ host: '127.0.0.1', port });
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('WebAuthn.enable');
      await cdp.send('WebAuthn.addVirtualAuthenticator', {
        options: {
          protocol: 'ctap2',
          transport: 'internal',
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
          automaticPresenceSimulation: true,
        },
      });
      await page.goto(`${origin}/api/v1/health`);

      const firstSession = await page.evaluate(async () => {
        const optionsResponse = await fetch('/api/v1/auth/first-use/registration-options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            setupCode: 'browser-only-first-use-code',
            householdName: 'Browser home',
            adultName: 'David',
            timezone: 'Australia/Perth',
            passkeyLabel: 'Virtual phone',
          }),
        });
        const ceremony = (await optionsResponse.json()) as CeremonyResponse;
        const browserGlobal = globalThis as unknown as BrowserWebAuthnGlobals;
        const modernCredential = browserGlobal.PublicKeyCredential;
        const publicKey = modernCredential.parseCreationOptionsFromJSON(ceremony.options);
        const credential = await browserGlobal.navigator.credentials.create({ publicKey });
        if (credential === null) throw new Error('Virtual passkey registration was cancelled.');
        const verification = await fetch('/api/v1/auth/first-use/registration-verifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ceremonyId: ceremony.ceremonyId,
            response: credential.toJSON(),
          }),
        });
        return { status: verification.status, body: await verification.json() };
      });
      expect(firstSession).toMatchObject({
        status: 200,
        body: { authenticated: true, displayName: 'David' },
      });
      expect(setupCodeConsumed).toBe(true);
      const cookies = await context.cookies();
      expect(cookies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'hearth_session', httpOnly: true, sameSite: 'Strict' }),
        ]),
      );
      expect(
        await page.evaluate(
          () => (globalThis as unknown as BrowserWebAuthnGlobals).document.cookie,
        ),
      ).toBe('');

      await page.evaluate(() => fetch('/api/v1/auth/sign-outs', { method: 'POST' }));
      const signedOutStatus = await page.evaluate(async () =>
        (await fetch('/api/v1/auth/status')).json(),
      );
      expect(signedOutStatus).toMatchObject({ authenticated: false, requiresSetup: false });

      const signedBackIn = await page.evaluate(async () => {
        const optionsResponse = await fetch('/api/v1/auth/authentication-options', {
          method: 'POST',
        });
        const ceremony = (await optionsResponse.json()) as CeremonyResponse;
        const browserGlobal = globalThis as unknown as BrowserWebAuthnGlobals;
        const modernCredential = browserGlobal.PublicKeyCredential;
        const publicKey = modernCredential.parseRequestOptionsFromJSON(ceremony.options);
        const credential = await browserGlobal.navigator.credentials.get({ publicKey });
        if (credential === null) throw new Error('Virtual passkey authentication was cancelled.');
        const verification = await fetch('/api/v1/auth/authentication-verifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ceremonyId: ceremony.ceremonyId,
            response: (credential as ModernCredentialInstance).toJSON(),
          }),
        });
        return { status: verification.status, body: await verification.json() };
      });
      expect(signedBackIn).toMatchObject({
        status: 200,
        body: { authenticated: true, displayName: 'David' },
      });
      expect(database.prepare('SELECT counter FROM passkey_credentials').get()).toEqual({
        counter: 2,
      });

      const recoveredSession = await page.evaluate(async () => {
        const confirmationResponse = await fetch(
          '/api/v1/households/' +
            ((await (await fetch('/api/v1/auth/session')).json()) as { householdId: string })
              .householdId +
            '/adult-access/recovery-confirmation-options',
          { method: 'POST' },
        );
        const confirmation = (await confirmationResponse.json()) as CeremonyResponse;
        const browserGlobal = globalThis as unknown as BrowserWebAuthnGlobals;
        const requestOptions = browserGlobal.PublicKeyCredential.parseRequestOptionsFromJSON(
          confirmation.options,
        );
        const existingCredential = await browserGlobal.navigator.credentials.get({
          publicKey: requestOptions,
        });
        if (existingCredential === null) throw new Error('Recovery confirmation was cancelled.');
        const session = (await (await fetch('/api/v1/auth/session')).json()) as {
          householdId: string;
        };
        const codeResponse = await fetch(
          `/api/v1/households/${session.householdId}/adult-access/recovery-codes`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ceremonyId: confirmation.ceremonyId,
              response: existingCredential.toJSON(),
            }),
          },
        );
        const recovery = (await codeResponse.json()) as { code: string };
        await fetch('/api/v1/auth/sign-outs', { method: 'POST' });
        const optionsResponse = await fetch('/api/v1/auth/recovery/registration-options', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recoveryCode: recovery.code,
            passkeyLabel: 'Recovered virtual phone',
          }),
        });
        const ceremony = (await optionsResponse.json()) as CeremonyResponse;
        const creationOptions = browserGlobal.PublicKeyCredential.parseCreationOptionsFromJSON(
          ceremony.options,
        );
        const replacement = await browserGlobal.navigator.credentials.create({
          publicKey: creationOptions,
        });
        if (replacement === null) throw new Error('Recovery passkey creation was cancelled.');
        const verification = await fetch('/api/v1/auth/recovery/registration-verifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ceremonyId: ceremony.ceremonyId,
            response: replacement.toJSON(),
          }),
        });
        return { status: verification.status, body: await verification.json() };
      });
      expect(recoveredSession).toMatchObject({
        status: 200,
        body: { authenticated: true, displayName: 'David' },
      });
      expect(
        database
          .prepare('SELECT COUNT(*) AS count FROM passkey_credentials WHERE revoked_at IS NULL')
          .get(),
      ).toEqual({ count: 1 });
    } finally {
      await browser.close();
      await app.close();
      database.close();
    }
  });
});

interface CeremonyResponse {
  ceremonyId: string;
  options: Record<string, unknown>;
}

interface ModernPublicKeyCredential {
  parseCreationOptionsFromJSON(value: Record<string, unknown>): unknown;
  parseRequestOptionsFromJSON(value: Record<string, unknown>): unknown;
}

interface ModernCredentialInstance {
  toJSON(): Record<string, unknown>;
}

interface BrowserWebAuthnGlobals {
  PublicKeyCredential: ModernPublicKeyCredential;
  navigator: {
    credentials: {
      create(input: { publicKey: unknown }): Promise<ModernCredentialInstance | null>;
      get(input: { publicKey: unknown }): Promise<ModernCredentialInstance | null>;
    };
  };
  document: { cookie: string };
}

function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a local test port.'));
        return;
      }
      server.close((error) => (error === undefined ? resolve(address.port) : reject(error)));
    });
  });
}
