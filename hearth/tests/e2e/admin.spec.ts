import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext } from '@playwright/test';

import { captureEvidence } from './visualEvidence';

const evidence = resolve('docs/evidence/phase-2/screenshots');
const peopleEvidence = resolve('docs/evidence/admin-people');
const calendarEvidence = resolve('docs/evidence/calendar-connection');
const homeAssistantEvidence = resolve('docs/evidence/home-assistant-connection');
const systemEvidence = resolve('docs/evidence/system-health');
const activityEvidence = resolve('docs/evidence/system-activity');
const accessEvidence = resolve('docs/evidence/adult-access');

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  await mkdir(peopleEvidence, { recursive: true });
  await mkdir(calendarEvidence, { recursive: true });
  await mkdir(homeAssistantEvidence, { recursive: true });
  await mkdir(systemEvidence, { recursive: true });
  await mkdir(activityEvidence, { recursive: true });
  await mkdir(accessEvidence, { recursive: true });
});

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
});

test('phone More opens setup and household/member changes survive reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/today');
  await page.getByRole('link', { name: 'More', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'More' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Lists/ })).toBeVisible();
  await page.getByRole('link', { name: /Household & people/ }).click();
  await expect(page.getByRole('heading', { name: 'Hearth settings' })).toBeVisible();
  await expect(page.locator('.admin-actor')).toContainText('Administrator');

  await page.getByRole('link', { name: /Household/ }).click();
  await page.getByLabel('Household name').fill('Rowan household');
  await page.getByRole('button', { name: 'Save household' }).click();
  await expect(page.getByRole('status')).toContainText('Household saved');
  await page.reload();
  await expect(page.getByLabel('Household name')).toHaveValue('Rowan household');

  await page.getByRole('link', { name: 'Back to Hearth settings' }).click();
  await page.getByRole('link', { name: /People/ }).click();
  const add = page.locator('.admin-form--add-member');
  await expect(add.getByRole('radio')).toHaveCount(12);
  await add.getByLabel('Display name').fill('Alex');
  await add.getByRole('radio', { name: 'Berry' }).check();
  await add.getByRole('button', { name: 'Add person' }).click();
  const alex = page.locator('.member-editor').filter({ hasText: 'Alex' });
  await expect(alex).toBeVisible();
  await expect(alex.getByRole('radio', { name: 'Berry' })).toBeChecked();
  await page.reload();
  const reloadedAlex = page.locator('.member-editor').filter({ hasText: 'Alex' });
  await expect(reloadedAlex).toBeVisible();
  await expect(reloadedAlex.getByRole('radio', { name: 'Berry' })).toBeChecked();
});

test('Hearth settings groups household tasks and keeps remote movement continuous', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin');
  await expect(page.locator('.admin-setting-group > h2')).toHaveText([
    'Household',
    'Family setup',
    'Connections',
    'Displays',
    'System',
  ]);
  await expect(page.locator('[data-focus-id="admin-household"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focus-id="admin-people"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focus-id="admin-adult"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focus-id="admin-today"]')).toBeFocused();
});

