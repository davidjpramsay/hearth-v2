import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

// Exercise the exact native template, not a second browser implementation.
const kotlin = await readFile(
  new URL('../../apps/tv/app/src/main/java/app/hearth/tv/TvViewport.kt', import.meta.url),
  'utf8',
);
const template = kotlin.match(/return """([\s\S]*?)"""\.trimIndent\(\)/)?.[1];
if (template === undefined) throw new Error('Native TV viewport template was not found.');
const nativeScript = (scale: string) => template.replaceAll('$scale', scale);
const nginx = await readFile(new URL('../../deploy/synology/nginx.conf', import.meta.url), 'utf8');
const policy = nginx.match(/add_header Content-Security-Policy "([^"]+)"/)?.[1];
if (policy === undefined) throw new Error('Production CSP was not found.');

for (const scenario of [
  { name: 'density-two 1080p', width: 960, height: 540, scale: '0.5' },
  { name: 'density-two 4K', width: 1920, height: 1080, scale: '1.0' },
]) {
  test.describe(scenario.name, () => {
    test.use({
      isMobile: true,
      deviceScaleFactor: 2,
      viewport: { width: scenario.width, height: scenario.height },
      screen: { width: scenario.width, height: scenario.height },
      userAgent: 'Mozilla/5.0 Android HearthTV/0.1.0',
    });
    test('native startup and reload retain the TV canvas without the server sizing script', async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.addInitScript(nativeScript(scenario.scale));
      await page.route('**/hearth-bootstrap.js', (route) =>
        route.fulfill({ contentType: 'text/javascript', body: '// No server bootstrap.' }),
      );
      await page.route(/\/today$/, async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          headers: { ...response.headers(), 'content-security-policy': policy! },
        });
      });
      for (const load of [() => page.goto('/today'), () => page.reload()]) {
        await load();
        await expect(page.locator('html')).toHaveAttribute('data-hearth-tv-native', 'true');
        await expect(page.locator('.tv-rail')).toBeVisible();
        await expect(page.locator('.phone-tabs')).toBeHidden();
        await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1920);
        await expect.poll(() => page.evaluate(() => innerHeight)).toBe(1080);
        await expect(page.locator('meta[name="viewport"]')).toHaveCount(1);
      }
      await page.locator('[data-focus-id="nav-games"]').focus();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/games$/);
      await expect(page.locator('.games-word')).toHaveCount(16);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('older WebView fallback', () => {
  test.use({
    isMobile: true,
    deviceScaleFactor: 2,
    viewport: { width: 960, height: 540 },
    screen: { width: 960, height: 540 },
  });
  test('post-parser fallback creates a missing viewport and is idempotent', async ({ page }) => {
    await page.goto('/today');
    await page.locator('meta[name="viewport"]').evaluate((node) => node.remove());
    await page.evaluate(nativeScript('0.5'));
    await page.evaluate(nativeScript('0.5'));
    await expect(page.locator('meta[name="viewport"]')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1920);
    await expect(page.locator('.tv-rail')).toBeVisible();
    await expect(page.locator('.phone-tabs')).toBeHidden();
  });
  test('bootstrap does not resize or mark subframes', async ({ page }) => {
    await page.addInitScript(nativeScript('0.5'));
    await page.goto('/today');
    await page.evaluate(() => {
      const frame = document.createElement('iframe');
      frame.srcdoc =
        '<html><head><meta name="viewport" content="width=device-width"></head></html>';
      document.body.appendChild(frame);
    });
    const child = page.frameLocator('iframe');
    await expect(child.locator('html')).not.toHaveAttribute('data-hearth-tv-native', 'true');
    await expect(child.locator('meta[name="viewport"]')).toHaveAttribute(
      'content',
      'width=device-width',
    );
  });
});
