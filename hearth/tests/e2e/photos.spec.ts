import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const evidence = resolve('docs/evidence/phase-7/screenshots');

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
});

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
});

test('remote-only navigation opens Photos, selects portrait content, and exits ambient immediately', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  for (let step = 0; step < 6; step += 1) await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focus-id="nav-photos"]')).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();
  const breakfast = page.locator('[data-focus-id="photos-thumb-photo_family_breakfast"]');
  await expect(breakfast).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const portrait = page.locator('[data-focus-id="photos-thumb-photo_garden_morning"]');
  await expect(portrait).toBeFocused();
  const portraitBox = await portrait.boundingBox();
  expect(portraitBox?.height).toBeGreaterThan((portraitBox?.width ?? 0) * 1.4);
  await expect(portrait.locator('img')).toHaveCSS('object-fit', 'contain');
  await page.keyboard.press('Enter');
  await expect(page.locator('.photos-hero--portrait')).toBeVisible();
  await expect(page.locator('.photos-hero__image')).toHaveCSS('object-fit', 'contain');
  await expect(page.locator('.photos-hero figcaption')).toHaveCount(0);
  await expect(page.locator('.photos-hero')).not.toContainText(
    'Ezra and Maya water herbs in the family garden.',
  );

  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-focus-id="photos-start-ambient"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: /Ambient family photo/ })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('dialog', { name: /Ambient family photo/ })).toHaveCount(0);
  await expect(page.locator('[data-focus-id="photos-start-ambient"]')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.locator('[data-focus-id="nav-photos"]')).toBeFocused();
});

test('Photos has deliberate empty, cached-unavailable and failure/retry states', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/photos?scenario=empty');
  await expect(page.getByRole('heading', { name: 'No family photos selected' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show demo photos' })).toBeVisible();

  await page.goto('/photos?scenario=unavailable');
  await expect(
    page.getByRole('status').filter({ hasText: 'Showing saved favourites' }),
  ).toBeVisible();
  await expect(page.locator('.photos-grid img')).toHaveCount(5);

  await page.goto('/photos?scenario=fail-next');
  await expect(page.getByRole('heading', { name: 'Hearth couldn’t load this view' })).toBeVisible();
  await page.getByRole('button', { name: /Try again/ }).click();
  await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();
  await expect(page.locator('.photos-grid img')).toHaveCount(5);
});

test('cached Photos remain visible through a real browser offline event', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/photos');
  await expect(page.locator('.photos-grid img')).toHaveCount(5);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(
    page.getByRole('status').filter({ hasText: 'Showing saved family photos' }),
  ).toBeVisible();
  await expect(page.locator('.photos-grid img')).toHaveCount(5);
  await context.setOffline(false);
});

test('a corrupt display derivative fails without revealing its URL', async ({ page }) => {
  await page.route('**/demo/photos/bush-camping.webp', (route) => route.abort());
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/photos');
  await page.locator('[data-focus-id="photos-thumb-photo_bush_camping"]').click();
  const fallback = page.getByRole('img', { name: /toast marshmallows.*unavailable/i });
  await expect(fallback).toBeVisible();
  await expect(page.locator('body')).not.toContainText('bush-camping.webp');
});

test('@visual phone administration explains Synology and Apple photo-source boundaries', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/photos');
  await expect(page.getByRole('heading', { name: 'Photo source' })).toBeVisible();
  await expect(page.locator('[data-focus-id="admin-back"]')).toBeFocused();
  await expect(page.getByText('Approved Synology folder')).toBeVisible();
  await expect(page.getByText('Apple Shared Album link')).toBeVisible();
  await expect(page.getByText(/not a supported Hearth photo feed/)).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
  await page.screenshot({
    path: resolve(evidence, 'photos-admin-phone.png'),
    animations: 'disabled',
  });
  await page.getByRole('link', { name: 'View family photos' }).click();
  await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();
});

for (const viewport of [
  { name: 'tv-4k', width: 3840, height: 2160 },
  { name: 'tv-1080', width: 1920, height: 1080 },
  { name: 'tv-1366', width: 1366, height: 768 },
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
] as const) {
  test(`@visual Photos at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/photos');
    await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();
    await expect(page.locator('.photos-grid img')).toHaveCount(5);
    await page.screenshot({
      path: resolve(evidence, `photos-${viewport.name}.png`),
      animations: 'disabled',
    });
  });
}

test('@visual Photos empty, unavailable, failure, portrait and ambient states', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/photos?scenario=empty');
  await expect(page.getByRole('heading', { name: 'No family photos selected' })).toBeVisible();
  await page.screenshot({
    path: resolve(evidence, 'photos-state-empty.png'),
    animations: 'disabled',
  });

  await page.goto('/photos?scenario=unavailable');
  await expect(
    page.getByRole('status').filter({ hasText: 'Showing saved favourites' }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(evidence, 'photos-state-unavailable.png'),
    animations: 'disabled',
  });

  await page.goto('/photos?scenario=fail-next');
  await expect(page.getByRole('heading', { name: 'Hearth couldn’t load this view' })).toBeVisible();
  await page.screenshot({
    path: resolve(evidence, 'photos-state-failure.png'),
    animations: 'disabled',
  });

  await page.goto('/photos');
  await page.locator('[data-focus-id="photos-thumb-photo_garden_morning"]').click();
  await expect(page.locator('.photos-hero--portrait')).toBeVisible();
  await expect(page.locator('.photos-hero__image')).toHaveAttribute(
    'src',
    '/demo/photos/garden-morning.webp',
  );
  await expect
    .poll(() =>
      page
        .locator('.photos-hero__image')
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await page.screenshot({
    path: resolve(evidence, 'photos-portrait-selected.png'),
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Start ambient' }).click();
  await expect(page.getByRole('dialog', { name: /Ambient family photo/ })).toBeVisible();
  await page.screenshot({
    path: resolve(evidence, 'photos-ambient.png'),
    animations: 'disabled',
  });
});

for (const viewport of [
  { name: 'tv', width: 1920, height: 1080 },
  { name: 'phone', width: 390, height: 844 },
] as const) {
  test(`@a11y Photos has no serious accessibility violations on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/photos');
    await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
  });
}
