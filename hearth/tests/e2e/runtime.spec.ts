import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

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
