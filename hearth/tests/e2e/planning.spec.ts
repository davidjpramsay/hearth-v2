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

test('phone Family Planning edits future routines and reverses a reward adjustment', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin');
  await page.getByRole('link', { name: /Family planning/ }).click();
  await expect(page.getByRole('heading', { name: 'Family planning' })).toBeVisible();
  await page.getByRole('link', { name: /Routines and chores/ }).click();
  const schoolBag = page.locator('.routine-editor').filter({ hasText: 'Pack school bag' });
  await schoolBag.getByLabel('Stars').fill('5');
  await schoolBag.getByRole('button', { name: 'Save future routine' }).click();
  await expect(page.getByRole('status')).toContainText('updated from today forward');
  await page.reload();
  await expect(schoolBag.getByLabel('Stars')).toHaveValue('5');

  await page.goto('/admin/rewards');
  const adjustment = page.locator('.reward-adjust-form');
  await adjustment.getByLabel('Person').selectOption('member_ezra');
  await adjustment.getByLabel('Stars (+ or −)').fill('4');
  await adjustment.getByLabel('Reason').fill('Helped with dinner');
  await adjustment.getByRole('button', { name: 'Record adjustment' }).click();
  const entry = page
    .locator('.reward-ledger article')
    .filter({ has: page.getByText('Helped with dinner', { exact: true }) });
  await expect(entry).toContainText('+4');
  await entry.getByRole('button', { name: 'Reverse' }).click();
  await expect(entry).toContainText('Recorded');
  await expect(
    page.locator('.reward-ledger article').filter({ hasText: 'Helped with dinner · reversed' }),
  ).toContainText('-4');
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

for (const path of ['/lists', '/meals', '/admin/planning', '/admin/routines', '/admin/rewards']) {
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

for (const route of ['planning', 'routines', 'rewards'] as const) {
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
