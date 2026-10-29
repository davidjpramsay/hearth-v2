import { expect, test } from '@playwright/test';
import sharp from 'sharp';

test.beforeEach(async ({ request }) => {
  expect((await request.post('http://127.0.0.1:4310/api/v1/demo/reset')).ok()).toBe(true);
});

test('Home Screen metadata loads same-origin opaque fern icons and a safe standalone launch', async ({
  page,
  request,
}) => {
  await page.goto('/admin/people');
  const manifestLink = page.locator('link[rel="manifest"]');
  await expect(manifestLink).toHaveAttribute('href', '/manifest.webmanifest');
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
    'content',
    'yes',
  );
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
    'content',
    'Hearth',
  );
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute(
    'content',
    'default',
  );
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toMatch(/application\/(manifest\+)?json/);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    id: '/',
    name: 'Hearth',
    short_name: 'Hearth',
    display: 'standalone',
    start_url: '/today',
    scope: '/',
    lang: 'en-AU',
  });
  // Let iPad rotation and multitasking work. Never save setup/admin URLs in a launch target.
  expect(manifest).not.toHaveProperty('orientation');
  expect(manifest).not.toHaveProperty('shortcuts');
  expect(manifest.icons).toHaveLength(2);
  for (const icon of manifest.icons) {
    const url = new URL(icon.src, page.url());
    expect(url.origin).toBe(new URL(page.url()).origin);
    const image = await request.get(url.href);
    expect(image.ok()).toBe(true);
    expect(image.headers()['content-type']).toContain('image/png');
    const size = Number(icon.sizes.split('x')[0]);
    expect([192, 512]).toContain(size);
    expect(await sharp(await image.body()).metadata()).toMatchObject({
      format: 'png',
      width: size,
      height: size,
      hasAlpha: false,
    });
  }
  await page.goto(manifest.start_url);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  expect(
    await page.evaluate(async () =>
      'serviceWorker' in navigator ? (await navigator.serviceWorker.getRegistrations()).length : 0,
    ),
  ).toBe(0);
});

// WebKit viewport evidence complements, but cannot replace, real Add to Home Screen acceptance.
for (const profile of [
  { name: 'iPhone', width: 390, height: 844 },
  { name: 'iPad portrait', width: 820, height: 1180 },
  { name: 'iPad landscape', width: 1180, height: 820 },
  { name: 'large iPad landscape', width: 1366, height: 1024 },
  { name: 'iPad split view', width: 375, height: 1024 },
]) {
  test(`web app launch and settings navigation fit ${profile.name}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize({ width: profile.width, height: profile.height });
    await page.goto('/today');
    await expect(page).toHaveTitle('Hearth');
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);

    await page.goto('/admin');
    const settings = page.getByRole('link', { name: 'People', exact: true }).last();
    await settings.click();
    await expect(page).toHaveURL(/\/admin\/people$/);
    await expect(page.getByRole('heading', { name: 'People', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath('home-screen-settings.png') });
    await page.locator('.admin-back').click();
    await expect(page).toHaveURL(/\/admin$/);
    await page.reload();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('link', { name: 'People', exact: true }).last()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('install metadata grants no adult access to an unconnected iPad', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.route('**/api/v1/runtime', (route) =>
    route.fulfill({
      json: {
        mode: 'private',
        generatedAt: '2026-10-29T00:00:00Z',
        household: null,
        timezone: 'Australia/Perth',
        locale: 'en-AU',
        localDate: '2026-10-29',
        weekStart: '2026-10-26',
        currentMonth: '2026-10',
        requiresSetup: false,
      },
    }),
  );
  await page.route('**/api/v1/auth/status', (route) =>
    route.fulfill({
      json: {
        mode: 'private',
        accessMethod: 'phone',
        configured: true,
        secureOrigin: true,
        requiresSetup: false,
        authenticated: false,
        actor: null,
      },
    }),
  );
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'Connect to Hearth', exact: true })).toBeVisible();
  await page.goto('/admin/people');
  await expect(page.getByRole('heading', { name: 'Connect to Hearth', exact: true })).toBeVisible();
  await expect(page.locator('.admin-desktop-rail')).toHaveCount(0);
  await expect(page.getByLabel('Connection code')).toBeVisible();
});