test('Adult access explains private passkeys and recovery without exposing demo controls', async ({
  page,
}) => {
  const consoleProblems: string[] = [];
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) consoleProblems.push(message.text());
  });
  page.on('pageerror', (error) => consoleProblems.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/access');

  await expect(page).toHaveURL(/\/admin\/access$/);
  await expect(page.getByRole('heading', { name: 'Adult access' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No shared admin password' })).toBeVisible();
  await expect(page.getByText(/real passkeys and recovery codes are available only/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add passkey' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Create recovery code' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Maya' })).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(consoleProblems).toEqual([]);
});

test('Connections contains only services used directly by Hearth', async ({ page }) => {
  const consoleProblems: string[] = [];
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) consoleProblems.push(message.text());
  });
  page.on('pageerror', (error) => consoleProblems.push(error.message));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin');
  await page.getByRole('link', { name: /Connections/ }).click();

  await expect(page).toHaveURL(/\/admin\/connections$/);
  await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(page.locator('[data-focus-id="connection-calendar"]')).toBeVisible();
  await expect(page.getByText('Home Assistant', { exact: true })).toBeVisible();
  await expect(page.getByText('Jellyfin', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Music Assistant', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Private services Hearth reads from')).toBeVisible();
  expect(consoleProblems).toEqual([]);
});

test('adult can test, select, map, save and remove a read-only calendar connection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/connections');
  await page.locator('[data-focus-id="connection-calendar"]').click();
  await expect(page).toHaveURL(/\/admin\/connections\/calendar$/);
  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible();

  await page.getByLabel('Apple ID or account name').fill('fictional@example.com');
  await page.getByLabel('App-specific password').fill('fictional-app-password');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connection works')).toBeVisible();
  await expect(page.getByLabel('App-specific password')).toHaveCount(0);
  await expect(page.getByLabel('Person for Ezra')).toHaveValue('member_ezra');
  await page.getByRole('checkbox', { name: 'Maya' }).uncheck();
  await page.getByRole('button', { name: 'Save 2 calendars' }).click();

  await expect(page.getByText('Family calendars')).toBeVisible();
  await expect(page.getByText('caldav.icloud.com · f•••@example.com')).toBeVisible();
  await expect(page.getByText('2 calendars connected · Read-only')).toBeVisible();
  await captureEvidence(page, {
    path: resolve(calendarEvidence, 'calendar-connected-phone-portrait.png'),
    animations: 'disabled',
  });
  await page.reload();
  await expect(page.getByText('Family calendars')).toBeVisible();
  await page.getByRole('button', { name: 'Remove connection' }).click();
  await page.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(page.getByRole('button', { name: 'Test connection' })).toBeVisible();
});

test('calendar setup exposes a family-safe sign-in error and supports keyboard Back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/connections');
  await page.locator('[data-focus-id="connection-calendar"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-focus-id="calendar-server-url"]')).toBeFocused();
  await page.getByLabel('Apple ID or account name').fill('fictional@example.com');
  await page.getByLabel('App-specific password').fill('wrong-password');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByRole('alert')).toContainText('Calendar sign-in was not accepted');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/admin\/connections$/);
  await expect(page.locator('[data-focus-id="connection-calendar"]')).toBeFocused();
});

