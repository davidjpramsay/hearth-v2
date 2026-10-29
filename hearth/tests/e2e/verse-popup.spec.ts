import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`verse popup uses Hearth type without publisher paragraphs at ${viewport.width}px in ${theme}`, async ({
      page,
      request,
    }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme });
      const response = await request.get(
        'http://127.0.0.1:4310/api/v1/households/household_hearth_demo/today?date=2026-08-03',
      );
      expect(response.ok()).toBe(true);
      const today = await response.json();
      today.sections.dailyVerse = true;
      today.dailyVerse = {
        reference: 'Layout reading',
        text: 'A fictional reading for layout checks about kindness and patience. (ESV)',
        translation: 'ESV',
        sourceUrl: viewport.width === 1366 ? null : 'https://www.esv.org/',
        freshness: 'current',
        statusMessage: null,
      };
      await page.route('**/api/v1/households/*/today?date=*', (route) =>
        route.fulfill({ json: structuredClone(today) }),
      );
      await page.goto('/today');
      const opener = page.getByRole('button', { name: 'Read Layout reading', exact: true });
      await opener.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Layout reading', exact: true });
      await expect(dialog).toBeVisible();
      await expect(page).toHaveTitle('Hearth');
      await expect(dialog.locator('blockquote')).toHaveText(today.dailyVerse.text);
      await expect(dialog).not.toContainText(
        /Scripture quotations|Crossway|Fictional text for the demo/,
      );
      await expect(dialog.getByRole('link', { name: 'ESV', exact: true })).toHaveAttribute(
        'href',
        'https://www.esv.org/',
      );
      const type = await dialog.locator('blockquote').evaluate((element) => ({
        quote: getComputedStyle(element).fontFamily,
        body: getComputedStyle(document.body).fontFamily,
        style: getComputedStyle(element).fontStyle,
      }));
      expect(type.quote).toBe(type.body);
      expect(type.quote).toContain('Source Sans 3');
      expect(type.style).toBe('normal');
      const close = dialog.getByRole('button', { name: 'Close', exact: true });
      await expect(close).toBeFocused();
      for (let step = 0; step < 4; step++) {
        await page.keyboard.press('Tab');
        await expect(dialog.locator(':focus')).toHaveCount(1);
      }
      const a11y = await new AxeBuilder({ page }).analyze();
      expect(
        a11y.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
      ).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`verse-${viewport.width}-${theme}.png`),
        animations: 'disabled',
      });
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1920, height: 1080 },
]) {
  test(`full Bible credits are available separately with keyboard Back at ${viewport.width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport);
    await page.goto('/more');
    const credits = page
      .locator('.more-screen')
      .getByRole('link', { name: 'Credits', exact: true });
    await credits.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/credits$/);
    await expect(
      page.getByRole('heading', { name: 'Credits', exact: true, level: 1 }),
    ).toBeVisible();
    await expect(page.locator('.credits-notice')).toContainText(
      'Used by permission. All rights reserved.',
    );
    await expect(page.getByRole('link', { name: 'ESV.org', exact: true })).toHaveAttribute(
      'href',
      'https://www.esv.org/',
    );
    if (viewport.width === 390)
      await expect(page.locator('[data-focus-id="phone-tab-more"]')).toHaveClass(
        /phone-tab--active/,
      );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: info.outputPath(`credits-${viewport.width}.png`),
      animations: 'disabled',
      fullPage: viewport.width === 390,
    });
    await page.getByRole('link', { name: 'Back to More', exact: true }).click();
    await expect(page).toHaveURL(/\/more$/);
    await expect(credits).toBeFocused();
  });
}
