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
  await expect(page.getByRole('img', { name: /TV Today preview/ })).toBeVisible();
  await expect(page.getByText('School drop-off')).toBeVisible();
  await page.getByRole('button', { name: 'Phone' }).click();
  await expect(page.getByRole('img', { name: /phone Today preview/ })).toBeVisible();
  const dinner = page.getByRole('switch', { name: /Dinner/ });
  const photo = page.getByRole('switch', { name: /Family photo/ });
  await expect(dinner).toHaveAttribute('aria-checked', 'true');
  await dinner.click();
  await photo.click();
  await expect(dinner).toHaveAttribute('aria-checked', 'false');
  await expect(photo).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('.today-configuration-preview__band--dinner')).toHaveCount(0);
  await expect(page.locator('.today-configuration-preview__photo')).toHaveCount(0);

  await page.getByLabel('Message').fill('Bring library books tomorrow');
  await page.getByLabel('Priority').selectOption('important');
  await page.getByRole('button', { name: 'Publish notice' }).click();
  await expect(page.getByText('Showing on Today')).toBeVisible();
  await expect(
    page.locator('.notice-card p').filter({ hasText: 'Bring library books tomorrow' }),
  ).toBeVisible();

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

test('@visual @a11y daily verse is optional and Back restores its television focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/today');
  const dailyVerse = page.getByRole('switch', { name: /Daily Bible verse/ });
  await expect(dailyVerse).toHaveAttribute('aria-checked', 'false');
  await dailyVerse.click();
  await expect(dailyVerse).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Demo preview')).toBeVisible();
  await captureEvidence(page, {
    path: resolve(evidence, 'today-daily-verse-settings-phone-portrait.png'),
    animations: 'disabled',
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');
  await expect(page.getByRole('button', { name: 'Read Demo preview' })).toBeVisible();
  await captureEvidence(page, {
    path: resolve(evidence, 'today-daily-verse-tv-1080.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowLeft');
  const verseBand = page.locator('[data-focus-id="today-summary-daily-verse"]');
  await expect(verseBand).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Demo preview' });
  await expect(dialog).toContainText('Let kindness shape');
  await expect(page.locator('[data-focus-id="daily-verse-detail-close"]')).toBeFocused();
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
  await captureEvidence(page, {
    path: resolve(evidence, 'today-daily-verse-dialog-tv-1080.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(verseBand).toBeFocused();
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

  const tvPreview = page.getByRole('img', { name: /TV Today preview/ });
  await expect(tvPreview).toBeVisible();
  const tvBox = await tvPreview.boundingBox();
  expect(tvBox).not.toBeNull();
  expect((tvBox?.width ?? 0) / (tvBox?.height ?? 1)).toBeCloseTo(1666 / 1080, 2);
  await tvPreview.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await captureEvidence(page, {
    path: resolve(evidence, 'today-preview-tv-phone-portrait.png'),
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Phone' }).click();
  const phonePreview = page.getByRole('img', { name: /phone Today preview/ });
  await expect(phonePreview).toBeVisible();
  const phoneBox = await phonePreview.boundingBox();
  expect(phoneBox).not.toBeNull();
  expect((phoneBox?.width ?? 0) / (phoneBox?.height ?? 1)).toBeCloseTo(390 / 844, 2);
  await phonePreview.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await expect(page.getByText('School drop-off')).toBeVisible();
  await captureEvidence(page, {
    path: resolve(evidence, 'today-preview-phone-phone-portrait.png'),
    animations: 'disabled',
  });
  const phoneCanvas = phonePreview.locator('.today-configuration-preview__canvas');
  await expect
    .poll(() => phoneCanvas.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true);
  await phoneCanvas.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => phoneCanvas.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const previewResults = await new AxeBuilder({ page }).analyze();
  expect(
    previewResults.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'TV' }).click();
  const wideTvPreview = page.getByRole('img', { name: /TV Today preview/ });
  await wideTvPreview.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const previewBandsBox = await wideTvPreview
    .locator('.today-configuration-preview__bands')
    .boundingBox();
  const previewPhotoBox = await wideTvPreview
    .locator('.today-configuration-preview__photo')
    .boundingBox();
  expect(previewBandsBox).not.toBeNull();
  expect(previewPhotoBox).not.toBeNull();
  expect(Math.abs(previewBandsBox!.y - previewPhotoBox!.y)).toBeLessThanOrEqual(1);
  await captureEvidence(page, {
    path: resolve(evidence, 'today-preview-tv-admin-1366.png'),
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

test('@visual @a11y dark Today previews remain readable on phone', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'hearth.appearance.v1',
      JSON.stringify({ theme: 'dark', eveningDimming: false }),
    );
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/today');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Phone' }).click();
  const preview = page.getByRole('img', { name: /phone Today preview/ });
  await expect(preview).toBeVisible();
  await preview.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
  await captureEvidence(page, {
    path: resolve(evidence, 'today-preview-dark-phone-portrait.png'),
    animations: 'disabled',
  });
});
