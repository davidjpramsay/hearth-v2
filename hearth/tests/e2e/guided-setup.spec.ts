import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 3840, height: 2160 },
]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`guided household setup fits ${viewport.width}x${viewport.height} in ${theme} without HA`, async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme });
      await page.route('**/home-assistant-bridge', (route) =>
        route.fulfill({
          status: 503,
          json: { error: { code: 'INTEGRATION_UNAVAILABLE', message: 'Fixture HA offline.' } },
        }),
      );
      await page.route('**/home-assistant-connection', (route) => route.fulfill({ json: null }));
      await page.goto('/admin/get-started');
      await expect(
        page.getByRole('heading', { name: 'Welcome to Hearth', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText('Your phone is connected. Home Assistant is optional.'),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: /Add your family/ })).toBeFocused();
      await page.screenshot({
        path: info.outputPath(`get-started-${viewport.width}-${theme}.png`),
        fullPage: false,
      });
      await page.getByRole('link', { name: /Optional connections/ }).click();
      await expect(page.getByRole('heading', { name: 'Connections', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: /Home Assistant.*Check access/ })).toBeVisible();
      await expect(page.getByRole('link', { name: /Family photos/ })).toBeVisible();
      expect(
        await page
          .locator('body')
          .evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      ).toBe(false);
      const a11y = await new AxeBuilder({ page }).analyze();
      expect(
        a11y.violations.filter((issue) => ['critical', 'serious'].includes(issue.impact ?? '')),
      ).toEqual([]);
      await page
        .getByRole('heading', { name: 'Connections', exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: info.outputPath(`connections-${viewport.width}-${theme}.png`),
        fullPage: false,
      });
      await page.keyboard.press('Escape');
      await expect(page).toHaveURL(/\/admin\/get-started$/);
      await page.getByRole('link', { name: 'Start using Hearth', exact: true }).click();
      await expect(page).toHaveURL(/\/today$/);
      expect(errors).toEqual([]);
    });
  }
}

test('HA install download matches this build and home actions stay optional', async ({
  page,
  request,
}) => {
  await page.goto('/admin/connections/home-assistant');
  await expect(page.getByLabel('Long-lived access token')).not.toBeVisible();
  await page.locator('[data-focus-id="home-assistant-bridge-setup"]').click();
  const download = page.getByRole('link', { name: 'Download HA integration', exact: true });
  await expect(download).toBeVisible();
  const response = await request.get((await download.getAttribute('href'))!);
  expect(response.ok()).toBe(true);
  expect((await response.body()).subarray(0, 2).toString()).toBe('PK');
  await expect(page.getByLabel('Code shown in Home Assistant')).toBeVisible();
  await page.getByText('Optional home-action controls', { exact: true }).click();
  await expect(page.getByLabel('Long-lived access token')).toBeVisible();
});

test('disabled modules do not make provider reads from Connections', async ({ page, request }) => {
  const base = 'http://127.0.0.1:4310/api/v1/households/household_hearth_demo';
  for (const module of ['calendar', 'weather', 'photos', 'home']) {
    const response = await request.put(`${base}/modules/${module}`, {
      headers: { 'X-Hearth-Demo-Actor': 'member_maya' },
      data: { requestId: `request_setup_off_${module}`, enabled: false },
    });
    expect(response.ok()).toBe(true);
  }
  const reads: string[] = [];
  page.on('request', (read) => {
    if (
      /\/(calendar-connection|weather-location|indoor-climate-settings|photo-source|home-assistant-connection)$/.test(
        read.url(),
      )
    )
      reads.push(read.url());
  });
  await page.goto('/admin/connections');
  await expect(page.getByRole('heading', { name: 'Connections', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Choose modules/ })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Everyday connections', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: /Calendar|Outdoor weather|Family photos|Indoor sensors/ }),
  ).toHaveCount(0);
  expect(reads).toEqual([]);
});
