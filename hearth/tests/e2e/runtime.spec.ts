import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

import { captureEvidence } from './visualEvidence';

const evidence = resolve('docs/evidence/runtime');

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
});

test('private first use is honest and does not request demo household data', async ({ page }) => {
  let householdRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/households/')) householdRequests += 1;
  });
  await page.route('**/api/v1/runtime', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'private',
        generatedAt: '2026-08-09T02:20:00.000Z',
        household: null,
        timezone: 'Australia/Perth',
        locale: 'en-AU',
        localDate: '2026-08-09',
        weekStart: '2026-08-03',
        currentMonth: '2026-08',
        requiresSetup: true,
      }),
    }),
  );
  await page.route('**/api/v1/auth/status', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'private',
        configured: true,
        secureOrigin: true,
        requiresSetup: true,
        authenticated: false,
        actor: null,
      }),
    }),
  );

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'Set up this Hearth' })).toBeVisible();
  await expect(page.getByText('Finish setup on your iPhone')).toBeVisible();
  await expect(page.locator('form')).toBeHidden();
  expect(householdRequests).toBe(0);
  await captureEvidence(page, {
    path: resolve(evidence, 'private-first-use-tv-1080.png'),
    animations: 'disabled',
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('form')).toBeVisible();
  await expect(page.getByLabel('Local first-use code')).toBeVisible();
  await captureEvidence(page, {
    path: resolve(evidence, 'private-first-use-phone-portrait.png'),
    animations: 'disabled',
  });
});

test('configured private Hearth requires a passkey before revealing household data', async ({
  page,
}) => {
  let householdRequests = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/households/')) householdRequests += 1;
  });
  await page.route('**/api/v1/runtime', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'private',
        generatedAt: '2026-08-09T02:20:00.000Z',
        household: null,
        timezone: 'Australia/Perth',
        locale: 'en-AU',
        localDate: '2026-08-09',
        weekStart: '2026-08-03',
        currentMonth: '2026-08',
        requiresSetup: false,
      }),
    }),
  );
  await page.route('**/api/v1/auth/status', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'private',
        configured: true,
        secureOrigin: true,
        requiresSetup: false,
        authenticated: false,
        actor: null,
      }),
    }),
  );

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'Sign in to open Hearth' })).toBeVisible();
  await expect(page.getByText(/calendar, photos and family information private/i)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Pair this screen as a television' }),
  ).toBeVisible();
  expect(householdRequests).toBe(0);
  await captureEvidence(page, {
    path: resolve(evidence, 'private-sign-in-tv-1080.png'),
    animations: 'disabled',
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toBeVisible();
  await captureEvidence(page, {
    path: resolve(evidence, 'private-sign-in-phone-portrait.png'),
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Use a recovery code' }).click();
  await expect(page.getByRole('heading', { name: 'Recover adult access' })).toBeVisible();
  await expect(page.getByLabel('Recovery code')).toHaveAttribute('autocomplete', 'off');
  await expect(page.getByText(/removes the old passkeys and signed-in sessions/i)).toBeVisible();
  await captureEvidence(page, {
    path: resolve(evidence, 'private-recovery-phone-portrait.png'),
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to open Hearth' })).toBeVisible();
});

test('configured private Hearth offers browser television pairing without exposing its secret', async ({
  page,
}) => {
  const pairing = {
    id: 'pairing_m7_browser',
    requestId: 'request_m7_browser',
    code: 'M7PAIR',
    deviceName: 'Browser television',
    status: 'pending',
    expiresAt: '2026-08-16T15:00:00.000Z',
    approvedDeviceId: null,
  };
  let submittedSecret = '';
  await page.route('**/api/v1/runtime', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'private',
        generatedAt: '2026-08-16T14:30:00.000Z',
        household: null,
        timezone: 'Australia/Perth',
        locale: 'en-AU',
        localDate: '2026-08-16',
        weekStart: '2026-08-10',
        currentMonth: '2026-08',
        requiresSetup: false,
      }),
    }),
  );
  await page.route('**/api/v1/auth/status', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'private',
        configured: true,
        secureOrigin: true,
        requiresSetup: false,
        authenticated: false,
        actor: null,
      }),
    }),
  );
  await page.route('**/api/v1/tv-pairing-sessions', async (route) => {
    const body = route.request().postDataJSON() as { pairingSecret: string };
    submittedSecret = body.pairingSecret;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ pairing }) });
  });
  await page.route('**/api/v1/device-pairing-requests/pairing_m7_browser', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(pairing) }),
  );

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');
  await page.getByRole('button', { name: 'Pair this screen as a television' }).click();
  await expect(page.getByRole('heading', { name: 'Connect this screen' })).toBeVisible();
  await expect(page.getByLabel('Pairing code M7PAIR')).toBeVisible();
  await expect(page.getByText(/Waiting for an adult’s approval/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to sign in' })).toBeFocused();
  expect(submittedSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
  await expect(page.locator('body')).not.toContainText(submittedSecret);
  expect(page.url()).not.toContain(submittedSecret);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
  await captureEvidence(page, {
    path: resolve(evidence, 'private-browser-tv-pairing-1080.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Sign in to open Hearth' })).toBeVisible();
  const pairButton = page.getByRole('button', { name: 'Pair this screen as a television' });
  await pairButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Connect this screen' })).toBeVisible();
});
