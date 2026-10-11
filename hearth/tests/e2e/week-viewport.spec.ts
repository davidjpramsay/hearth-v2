import { expect, test } from '@playwright/test';
import type { WeekSchedule } from '@hearth/shared';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
});

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
});

for (const viewport of [
  { width: 1200, height: 620 },
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1672, height: 941 },
  { width: 1920, height: 1080 },
  { width: 3840, height: 2160 },
]) {
  for (const state of ['normal', 'empty', 'stale'] as const) {
    test(`Week fits ${viewport.width}x${viewport.height} ${state} without canvas scrolling`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize(viewport);
      if (state !== 'normal') {
        await page.route(/\/api\/v1\/households\/[^/]+\/week\?start=/, async (route) => {
          const response = await route.fetch();
          const week = (await response.json()) as WeekSchedule;
          if (state === 'empty') week.events = [];
          else {
            week.freshness = 'stale';
            week.statusMessage = 'Showing saved plans. Calendar refresh is delayed.';
          }
          await route.fulfill({ response, json: week });
        });
      }
      await page.goto('/calendar/week');
      await expect(page).toHaveTitle(/Hearth/);
      await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
      await expect(page.locator('.week-column')).toHaveCount(7);
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: testInfo.outputPath('week-viewport.png') });
      const geometry = await page.locator('.app-content').evaluate((main) => {
        const bounds = (selector: string) => main.querySelector(selector)!.getBoundingClientRect();
        return {
          viewport: innerHeight,
          clientHeight: main.clientHeight,
          scrollHeight: main.scrollHeight,
          documentHeight: document.documentElement.scrollHeight,
          header: bounds('.screen-header').height,
          toolbar: bounds('.calendar-toolbar').height,
          grid: bounds('.week-grid').height,
          timeline: bounds('.week-column__events').height,
          footerBottom: bounds('.week-footer-controls').bottom,
        };
      });
      expect(geometry.scrollHeight, JSON.stringify(geometry)).toBeLessThanOrEqual(
        geometry.clientHeight,
      );
      expect(geometry.documentHeight).toBeLessThanOrEqual(viewport.height);
      expect(geometry.footerBottom).toBeLessThanOrEqual(viewport.height);
      const clippedCards = await page.locator('.week-column__events .week-event').evaluateAll(
        (cards) =>
          cards.filter((card) => {
            const bounds = card.getBoundingClientRect();
            const timeline = card.parentElement!.getBoundingClientRect();
            return bounds.top < timeline.top - 1 || bounds.bottom > timeline.bottom + 1;
          }).length,
      );
      expect(clippedCards).toBe(0);
      await page.mouse.wheel(0, 100);
      expect(await page.locator('.app-content').evaluate((main) => main.scrollTop)).toBe(0);
      // Start at the selected view, then use only the remote's arrow/OK keys.
      await page.locator('[data-focus-id="calendar-view-week"]').focus();
      await page.keyboard.press('ArrowDown');
      for (let step = 0; step < 20; step += 1) {
        if (
          await page
            .locator('[data-focus-id="week-earlier"]')
            .evaluate((button) => button === document.activeElement)
        )
          break;
        await page.keyboard.press('ArrowDown');
      }
      await expect(page.locator('[data-focus-id="week-earlier"]')).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('button', { name: 'Later week' })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/start=2026-08-10/);
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
      expect(await page.locator('.app-content').evaluate((main) => main.scrollTop)).toBe(0);
      expect(errors).toEqual([]);
    });
  }
}

test('Week refits after resizing and switching between TV and phone presentation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/calendar/week');
  await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
    { width: 1366, height: 768 },
    { width: 3840, height: 2160 },
  ]) {
    await page.setViewportSize(viewport);
    if (viewport.width < 1200) {
      await expect(page.locator('.week-grid')).toHaveCount(0);
      await expect(page.locator('.week-agenda')).toBeVisible();
      await expect(page.locator('.phone-tabs')).toBeVisible();
    } else {
      await expect(page.locator('.week-grid')).toBeVisible();
      await expect(page.locator('.week-agenda')).toHaveCount(0);
      await expect
        .poll(() =>
          page.locator('.app-content').evaluate((main) => main.scrollHeight - main.clientHeight),
        )
        .toBe(0);
      await expect(page.getByRole('button', { name: 'Later week' })).toBeInViewport();
    }
  }
  expect(errors).toEqual([]);
});

test('Week keeps fitting with the resize-event fallback when ResizeObserver is unavailable', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() =>
    Object.defineProperty(window, 'ResizeObserver', { value: undefined }),
  );
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/calendar/week');
  await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
  await page.setViewportSize({ width: 1536, height: 864 });
  await expect
    .poll(() =>
      page.locator('.app-content').evaluate((main) => main.scrollHeight - main.clientHeight),
    )
    .toBe(0);
  await expect(page.getByRole('button', { name: 'Later week' })).toBeInViewport();
  expect(errors).toEqual([]);
});