test('adult can test, map, save and remove a tightly scoped Home Assistant connection', async ({
  page,
}) => {
  const consoleProblems: string[] = [];
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) consoleProblems.push(message.text());
  });
  page.on('pageerror', (error) => consoleProblems.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/connections');
  await page.locator('[data-focus-id="connection-home-assistant"]').click();
  await expect(page).toHaveURL(/\/admin\/connections\/home-assistant$/);
  await expect(page.getByRole('heading', { name: 'Home Assistant' })).toBeVisible();
  await expect(page.getByText('Strictly limited')).toBeVisible();

  const token = 'private-home-assistant-token';
  await page.getByLabel('Long-lived access token').fill(token);
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connection works')).toBeVisible();
  await expect(page.getByLabel('Long-lived access token')).toHaveCount(0);
  await expect(page.getByRole('combobox')).toHaveCount(7);
  await expect(page.getByLabel('Evening', { exact: true })).toContainText('Evening · Script');
  await expect(page.getByLabel('Goodnight', { exact: true })).toContainText('Goodnight · Script');
  await expect(page.getByLabel('Screen off', { exact: true })).toContainText('Screen off · Script');
  await captureEvidence(page, {
    path: resolve(homeAssistantEvidence, 'home-assistant-mapping-phone-portrait.png'),
    animations: 'disabled',
  });
  const mappingA11y = await new AxeBuilder({ page }).analyze();
  expect(
    mappingA11y.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);

  await page.getByLabel('Connection name').fill('Living room');
  const saveConnection = page.getByRole('button', { name: 'Save connection' });
  await saveConnection.scrollIntoViewIfNeeded();
  await captureEvidence(page, {
    path: resolve(homeAssistantEvidence, 'home-assistant-mapping-actions-phone-portrait.png'),
    animations: 'disabled',
  });
  await saveConnection.click();
  await expect(page.getByRole('heading', { name: 'Living room' })).toBeVisible();
  await expect(page.getByText('4 safety states · 3 approved actions')).toBeVisible();
  await expect(page.getByText('Protected playback active')).toBeVisible();
  await expect(
    page.getByText('homeassistant.local · Last checked 3 Aug 2026, 7:42 am'),
  ).toBeVisible();
  await expect(page.getByText(token)).toHaveCount(0);
  await captureEvidence(page, {
    path: resolve(homeAssistantEvidence, 'home-assistant-connected-phone-portrait.png'),
    animations: 'disabled',
  });
  const removeConnection = page.getByRole('button', { name: 'Remove connection' });
  await removeConnection.scrollIntoViewIfNeeded();
  await captureEvidence(page, {
    path: resolve(homeAssistantEvidence, 'home-assistant-connected-actions-phone-portrait.png'),
    animations: 'disabled',
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Living room' })).toBeVisible();
  await page.getByRole('button', { name: 'Replace connection' }).click();
  await page.getByLabel('Long-lived access token').fill('replacement-token-that-must-be-forgotten');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Replace connection' }).click();
  await expect(page.getByLabel('Long-lived access token')).toHaveValue('');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Remove connection' }).click();
  await page.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(page.getByRole('button', { name: 'Test connection' })).toBeVisible();
  expect(consoleProblems).toEqual([]);
});

test('Home Assistant setup has family-safe authentication errors and keyboard Back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/connections');
  await page.locator('[data-focus-id="connection-home-assistant"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-focus-id="home-assistant-server-url"]')).toBeFocused();
  await page.getByLabel('Long-lived access token').fill('wrong-home-assistant-token');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Home Assistant did not accept that access token',
  );
  await expect(page.getByRole('alert')).not.toContainText('wrong-home-assistant-token');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/admin\/connections$/);
  await expect(page.locator('[data-focus-id="connection-home-assistant"]')).toBeFocused();
});

test('Home controls are not presented as an administration setting', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin');

  await expect(page.getByRole('link', { name: /Living room/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Household/ })).toBeVisible();

  await page.goto('/home');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByLabel('Living room status')).toBeVisible();
});

test('adult sees calm system health and creates a checked recovery copy', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/more');
  await expect(page.getByRole('heading', { name: 'System' })).toBeVisible();
  await page.getByRole('link', { name: /System health/ }).click();
  await expect(page.getByRole('heading', { name: 'System health' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hearth is protected' })).toBeVisible();
  await expect(page.getByText('Migration 20 · checked 3 Aug 2026, 7:42 am')).toBeVisible();
  await expect(page.getByText(/Last backup 3 Aug 2026, 1:00 pm · 2.5 MB/)).toBeVisible();
  await expect(
    page.getByText('Provider tokens stay in the separate protected secrets folder.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Connections and photos' })).toBeVisible();
  const calendar = page.locator('.system-connection-row').filter({ hasText: 'Calendar' });
  await expect(calendar).toContainText('Not set up');
  const homeAssistant = page
    .locator('.system-connection-row')
    .filter({ hasText: 'Home Assistant' });
  await expect(homeAssistant).toContainText('Not set up');
  const photos = page.locator('.system-connection-row').filter({ hasText: 'Family photos' });
  await expect(photos).toContainText('Ready');
  const create = page.getByRole('button', { name: 'Create backup now' });
  await create.scrollIntoViewIfNeeded();
  await create.click();
  await expect(page.getByRole('status')).toContainText('Recovery copy created and checked');
  await expect(page.getByText(/Last backup 3 Aug 2026, 7:42 am · 2.5 MB/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Last backup 3 Aug 2026, 7:42 am · 2.5 MB/)).toBeVisible();
});

test('adult reviews family-readable activity and filters it without technical identifiers', async ({
  page,
  request,
}) => {
  await seedRecentActivity(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/system');
  const activity = page.locator('[data-focus-id="system-activity"]');
  await activity.scrollIntoViewIfNeeded();
  await activity.focus();
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/admin\/activity$/);
  await expect(page.getByRole('heading', { name: 'Recent activity' })).toBeVisible();
  await expect(page.getByText('Recovery copy created')).toBeVisible();
  await expect(page.getByText('Household details updated')).toBeVisible();
  await expect(page.getByText('Chore marked done')).toBeVisible();
  expect((await page.locator('.activity-row').allTextContents()).join(' ')).not.toMatch(
    /audit_|request_|occurrence_/,
  );

  const allFilter = page.getByRole('button', { name: 'All' });
  await expect(allFilter).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const familyFilter = page.getByRole('button', { name: 'Family' });
  await expect(familyFilter).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(familyFilter).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Household details updated')).toBeVisible();
  await expect(page.getByText('Chore marked done')).toHaveCount(0);
  await expect(page.getByText('Recovery copy created')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/admin\/system$/);
  await expect(activity).toBeFocused();
});

test('recent activity explains empty and unavailable states', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/activity');
  await expect(page.getByText('No changes recorded yet')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nothing has changed yet' })).toBeVisible();

  await page.route('**/activity?limit=50', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'INTEGRATION_UNAVAILABLE',
          message: 'Recent activity is temporarily unavailable. Try again shortly.',
          retryable: true,
          requestId: null,
        },
      }),
    });
  });
  await page.reload();
  await expect(page.getByRole('alert')).toHaveText(
    'Recent activity is temporarily unavailable. Try again shortly.',
  );
});

