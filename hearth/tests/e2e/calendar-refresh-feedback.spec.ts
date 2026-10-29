import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  expect((await request.post('http://127.0.0.1:4310/api/v1/demo/reset')).ok()).toBe(true);
});

for (const view of ['today', 'week', 'month', 'agenda'])
  for (const width of [390, 1920])
    for (const theme of ['light', 'dark'] as const)
      test(`${view} uses quiet refresh feedback at ${width}px ${theme}`, async ({ page }, info) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
        await page.emulateMedia({
          colorScheme: theme,
          reducedMotion: theme === 'dark' ? 'reduce' : 'no-preference',
        });
        const path = view === 'today' ? '/today' : `/calendar/${view}`;
        await page.goto(`${path}?scenario=stale`);
        await expect(page).toHaveTitle('Hearth');
        await expect(page.locator('.screen-header h1')).toBeVisible();
        const spinner = page.getByRole('img', { name: 'Refreshing calendar', exact: true });
        await expect(spinner).toBeVisible();
        await expect(page.locator('.status-banner')).toHaveCount(0);
        await expect(page.getByText('Updating calendar', { exact: false })).toHaveCount(0);
        await expect(page.locator('vite-error-overlay')).toHaveCount(0);
        expect(await spinner.getAttribute('tabindex')).toBeNull();
        if (theme === 'dark') await expect(spinner).toHaveCSS('animation-name', 'none');
        else await expect(spinner).toHaveCSS('animation-name', 'calendar-refresh-rotation');
        const refreshingHeight = (await page.locator('.screen-header').boundingBox())!.height;
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath('calendar-refresh.png'),
          animations: 'disabled',
        });
        if (theme === 'light') {
          const audit = await new AxeBuilder({ page }).analyze();
          expect(
            audit.violations.filter((issue) =>
              ['serious', 'critical'].includes(issue.impact ?? ''),
            ),
          ).toEqual([]);
        }
        await page.goto(path);
        await expect(spinner).toHaveCount(0);
        await expect(page.locator('.screen-header h1')).toBeVisible();
        expect(
          Math.abs((await page.locator('.screen-header').boundingBox())!.height - refreshingHeight),
        ).toBeLessThanOrEqual(1);
        await page.goto(`${path}?scenario=unavailable`);
        await expect(page.locator('.status-banner')).toContainText('Calendar is unavailable');
        await expect(spinner).toHaveCount(0);
        await page.goto(`${path}?scenario=offline`);
        await expect(page.locator('.status-banner')).toHaveCount(1);
        await expect(page.locator('.status-banner')).toContainText(
          'Offline · Showing saved plans.',
        );
        await expect(spinner).toHaveCount(0);
        expect(errors).toEqual([]);
      });
