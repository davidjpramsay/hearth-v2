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
  await expect(page.getByText('Weather data by')).toHaveCount(0);
  await expect(page.locator('.weather-week__rows')).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.weather-day--today')).toHaveCSS('border-top-width', '0px');

  const chart = page.locator('[data-focus-id="weather-chart"]');
  await expect(page.locator('[data-focus-id="weather-mode-temperature"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(chart).toBeFocused();
  await expect(page.locator('.weather-selected-hour')).toContainText('8 am');

  const firstHourAlignment = await page.evaluate(() => {
    const marker = document.querySelector('.weather-chart__marker');
    const selectedLine = document.querySelector('.weather-chart__selected-line');
    const firstHour = document.querySelector('.weather-chart__hour');
    if (marker === null || selectedLine === null || firstHour === null) return null;

    const centre = (element: Element) => {
      const bounds = element.getBoundingClientRect();
      return (bounds.left + bounds.right) / 2;
    };

    return {
      markerToHour: Math.abs(centre(marker) - centre(firstHour)),
      markerToSelection: Math.abs(centre(marker) - centre(selectedLine)),
    };
  });
  expect(firstHourAlignment).not.toBeNull();
  expect(firstHourAlignment?.markerToHour).toBeLessThanOrEqual(1);
  expect(firstHourAlignment?.markerToSelection).toBeLessThanOrEqual(1);

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

  await page.getByRole('button', { name: 'Temperature', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Temperature', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

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
  await expect(page.locator('.weather-chart')).toHaveCSS('scrollbar-width', 'none');

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