test('system backup retry keeps the same command identity after a lost response', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requestIds: string[] = [];
  let attempt = 0;
  await page.route('**/system-backups', async (route) => {
    const body = route.request().postDataJSON() as { requestId: string };
    requestIds.push(body.requestId);
    attempt += 1;
    if (attempt === 1) {
      await route.fetch();
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  await page.goto('/admin/system');
  const create = page.getByRole('button', { name: 'Create backup now' });
  await create.scrollIntoViewIfNeeded();
  await create.click();
  await expect(page.getByRole('alert')).toContainText('Hearth could not confirm the recovery copy');
  const retry = page.getByRole('button', { name: 'Try again' });
  await expect(retry).toBeFocused();
  await retry.press('Enter');
  await expect(page.getByRole('status')).toContainText('Recovery copy created and checked');
  expect(requestIds).toHaveLength(2);
  expect(requestIds[1]).toBe(requestIds[0]);
});

test('one unavailable connection does not hide the remaining system status', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/calendar-connection', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'INTEGRATION_UNAVAILABLE',
          message: 'Calendar setup could not be checked just now.',
          retryable: true,
          requestId: null,
        },
      }),
    });
  });

  await page.goto('/admin/system');
  const calendar = page.locator('.system-connection-row').filter({ hasText: 'Calendar' });
  await expect(calendar).toContainText('Unavailable');
  await expect(calendar).toContainText('Hearth could not read calendar setup just now.');
  await expect(
    page.locator('.system-connection-row').filter({ hasText: 'Home Assistant' }),
  ).toContainText('Not set up');
  await expect(
    page.locator('.system-connection-row').filter({ hasText: 'Family photos' }),
  ).toContainText('Ready');
  await expect(page.getByRole('heading', { name: 'Hearth is protected' })).toBeVisible();
});

test('system connections have deterministic D-pad movement and Back restoration', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/system');
  await expect(page.locator('[data-focus-id="system-create-backup"]')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-focus-id="system-activity"]')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-focus-id="system-photo-health"]')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-focus-id="system-home-assistant-health"]')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  const calendar = page.locator('[data-focus-id="system-calendar-health"]');
  await expect(calendar).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/connections\/calendar$/);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/admin\/system$/);
  await expect(calendar).toBeFocused();
});

test('People palette supports native keyboard selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/people');

  const ezra = page.locator('.member-editor').filter({ hasText: 'Ezra' });
  const sky = ezra.getByRole('radio', { name: 'Sky' });
  await sky.focus();
  await page.keyboard.press('ArrowRight');

  await expect(ezra.getByRole('radio', { name: 'Ocean' })).toBeFocused();
  await expect(ezra.getByRole('radio', { name: 'Ocean' })).toBeChecked();
});

