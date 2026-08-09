import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { captureEvidence } from './visualEvidence';

const evidence = resolve('docs/evidence/today-notices');

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
});

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
});

test('adult publishes an important notice and chooses the Today overview sections', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/today');
  await expect(page.getByRole('heading', { name: 'Today & notices' })).toBeVisible();
  const dinner = page.getByRole('switch', { name: /Dinner/ });
  const photo = page.getByRole('switch', { name: /Family photo/ });
  await expect(dinner).toHaveAttribute('aria-checked', 'true');
  await dinner.click();
  await photo.click();
  await expect(dinner).toHaveAttribute('aria-checked', 'false');
  await expect(photo).toHaveAttribute('aria-checked', 'false');

  await page.getByLabel('Message').fill('Bring library books tomorrow');
  await page.getByLabel('Priority').selectOption('important');
  await page.getByRole('button', { name: 'Publish notice' }).click();
  await expect(page.getByText('Showing on Today')).toBeVisible();
  await expect(page.getByText('Bring library books tomorrow')).toBeVisible();

  await page.goto('/today');
  await expect(page.getByText('Bring library books tomorrow')).toBeVisible();
  await expect(page.getByText('Dinner', { exact: true })).toHaveCount(0);
  await expect(page.locator('.today-photo')).toHaveCount(0);
  await expect(page.getByText('List summary', { exact: true })).toBeVisible();
});

test('notice removal restores the next eligible household notice', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/today');
  await page.getByLabel('Message').fill('School hats on Tuesday');
  await page.getByLabel('Priority').selectOption('important');
  await page.getByRole('button', { name: 'Publish notice' }).click();
  const created = page.locator('.notice-card').filter({ hasText: 'School hats on Tuesday' });
  await created.getByRole('button', { name: 'Remove' }).click();
  await expect(created).toHaveCount(0);
  await page.goto('/today');
  await expect(page.getByText('Bins go out tonight')).toBeVisible();
});

test('@visual and @a11y Today notice administration and customised television overview', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/today');
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
  await captureEvidence(page, {
    path: resolve(evidence, 'today-notices-phone-portrait.png'),
    animations: 'disabled',
  });

  await page.getByRole('switch', { name: /Dinner/ }).click();
  await page.getByRole('switch', { name: /Family photo/ }).click();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByText('Bins go out tonight')).toBeVisible();
  await captureEvidence(page, {
    path: resolve(evidence, 'today-customised-tv-1080.png'),
    animations: 'disabled',
  });
});
