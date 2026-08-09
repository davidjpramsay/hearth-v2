import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const evidence = resolve('docs/evidence/phase-5/screenshots');

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
});

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
});

test('remote-only Home navigation, confirmation, action and Back restoration', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');
  await expect(page.locator('[data-focus-id="today-chore-occurrence_school_bag"]')).toBeFocused();
  await page.locator('[data-focus-id="nav-today"]').focus();
  for (let step = 0; step < 5; step += 1) await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focus-id="nav-home"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

  const evening = page.locator('[data-focus-id="home-action-evening-mode"]');
  const goodnight = page.locator('[data-focus-id="home-action-goodnight"]');
  const screenOff = page.locator('[data-focus-id="home-action-screen-off"]');
  await expect(evening).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(goodnight).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('[data-focus-id="home-confirm-goodnight"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(goodnight).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.locator('[data-focus-id="home-confirm-goodnight"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(goodnight).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(screenOff).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Television in standby')).toBeVisible();
  await expect(screenOff).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.locator('[data-focus-id="nav-home"]')).toBeFocused();
});

test('failed Home action retries in place with a family-readable result', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/home?scenario=fail-next');
  const evening = page.locator('[data-focus-id="home-action-evening-mode"]');
  await expect(evening).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('That home action didn’t run');
  await expect(evening).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Evening is ready.')).toBeAttached();
  await expect(evening).toBeFocused();
});

test('protected native playback is represented only as a power guard', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/home?scenario=protected-media');
  await expect(page.getByText('Playback is protected')).toBeVisible();
  const screenOff = page.locator('[data-focus-id="home-action-screen-off"]');
  await expect(screenOff).toHaveAttribute('aria-disabled', 'true');
  await expect(screenOff).toContainText('Protected native playback is active.');
  await expect(page.getByText('Jellyfin', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Music Assistant', { exact: true })).toHaveCount(0);
});

test('cached Home state remains visible through Home Assistant and browser outages', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/home?scenario=unavailable');
  await expect(page.getByRole('status').first()).toContainText('last known room state');
  await expect(page.getByText('Someone is home')).toBeVisible();
  await page.goto('/home');
  await expect(page.getByText('Someone is home')).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByRole('status').first()).toContainText('last known room state');
  await expect(page.getByText('Someone is home')).toBeVisible();
  await context.setOffline(false);
});

test('phone Home keeps the same information hierarchy and explicit confirmation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/home');
  await expect(page.locator('.phone-tabs')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Room actions' })).toBeVisible();
  await page.getByRole('button', { name: /Goodnight/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm Goodnight' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('@a11y Home has no serious accessibility violations on TV and phone', async ({ page }) => {
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/home');
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
  }
});

const viewports = [
  { name: 'tv-4k', width: 3840, height: 2160 },
  { name: 'tv-1080', width: 1920, height: 1080 },
  { name: 'tv-1366', width: 1366, height: 768 },
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
] as const;

for (const viewport of viewports) {
  test(`@visual Home at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/home');
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await page.screenshot({
      path: resolve(evidence, `home-${viewport.name}.png`),
      animations: 'disabled',
    });
  });
}

for (const state of ['unavailable', 'protected-media', 'fail-next'] as const) {
  test(`@visual Home ${state} state`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/home?scenario=${state}`);
    if (state === 'fail-next') {
      await page.locator('[data-focus-id="home-action-evening-mode"]').press('Enter');
      await expect(page.getByRole('alert')).toBeVisible();
    }
    await page.screenshot({
      path: resolve(evidence, `home-state-${state}.png`),
      animations: 'disabled',
    });
  });
}

test('@visual Home confirmation state', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/home');
  await page.locator('[data-focus-id="home-action-goodnight"]').press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({
    path: resolve(evidence, 'home-state-confirmation.png'),
    animations: 'disabled',
  });
});