test('People can crop, persist, replace and restore a local profile photo', async ({ page }) => {
  test.setTimeout(60_000);
  const consoleProblems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleProblems.push(message.text());
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/people');
  await expect(page).toHaveTitle(/Hearth/);
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
  const ezra = page.locator('.member-editor').filter({ hasText: 'Ezra' });
  const originalAvatar = await ezra.locator('.avatar').getAttribute('src');

  await ezra
    .getByLabel('Choose profile photo for Ezra')
    .setInputFiles(resolve('apps/web/public/demo/photos/garden-morning.webp'));
  const dialog = page.getByRole('dialog', { name: "Position Ezra's photo" });
  await expect(dialog).toBeVisible();
  const crop = dialog.getByRole('button', { name: /Photo crop for Ezra/ });
  await expect(crop).toBeVisible();
  await expect(dialog.locator('input[type="range"]')).toHaveCount(0);
  await expect(dialog.getByText(/Pinch to zoom/)).toBeVisible();

  await crop.focus();
  await page.keyboard.press('+');
  await expect(crop).toHaveAttribute('aria-label', /Zoom 110 percent/);
  await page.keyboard.press('Home');
  await expect(crop).toHaveAttribute('aria-label', /Zoom 100 percent/);

  const cropBounds = await crop.boundingBox();
  expect(cropBounds).not.toBeNull();
  if (cropBounds === null) throw new Error('Crop surface was not rendered.');
  await page.mouse.move(cropBounds.x + cropBounds.width / 2, cropBounds.y + cropBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    cropBounds.x + cropBounds.width / 2,
    cropBounds.y + cropBounds.height / 2 + 40,
  );
  await page.mouse.up();
  expect(await crop.getAttribute('aria-label')).not.toContain('Vertical position 50 percent');
  await crop.focus();
  await page.keyboard.press('Home');
  await expect(crop).toHaveAttribute('aria-label', /Horizontal position 50 percent/);

  await crop.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const centreX = rect.left + rect.width / 2;
    const centreY = rect.top + rect.height / 2;
    const fire = (type: string, pointerId: number, clientX: number, clientY: number) => {
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          buttons: type === 'pointerup' ? 0 : 1,
          clientX,
          clientY,
          isPrimary: pointerId === 1,
          pointerId,
          pointerType: 'touch',
        }),
      );
    };
    fire('pointerdown', 1, centreX - 30, centreY);
    fire('pointerdown', 2, centreX + 30, centreY);
    fire('pointermove', 1, centreX - 50, centreY - 8);
    fire('pointermove', 2, centreX + 50, centreY + 8);
    fire('pointerup', 1, centreX - 50, centreY - 8);
    fire('pointerup', 2, centreX + 50, centreY + 8);
  });
  await expect(crop).toHaveAttribute('aria-label', /Zoom 1[6-7]\d percent/);
  await captureEvidence(page, { path: '/tmp/hearth-profile-photo-touch-crop-phone.png' });
  await page.setViewportSize({ width: 844, height: 390 });
  await captureEvidence(page, { path: '/tmp/hearth-profile-photo-touch-crop-phone-landscape.png' });
  await dialog.getByRole('button', { name: 'Use this photo' }).click();

  await expect(dialog).toBeHidden();
  await expect(ezra.locator('.avatar')).toHaveAttribute('src', /\/member_ezra\/avatar\?v=/);
  const customAvatar = await ezra.locator('.avatar').getAttribute('src');
  expect(customAvatar).not.toBe(originalAvatar);
  await captureEvidence(page, { path: '/tmp/hearth-profile-photo-saved-phone.png' });
  await page.reload();
  const reloadedEzra = page.locator('.member-editor').filter({ hasText: 'Ezra' });
  await expect(reloadedEzra.locator('.avatar')).toHaveAttribute('src', customAvatar ?? '');
  await expect(reloadedEzra.getByText('Replace photo')).toBeVisible();

  await reloadedEzra.getByRole('button', { name: 'Restore original' }).click();
  await expect(reloadedEzra.locator('.avatar')).toHaveAttribute('src', '/demo/ezra.png');
  await expect(reloadedEzra.getByText('Change photo')).toBeVisible();
  expect(consoleProblems).toEqual([]);
});

