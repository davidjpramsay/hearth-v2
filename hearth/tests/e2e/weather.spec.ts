import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { captureEvidence } from './visualEvidence';

const evidence = resolve('docs/evidence/weather');

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
});

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
});

test('@visual @a11y Weather is readable and remote-operable on television', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/weather');

  await expect(page.getByRole('heading', { name: 'Weather', exact: true })).toBeVisible();
  await expect(page.getByText('Baldivis, WA')).toBeVisible();
  await expect(page.locator('.weather-day')).toHaveCount(7);
  await expect(page.locator('.weather-day').first()).toContainText('11°');
  await expect(page.locator('.weather-day').first()).toContainText('21°');

  const chart = page.locator('[data-focus-id="weather-chart"]');
  await expect(chart).toBeFocused();
  await expect(page.locator('.weather-selected-hour')).toContainText('8 am');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.weather-selected-hour')).toContainText('9 am');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focus-id="weather-mode-rain"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.weather-selected-hour')).toContainText('mm expected');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focus-id="weather-mode-wind"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.weather-selected-hour')).toContainText('Gusts');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.weather-selected-hour')).toContainText('8 am');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-focus-id="nav-weather"]')).toBeFocused();

  expect(
    await page.evaluate(() => {
      const content = document.querySelector('.app-content');
      return (
        content === null ||
        (content.scrollWidth <= content.clientWidth + 1 &&
          content.scrollHeight <= content.clientHeight + 1)
      );
    }),
  ).toBe(true);

  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);

  await captureEvidence(page, {
    path: resolve(evidence, 'weather-tv-1080.png'),
    animations: 'disabled',
  });
});

test('@visual Weather remains one-screen and legible on a compact dark television', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'hearth.appearance.v1',
      JSON.stringify({ theme: 'dark', eveningDimming: false }),
    );
  });
  await page.goto('/weather');

  await expect(page.locator('.weather-day')).toHaveCount(7);
  expect(
    await page.evaluate(() => {
      const content = document.querySelector('.app-content');
      return (
        content === null ||
        (content.scrollWidth <= content.clientWidth + 1 &&
          content.scrollHeight <= content.clientHeight + 1)
      );
    }),
  ).toBe(true);

  await captureEvidence(page, {
    path: resolve(evidence, 'weather-tv-1366-dark.png'),
    animations: 'disabled',
  });
});

test('@visual Weather stacks without page overflow on phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/weather');

  await expect(page.getByRole('heading', { name: 'Weather', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Rain', exact: true }).click();
  await expect(page.locator('.weather-selected-hour')).toContainText('mm expected');
  await expect(page.getByRole('link', { name: 'Weather', exact: true })).toHaveClass(
    /phone-tab--active/,
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);

  await captureEvidence(page, {
    path: resolve(evidence, 'weather-phone-portrait.png'),
    animations: 'disabled',
    fullPage: true,
  });
});

test('Calendar Week uses comparable compact forecasts', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/calendar/week');

  const strips = page.locator('.week-grid .week-forecast-strip');
  await expect(strips).toHaveCount(7);
  await expect(strips.first()).toHaveAttribute('aria-label', /chance of rain, low 11°, high 21°/);
  await expect(strips.first().locator('.week-forecast-strip__range i')).toBeVisible();

  await captureEvidence(page, {
    path: resolve(evidence, 'calendar-week-weather-tv-1080.png'),
    animations: 'disabled',
  });
});
