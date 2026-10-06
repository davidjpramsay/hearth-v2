import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const nginx = await readFile(new URL('../../deploy/synology/nginx.conf', import.meta.url), 'utf8');
const policy = nginx.match(/add_header Content-Security-Policy "([^"]+)"/)?.[1];
if (policy === undefined) throw new Error('Production CSP was not found.');

for (const scenario of [
  {
    name: 'browser saved dark',
    tv: false,
    saved: '{"theme":"dark","eveningDimming":true}',
    system: 'light',
    theme: 'dark',
    preference: 'dark',
    dim: 'true',
    unavailable: false,
  },
  {
    name: 'TV saved light',
    tv: true,
    saved: '{"theme":"light"}',
    system: 'dark',
    theme: 'light',
    preference: 'light',
    dim: 'false',
    unavailable: false,
  },
  {
    name: 'malformed storage',
    tv: false,
    saved: '{invalid',
    system: 'dark',
    theme: 'dark',
    preference: 'automatic',
    dim: 'false',
    unavailable: false,
  },
  {
    name: 'unavailable storage',
    tv: true,
    saved: '',
    system: 'light',
    theme: 'light',
    preference: 'automatic',
    dim: 'false',
    unavailable: true,
  },
] as const) {
  test.describe(scenario.name, () => {
    test.use({
      userAgent: scenario.tv ? 'Mozilla/5.0 HearthTV/1.0' : 'Mozilla/5.0 HearthBrowser',
      colorScheme: scenario.system,
      viewport: { width: 1280, height: 720 },
      screen: { width: 1280, height: 720 },
    });
    test('strict production CSP allows appearance and TV setup before the main bundle', async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.addInitScript(({ saved, unavailable }) => {
        if (unavailable)
          Storage.prototype.getItem = () => {
            throw new Error('Storage is unavailable.');
          };
        else localStorage.setItem('hearth.appearance.v1', saved);
      }, scenario);
      await page.route(/\/today$/, async (route) => {
        const response = await route.fetch();
        await route.fulfill({
          response,
          headers: { ...response.headers(), 'content-security-policy': policy! },
        });
      });
      let release = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(/\/(?:assets\/index-[^/]+\.js|src\/main\.tsx)$/, async (route) => {
        await gate;
        await route.continue();
      });
      try {
        await page.goto('/today', { waitUntil: 'commit' });
        await expect(page.locator('html')).toHaveAttribute('data-theme', scenario.theme);
        await expect(page.locator('html')).toHaveAttribute(
          'data-theme-preference',
          scenario.preference,
        );
        await expect(page.locator('html')).toHaveAttribute('data-evening-dim', scenario.dim);
        await expect(page.locator('#root')).toBeEmpty();
        if (scenario.tv) {
          await expect(page.locator('html')).toHaveAttribute('data-hearth-tv', 'true');
          await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
            'content',
            /width=1920, height=1080, initial-scale=0\.666/,
          );
        } else {
          expect(await page.locator('html').getAttribute('data-hearth-tv')).toBeNull();
          await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
            'content',
            /width=device-width/,
          );
        }
        expect(errors).toEqual([]);
      } finally {
        release();
        await page.unrouteAll({ behavior: 'wait' });
      }
    });
  });
}