test('television code is approved on the companion and can be revoked', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/pair');
  await expect(page.getByRole('heading', { name: 'Connect this television' })).toBeVisible();
  const code = (await page.locator('.pairing-code').innerText()).replaceAll(/\s/g, '');
  expect(code).toHaveLength(6);

  const approval = await request.post(
    'http://127.0.0.1:4310/api/v1/households/household_hearth_demo/pairing-approvals',
    {
      headers: { 'x-hearth-demo-actor': 'member_maya' },
      data: { requestId: 'request_e2e_pair_approve', code },
    },
  );
  expect(approval.ok()).toBe(true);
  await expect(page.getByRole('heading', { name: 'Television connected' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/televisions');
  const newDevice = page.locator('.device-row').filter({ hasText: 'Living room TV' }).last();
  await expect(newDevice).toContainText('Connected');
  await newDevice.getByRole('button', { name: 'Revoke' }).click();
  await expect(newDevice).toContainText('Revoked');
});

test('television pairing has deterministic initial focus and Back behaviour', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');
  await page.goto('/pair');
  await expect(page.locator('[data-focus-id="pair-new-code"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
});

for (const path of [
  '/admin',
  '/admin/household',
  '/admin/people',
  '/admin/access',
  '/admin/today',
  '/admin/televisions',
  '/admin/connections',
  '/admin/connections/calendar',
  '/admin/connections/home-assistant',
  '/admin/system',
  '/admin/activity',
]) {
  test(`@a11y ${path} has no serious accessibility violations`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
  });
}

for (const viewport of [
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
] as const) {
  test(`@visual Adult access at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/admin/access');
    await expect(page.getByRole('heading', { name: 'Adult access' })).toBeVisible();
    await captureEvidence(page, {
      path: resolve(accessEvidence, `adult-access-${viewport.name}.png`),
      animations: 'disabled',
    });
    await page.getByRole('heading', { name: 'Your recovery code' }).scrollIntoViewIfNeeded();
    await captureEvidence(page, {
      path: resolve(accessEvidence, `adult-access-recovery-${viewport.name}.png`),
      animations: 'disabled',
    });
  });
}

for (const viewport of [
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
] as const) {
  test(`@visual System health at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/admin/system');
    await expect(page.getByRole('heading', { name: 'System health' })).toBeVisible();
    await captureEvidence(page, {
      path: resolve(systemEvidence, `system-health-${viewport.name}.png`),
      animations: 'disabled',
    });
  });
}

test('@visual System health recovery action at phone portrait', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/system');
  const create = page.getByRole('button', { name: 'Create backup now' });
  await create.scrollIntoViewIfNeeded();
  await captureEvidence(page, {
    path: resolve(systemEvidence, 'system-health-actions-phone-portrait.png'),
    animations: 'disabled',
  });
});

test('@visual @a11y dark System health at phone portrait', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem(
      'hearth.appearance.v1',
      JSON.stringify({ theme: 'dark', eveningDimming: false }),
    );
  });
  await page.goto('/admin/system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
  await captureEvidence(page, {
    path: resolve(systemEvidence, 'system-health-dark-phone-portrait.png'),
    animations: 'disabled',
  });
});

for (const viewport of [
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
] as const) {
  test(`@visual Recent activity at ${viewport.name}`, async ({ page, request }) => {
    await seedRecentActivity(request);
    await page.setViewportSize(viewport);
    await page.goto('/admin/activity');
    await expect(page.getByRole('heading', { name: 'Recent activity' })).toBeVisible();
    await captureEvidence(page, {
      path: resolve(activityEvidence, `recent-activity-${viewport.name}.png`),
      animations: 'disabled',
    });
    if (viewport.name === 'phone-landscape') {
      await page.locator('.activity-row').last().scrollIntoViewIfNeeded();
      await captureEvidence(page, {
        path: resolve(activityEvidence, 'recent-activity-phone-landscape-rows.png'),
        animations: 'disabled',
      });
    }
  });
}

