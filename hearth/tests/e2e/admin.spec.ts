import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const evidence = resolve('docs/evidence/phase-2/screenshots');
const peopleEvidence = resolve('docs/evidence/admin-people');
const calendarEvidence = resolve('docs/evidence/calendar-connection');

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  await mkdir(peopleEvidence, { recursive: true });
  await mkdir(calendarEvidence, { recursive: true });
});

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
});

test('phone More opens setup and household/member changes survive reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/today');
  await page.getByRole('link', { name: 'More' }).click();
  await expect(page.getByRole('heading', { name: 'More' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Lists/ })).toBeVisible();
  await page.getByRole('link', { name: /Household & people/ }).click();
  await expect(page.getByRole('heading', { name: 'Hearth settings' })).toBeVisible();
  await expect(page.getByText('Maya')).toBeVisible();

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
  await page.screenshot({
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

test('Home controls are not presented as an administration setting', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin');

  await expect(page.getByRole('link', { name: /Living room/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Household/ })).toBeVisible();

  await page.goto('/home');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByLabel('Living room status')).toBeVisible();
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
  await page.screenshot({ path: '/tmp/hearth-profile-photo-touch-crop-phone.png' });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.screenshot({ path: '/tmp/hearth-profile-photo-touch-crop-phone-landscape.png' });
  await dialog.getByRole('button', { name: 'Use this photo' }).click();

  await expect(dialog).toBeHidden();
  await expect(ezra.locator('.avatar')).toHaveAttribute('src', /\/member_ezra\/avatar\?v=/);
  const customAvatar = await ezra.locator('.avatar').getAttribute('src');
  expect(customAvatar).not.toBe(originalAvatar);
  await page.screenshot({ path: '/tmp/hearth-profile-photo-saved-phone.png' });
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
  '/admin/today',
  '/admin/televisions',
  '/admin/connections',
  '/admin/connections/calendar',
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
  test(`@visual calendar setup at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/admin/connections/calendar');
    await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible();
    await page.screenshot({
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
  await page.screenshot({
    path: resolve(calendarEvidence, 'calendar-selection-phone-portrait.png'),
    animations: 'disabled',
    fullPage: true,
  });
});

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
    await page.screenshot({
      path: resolve(evidence, `admin-${viewport.name}.png`),
      animations: 'disabled',
    });
  });
}

test('@visual television pairing at 1080p', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/pair');
  await expect(page.locator('.pairing-code')).toBeVisible();
  await page.screenshot({
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
    await page.screenshot({
      path: resolve(peopleEvidence, `people-colour-picker-${viewport.name}.png`),
      animations: 'disabled',
      fullPage: true,
    });
  });
}
