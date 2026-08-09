import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const evidence = resolve('docs/evidence/phase-4/screenshots');

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
});

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
});

test('remote-only Lists check, undo, Meals navigation and Back restoration', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/lists');
  const milk = page.locator('[data-focus-id="list-item-list_item_milk"]');
  await expect(milk).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(milk).toContainText('Checked · Undo');
  await expect(milk).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(milk).toContainText('Check item');
  await expect(milk).toBeFocused();

  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-focus-id="list-choice-list_groceries"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-focus-id="nav-lists"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Meals' })).toBeVisible();
  await expect(page.locator('[data-focus-id="meal-day-2026-08-03"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Lists' })).toBeVisible();
  await expect(page.locator('[data-focus-id="nav-meals"]')).toBeFocused();
});

test('phone adds a list item and edits a dinner through the typed API', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lists');
  await page.getByPlaceholder('Add an item').fill('Oranges');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check Oranges' })).toBeVisible();

  await page.goto('/meals');
  await page.locator('[data-focus-id="meal-day-2026-08-04"]').click();
  const editor = page.locator('.phone-meal-editor');
  await editor.getByLabel('Dinner').fill('Vegetable curry');
  await editor.getByLabel('Note').fill('Rice at 5:30');
  await editor.getByRole('button', { name: 'Save dinner' }).click();
  await expect(editor.getByRole('status')).toContainText('Dinner saved');
  await page.reload();
  await page.locator('[data-focus-id="meal-day-2026-08-04"]').click();
  await expect(editor.getByLabel('Dinner')).toHaveValue('Vegetable curry');
});

test('phone Family Planning edits future routines and manages weekly pocket money', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin');
  await page.getByRole('link', { name: /Family planning/ }).click();
  await expect(page.getByRole('heading', { name: 'Family planning' })).toBeVisible();
  await page.getByRole('link', { name: /Routines and chores/ }).click();
  const schoolBag = page.locator('.routine-editor').filter({ hasText: 'Pack school bag' });
  await schoolBag.getByLabel('Routine').fill('School morning');
  await schoolBag.getByRole('button', { name: 'Save future routine' }).click();
  await expect(page.getByRole('status')).toContainText('updated from today forward');
  await page.reload();
  await expect(schoolBag.getByLabel('Routine')).toHaveValue('School morning');

  await page.goto('/admin/pocket-money');
  await page.getByLabel('Weekly pocket money').fill('15.00');
  await page.getByLabel('Payday').selectOption('friday');
  await page.getByRole('button', { name: 'Save weekly settings' }).click();
  await expect(page.getByRole('status')).toContainText('weekly amount is saved');
  await page.reload();
  await expect(page.getByLabel('Weekly pocket money')).toHaveValue('15.00');

  await page.goto('/chores');
  await page.locator('[data-focus-id="chore-primary"]').click();
  await expect(page.getByText('33% this week')).toBeVisible();
  await expect(page.getByText('$5.00 of $15.00')).toBeVisible();

  await page.goto('/admin/pocket-money');
  await page.getByLabel('Payment amount').fill('2.00');
  await page.getByLabel(/Note optional/).fill('Cash');
  await page.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByRole('status')).toContainText('$2.00 recorded');
  await expect(page.getByText('$3.00 still to pay')).toBeVisible();
  const history = page.getByRole('region', { name: 'Payment history' });
  await expect(history.getByText('Cash')).toBeVisible();
  await expect(history.getByText('$2.00')).toBeVisible();

  await page.getByLabel('Payment amount').fill('3.00');
  await page.getByRole('button', { name: 'Record payment' }).click();
  await expect(
    page.locator('.pocket-money-admin-card').getByText('Paid in full').first(),
  ).toBeVisible();

  const remainderPayment = history.locator('article').filter({ hasText: '$3.00' });
  await remainderPayment.getByRole('button', { name: 'Correct' }).click();
  await remainderPayment.getByLabel('Correction reason').fill('Recorded from wrong account');
  await remainderPayment.getByRole('button', { name: 'Void payment' }).click();
  await expect(history.getByText('Voided · Recorded from wrong account')).toBeVisible();
  await expect(page.getByText('$3.00 still to pay')).toBeVisible();

  await page.getByRole('button', { name: 'Previous' }).click();
  await expect(page).toHaveURL(/week=2026-07-27/);
  await expect(page.getByText('Reviewing 27–2 Aug')).toBeVisible();
  await expect(page.getByText('Return to This week to change these settings.')).toBeVisible();
  await expect(page.getByLabel('Weekly pocket money')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'This week' })).toBeEnabled();
  await page.getByRole('button', { name: 'This week' }).click();
  await expect(page).not.toHaveURL(/week=/);
  await expect(page.getByLabel('Weekly pocket money')).toBeVisible();
});

test('pocket-money setup names every child missing a weekly amount', async ({ page, request }) => {
  const response = await request.post(
    'http://127.0.0.1:4310/api/v1/households/household_hearth_demo/members',
    {
      headers: { 'x-hearth-demo-actor': 'member_maya' },
      data: {
        requestId: 'request_unconfigured_pocket_child',
        displayName: 'Alex',
        role: 'child',
        color: '#7a5b8f',
        administrator: false,
      },
    },
  );
  expect(response.ok()).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/pocket-money');
  await expect(page.getByRole('alert')).toContainText('Set pocket money and payday for Alex.');
  await expect(page.getByText('Nothing due yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record payment' })).toHaveCount(0);
});