test('@visual @a11y dark Recent activity at phone portrait', async ({ page, request }) => {
  await seedRecentActivity(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/v1/households/*/activity*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      'hearth.appearance.v1',
      JSON.stringify({ theme: 'dark', eveningDimming: false }),
    );
  });
  await page.goto('/admin/activity');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.admin-feedback')).toBeVisible();
  const loadingResults = await new AxeBuilder({ page }).analyze();
  expect(
    loadingResults.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Recent activity' })).toBeVisible();
  await expect(page.locator('.activity-row').first()).toBeVisible();
  await expect(page.locator('.admin-feedback')).toHaveCount(0);
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
  await captureEvidence(page, {
    path: resolve(activityEvidence, 'recent-activity-dark-phone-portrait.png'),
    animations: 'disabled',
  });
});

async function seedRecentActivity(request: APIRequestContext): Promise<void> {
  const base = 'http://127.0.0.1:4310/api/v1/households/household_hearth_demo';
  const headers = { 'X-Hearth-Demo-Actor': 'member_maya' };
  const household = await request.patch(`${base}/settings`, {
    headers,
    data: {
      requestId: 'request_activity_household_e2e',
      name: 'Hearth Demo Home',
      timezone: 'Australia/Perth',
    },
  });
  const chore = await request.post(`${base}/chore-occurrences/occurrence_school_bag/completions`, {
    data: { requestId: 'request_activity_chore_e2e' },
  });
  const backup = await request.post(`${base}/system-backups`, {
    headers,
    data: { requestId: 'request_activity_backup_e2e' },
  });
  expect(household.ok()).toBe(true);
  expect(chore.ok()).toBe(true);
  expect(backup.ok()).toBe(true);
}

for (const viewport of [
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
] as const) {
  test(`@visual calendar setup at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/admin/connections/calendar');
    await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible();
    await captureEvidence(page, {
      path: resolve(calendarEvidence, `calendar-setup-${viewport.name}.png`),
      animations: 'disabled',
      fullPage: true,
    });
  });
}

test('@visual calendar selection at phone portrait', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/connections/calendar');
  await page.getByLabel('Apple ID or account name').fill('fictional@example.com');
  await page.getByLabel('App-specific password').fill('fictional-app-password');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await expect(page.getByText('Connection works')).toBeVisible();
  await captureEvidence(page, {
    path: resolve(calendarEvidence, 'calendar-selection-phone-portrait.png'),
    animations: 'disabled',
    fullPage: true,
  });
});

for (const viewport of [
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
] as const) {
  test(`@visual Home Assistant setup at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/admin/connections/home-assistant');
    await expect(page.getByRole('heading', { name: 'Home Assistant' })).toBeVisible();
    await captureEvidence(page, {
      path: resolve(homeAssistantEvidence, `home-assistant-setup-${viewport.name}.png`),
      animations: 'disabled',
    });
  });
}

test('@a11y television pairing has no serious accessibility violations', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/pair');
  await expect(page.locator('h1')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
});

for (const viewport of [
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
] as const) {
  test(`@visual admin home at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Hearth settings' })).toBeVisible();
    await captureEvidence(page, {
      path: resolve(evidence, `admin-${viewport.name}.png`),
      animations: 'disabled',
    });
  });
}

test('@visual television pairing at 1080p', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/pair');
  await expect(page.locator('.pairing-code')).toBeVisible();
  await captureEvidence(page, {
    path: resolve(evidence, 'pairing-tv-1080.png'),
    animations: 'disabled',
  });
});

for (const viewport of [
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
] as const) {
  test(`@visual People colour palette at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/admin/people');
    await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
    await expect(page.locator('.member-editor').first().getByRole('radio')).toHaveCount(12);
    await captureEvidence(page, {
      path: resolve(peopleEvidence, `people-colour-picker-${viewport.name}.png`),
      animations: 'disabled',
      fullPage: true,
    });
  });
}
