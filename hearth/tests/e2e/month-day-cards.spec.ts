import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { MonthSchedule } from '@hearth/shared';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
});

async function crowdedMonth(page: Page) {
  await page.route(/\/api\/v1\/households\/[^/]+\/month\?month=/, async (route) => {
    const response = await route.fetch();
    const month = (await response.json()) as MonthSchedule;
    const source = month.events[0]!;
    month.events = [
      { date: '2026-08-02', count: 4 },
      { date: '2026-08-03', count: 12 },
      { date: '2026-08-25', count: 1 },
      { date: '2026-08-26', count: 2 },
      { date: '2026-08-27', count: 3 },
    ].flatMap(({ date, count }) =>
      Array.from({ length: count }, (_, index) => ({
        ...source,
        id: `month-${date}-${index}`,
        title: `Plan ${index + 1}: a deliberately long family calendar title`,
        start: `${date}T08:00:00+08:00`,
        end: `${date}T09:00:00+08:00`,
        startLocalDate: date,
        endLocalDate: date,
        allDay: index === 0,
      })),
    );
    await route.fulfill({ response, json: month });
  });
}

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1536, height: 864 },
  { width: 3840, height: 2160 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`Month shows two titles and a bounded count at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize(viewport);
    await crowdedMonth(page);
    await page.goto('/calendar/month');
    await expect(page).toHaveURL(/\/calendar\/month$/);
    await expect(page).toHaveTitle(/Hearth/);
    await expect(page.getByRole('heading', { name: 'August', exact: true })).toBeVisible();
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(page.locator('.month-cell')).toHaveCount(42);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: testInfo.outputPath('month-two-events.png') });
    for (const { date, count } of [
      { date: '2026-08-03', count: 12 },
      { date: '2026-08-04', count: 0 },
      { date: '2026-08-25', count: 1 },
      { date: '2026-08-26', count: 2 },
      { date: '2026-08-27', count: 3 },
    ]) {
      const day = page.locator(`[data-focus-id="month-day-${date}"]`);
      const labels = day.locator('.month-event-label');
      await expect(labels).toHaveCount(Math.min(2, count));
      for (const label of await labels.all()) await expect(label).toBeVisible();
      const more = day.locator('.month-event-more');
      await expect(more).toHaveCount(count > 2 ? 1 : 0);
      if (count > 2) await expect(more).toContainText(`+${count - 2}`);
      const geometry = await day.evaluate((cell) => {
        const bounds = cell.getBoundingClientRect();
        const items = [...cell.querySelectorAll('.month-event-label, .month-event-more')].map(
          (item) => item.getBoundingClientRect(),
        );
        return {
          clipped: items.some(
            (item) =>
              item.height === 0 ||
              item.top < bounds.top ||
              item.bottom > bounds.bottom ||
              item.left < bounds.left ||
              item.right > bounds.right,
          ),
          overlaps: items.some((item, index) => index > 0 && item.top < items[index - 1]!.bottom),
        };
      });
      expect(geometry, `${date} at ${viewport.width}px`).toEqual({
        clipped: false,
        overlaps: false,
      });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      viewport.width,
    );
    if (viewport.width >= 1200) {
      expect(
        await page
          .locator('.app-content')
          .evaluate((main) => main.scrollHeight - main.clientHeight),
      ).toBe(0);
    }
    const day = page.locator('[data-focus-id="month-day-2026-08-03"]');
    await day.focus();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if (viewport.width < 1200) await day.click();
    else await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.agenda-event')).toHaveCount(12);
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('month-day-open.png') });
    await page.keyboard.press('ArrowDown');
    for (let index = 0; index < 11; index++) await page.keyboard.press('ArrowDown');
    const last = dialog.locator('.agenda-event').last();
    await expect(last).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(
      dialog.getByRole('heading', { name: 'Plan 12: a deliberately long family calendar title' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(last).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('month-full-day.png') });
    await page.keyboard.press('Escape');
    await expect(day).toBeFocused();
    await expect(dialog).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('Month empty days and dark full-day lists remain accessible and Back-safe', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.addInitScript(() =>
    localStorage.setItem(
      'hearth.appearance.v1',
      JSON.stringify({ theme: 'dark', eveningDimming: false }),
    ),
  );
  await crowdedMonth(page);
  await page.goto('/calendar/month');
  const emptyDay = page.locator('[data-focus-id="month-day-2026-08-04"]');
  await emptyDay.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Nothing planned for this day.');
  await page.keyboard.press('Escape');
  await expect(emptyDay).toBeFocused();
  await page.locator('[data-focus-id="month-day-2026-08-03"]').click();
  expect(
    (await new AxeBuilder({ page }).include('.calendar-day-dialog').analyze()).violations,
  ).toEqual([]);
});