test('the former Rewards bookmark redirects without exposing the star system', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/rewards');
  await expect(page).toHaveURL(/\/admin\/pocket-money$/);
  await expect(page.getByRole('heading', { name: 'Pocket money' })).toBeVisible();
  await expect(page.getByText('Available stars')).toHaveCount(0);
  await expect(page.getByText('Family choices')).toHaveCount(0);
});

test('list failure restores the item and retries with focus preserved', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/lists?scenario=fail-next');
  const milk = page.locator('[data-focus-id="list-item-list_item_milk"]');
  await expect(milk).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('That change did not save');
  await expect(milk).toContainText('Check item');
  await expect(milk).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(milk).toContainText('Checked · Undo');
  await expect(milk).toBeFocused();
});

test('a permission rejection remains family-readable and leaves the list unchanged', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/lists?scenario=permission');
  const milk = page.locator('[data-focus-id="list-item-list_item_milk"]');
  await milk.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Ask an adult');
  await expect(milk).toContainText('Check item');
  await expect(milk).toBeFocused();
});

test('cached lists stay visible through a real browser offline event', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/lists');
  await expect(page.getByText('Milk')).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByRole('status')).toContainText('Saved lists remain available');
  await expect(page.getByText('Milk')).toBeVisible();
  await context.setOffline(false);
});

for (const path of [
  '/lists',
  '/meals',
  '/admin/planning',
  '/admin/routines',
  '/admin/pocket-money',
]) {
  test(`@a11y ${path} has no serious accessibility violations`, async ({ page }) => {
    await page.setViewportSize({
      width: path.startsWith('/admin') ? 390 : 1920,
      height: path.startsWith('/admin') ? 844 : 1080,
    });
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

test('@a11y partial-payment history and correction form have no serious violations', async ({
  page,
  request,
}) => {
  const completion = await request.post(
    'http://127.0.0.1:4310/api/v1/households/household_hearth_demo/chore-occurrences/occurrence_school_bag/completions',
    { data: { requestId: 'request_a11y_pocket_completion' } },
  );
  expect(completion.ok()).toBe(true);
  const payment = await request.post(
    'http://127.0.0.1:4310/api/v1/households/household_hearth_demo/pocket-money-payments',
    {
      headers: { 'x-hearth-demo-actor': 'member_maya' },
      data: {
        requestId: 'request_a11y_pocket_payment',
        memberId: 'member_ezra',
        weekStart: '2026-08-03',
        asOfDate: '2026-08-03',
        amountCents: 150,
        note: 'Cash',
      },
    },
  );
  expect(payment.ok()).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/pocket-money');
  await page
    .getByRole('region', { name: 'Payment history' })
    .getByRole('button', { name: 'Correct' })
    .click();
  await expect(page.getByLabel('Correction reason')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
});

const planningViewports = [
  { name: 'tv-4k', width: 3840, height: 2160 },
  { name: 'tv-1080', width: 1920, height: 1080 },
  { name: 'tv-1366', width: 1366, height: 768 },
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
] as const;

for (const viewport of planningViewports) {
  for (const route of ['lists', 'meals'] as const) {
    test(`@visual ${route} at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/${route}`);
      await expect(
        page.getByRole('heading', { name: route === 'lists' ? 'Lists' : 'Meals' }),
      ).toBeVisible();
      await page.screenshot({
        path: resolve(evidence, `${route}-${viewport.name}.png`),
        animations: 'disabled',
      });
    });
  }
}

for (const route of ['planning', 'routines', 'pocket-money'] as const) {
  test(`@visual ${route} phone administration`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/admin/${route}`);
    await expect(page.locator('h1')).toBeVisible();
    await page.screenshot({
      path: resolve(evidence, `admin-${route}-phone-portrait.png`),
      animations: 'disabled',
      fullPage: true,
    });
  });
}

test('@visual Phase 4 empty, offline and mutation-failure states', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/lists?scenario=empty');
  await expect(page.getByText('Nothing is planned yet')).toBeVisible();
  await page.screenshot({
    path: resolve(evidence, 'lists-state-empty.png'),
    animations: 'disabled',
  });

  await page.goto('/lists');
  await expect(page.getByText('Milk')).toBeVisible();
  await page.goto('/lists?scenario=offline');
  await expect(page.getByRole('status')).toContainText('Saved lists remain available');
  await page.screenshot({
    path: resolve(evidence, 'lists-state-offline.png'),
    animations: 'disabled',
  });

  await page.goto('/lists?scenario=fail-next');
  await page.locator('[data-focus-id="list-item-list_item_milk"]').press('Enter');
  await expect(page.getByRole('alert')).toContainText('That change did not save');
  await page.screenshot({
    path: resolve(evidence, 'lists-state-failure.png'),
    animations: 'disabled',
  });
});
