import { expect, test } from '@playwright/test';

for (const width of [1920, 1366, 390]) {
  for (const view of ['week', 'month', 'agenda']) {
    test(`${view} compact heading at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1080 });
      await page.goto(`/calendar/${view}`);
      const header = page.locator('.screen-header');
      const title = header.locator('h1');
      const meta = header.locator('.screen-header__meta');
      await expect(title).toBeVisible();
      await expect(meta).toBeVisible();
      const headingBox = (await title.boundingBox())!;
      const dateBox = (await meta.boundingBox())!;
      if (width >= 1366) {
        expect(dateBox.x).toBeGreaterThan(headingBox.x + headingBox.width);
        expect(dateBox.y).toBeLessThan(headingBox.y + headingBox.height);
        expect((await header.boundingBox())!.height).toBeLessThan(80);
      }
      expect(dateBox.x + dateBox.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      await page.screenshot({ path: `/tmp/hearth-${view}-header-${width}.png` });
    });
  }
}
