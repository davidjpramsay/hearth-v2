import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const evidence = resolve('docs/evidence/phase-2/screenshots');
const peopleEvidence = resolve('docs/evidence/admin-people');

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  await mkdir(peopleEvidence, { recursive: true });
});

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
});

test('phone More opens setup and household/member changes survive reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/today');
  await page.getByRole('link', { name: 'More' }).click();
  await expect(page.getByRole('heading', { name: 'Home settings' })).toBeVisible();
  await expect(page.getByText('Maya')).toBeVisible();

  await page.getByRole('link', { name: /Household/ }).click();
  await page.getByLabel('Household name').fill('Rowan household');
  await page.getByRole('button', { name: 'Save household' }).click();
  await expect(page.getByRole('status')).toContainText('Household saved');
  await page.reload();
  await expect(page.getByLabel('Household name')).toHaveValue('Rowan household');

  await page.getByRole('link', { name: 'Back to Home settings' }).click();
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
  await expect(page.getByText('Calendar', { exact: true })).toBeVisible();
  await expect(page.getByText('Home Assistant', { exact: true })).toBeVisible();
  await expect(page.getByText('Jellyfin', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Music Assistant', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Services Hearth uses directly')).toBeVisible();
  expect(consoleProblems).toEqual([]);
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
  '/admin/televisions',
  '/admin/connections',
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
    await expect(page.getByRole('heading', { name: 'Home settings' })).toBeVisible();
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
