import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const viewports = [
  { name: 'small-phone', width: 320, height: 700 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'tv', width: 1920, height: 1080 },
  { name: '4k', width: 3840, height: 2160 },
] as const;

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
});

for (const viewport of viewports) {
  for (const theme of ['light', 'dark'] as const) {
    test(`connection choices and hub stay readable at ${viewport.name} in ${theme}`, async ({
      page,
    }) => {
      const problems: string[] = [];
      page.on('pageerror', (error) => problems.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') problems.push(message.text());
      });
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/admin/televisions');
      await expect(page).toHaveTitle('Hearth');
      await expect(
        page.getByRole('heading', { name: 'Phones & screens', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Connect screen', exact: true }),
      ).toBeDisabled();
      await expect(page.getByRole('link', { name: 'Manage adult sign-in' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Adult phones' })).toBeVisible();
      await expect(page.locator('.device-access-summary')).toContainText('Signed in as Maya');
      if (viewport.width <= 390) {
        await expect(page.getByRole('heading', { name: 'Adult phones' })).toBeInViewport();
        await page.getByLabel('Code from the screen').scrollIntoViewIfNeeded();
        await expect(page.getByLabel('Code from the screen')).toBeInViewport();
        const connectScreen = page.getByRole('button', { name: 'Connect screen', exact: true });
        await connectScreen.scrollIntoViewIfNeeded();
        await expect(connectScreen).toBeInViewport();
      }
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await contained(page)).toBe(true);
      await assertAccessible(page);
      if (viewport.name === 'phone' && theme === 'dark')
        await page.screenshot({ path: '/tmp/hearth-device-hub-phone-dark.png', fullPage: true });

      await signedOut(page);
      let householdReads = 0;
      page.on('request', (request) => {
        if (request.url().includes('/api/v1/households/')) householdReads++;
      });
      let creations = 0;
      await page.route('**/api/v1/tv-pairing-sessions', (route) => {
        creations++;
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ pairing: pairing() }),
        });
      });
      await page.route('**/api/v1/device-pairing-requests/pairing_flow', (route) =>
        route.fulfill({ contentType: 'application/json', body: JSON.stringify(pairing()) }),
      );
      await page.goto('/today');
      await expect(page.getByRole('heading', { name: 'Connect to Hearth' })).toBeVisible();
      const personal = page.getByRole('button', { name: 'Sign in with a passkey' });
      const shared = page.getByRole('button', { name: 'Connect shared screen' });
      await expect(personal).toBeFocused();
      expect(creations).toBe(0);
      expect(householdReads).toBe(0);
      expect(await contained(page)).toBe(true);
      await assertAccessible(page);
      if (viewport.name === 'phone' && theme === 'dark')
        await page.screenshot({ path: '/tmp/hearth-device-entry-phone-dark.png', fullPage: true });
      if (viewport.width >= 1200) {
        await page.keyboard.press('ArrowRight');
        await expect(shared).toBeFocused();
        await page.keyboard.press('ArrowLeft');
        await expect(personal).toBeFocused();
      }
      await shared.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Connect this screen' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel('Pairing code M7PAIR')).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Cancel connection' })).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(dialog.getByRole('button', { name: 'Cancel connection' })).toBeFocused();
      expect(creations).toBe(1);
      expect(await contained(page)).toBe(true);
      await assertAccessible(page);
      if (viewport.name === 'tv' && theme === 'dark')
        await page.screenshot({ path: '/tmp/hearth-device-pair-tv-dark.png' });
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(shared).toBeFocused();
      expect(problems).toEqual([]);
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    });
  }
}

test('phone connects a screen from a pasted code and confirms disconnection', async ({
  page,
  request,
}) => {
  const response = await request.post('http://127.0.0.1:4310/api/v1/device-pairing-requests', {
    data: { deviceName: 'Kitchen wall screen', requestId: 'request_connection_flow' },
  });
  expect(response.ok()).toBe(true);
  const created = (await response.json()) as { code: string };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/more');
  await page.getByRole('link', { name: 'Phones & screens', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/televisions$/);
  const code = page.getByLabel('Code from the screen');
  await code.fill(
    created.code.toLowerCase().slice(0, 3) + '-' + created.code.toLowerCase().slice(3),
  );
  await expect(code).toHaveValue(created.code);
  const before = page.locator('.device-row').filter({ hasText: 'Kitchen wall screen' });
  await expect(before).toHaveCount(0);
  await page.getByRole('button', { name: 'Connect screen', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Kitchen wall screen connected. You can use it now.',
  );
  await expect(code).toHaveValue('');
  const device = page.locator('.device-row').filter({ hasText: 'Kitchen wall screen' });
  await expect(device).toContainText('Connected');
  await device.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await device.getByRole('button', { name: 'Keep connected' }).click();
  await expect(device).toContainText('Connected');
  await device.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await device.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(
    'Kitchen wall screen disconnected. Its old connection no longer works.',
  );
  await expect(page.getByRole('heading', { name: 'Connected screens' })).toBeFocused();
  await expect(device).toBeHidden();
  await page.getByText('Disconnected screen history (1)', { exact: true }).click();
  await expect(device).toBeVisible();
  await expect(device).toContainText('Disconnected');
  await expect(device.getByRole('button')).toHaveCount(0);
  await page.getByRole('link', { name: 'Manage adult sign-in' }).click();
  await expect(page.getByRole('heading', { name: 'Set up this phone' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Phones & screens' }).click();
  await expect(page.getByRole('heading', { name: 'Phones & screens', exact: true })).toBeVisible();
});

test('an expired code disappears and a new attempt is keyboard-reachable', async ({ page }) => {
  await signedOut(page);
  await page.route('**/api/v1/tv-pairing-sessions', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ pairing: pairing() }),
    }),
  );
  await page.route('**/api/v1/device-pairing-requests/pairing_flow', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ...pairing(), status: 'expired' }),
    }),
  );
  await page.goto('/today');
  await page.getByRole('button', { name: 'Connect shared screen' }).click();
  await expect(page.getByText('Code expired. Get a new code to try again.')).toBeVisible();
  await expect(page.getByLabel('Pairing code M7PAIR')).toHaveCount(0);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('button', { name: 'Get a new code' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Connect shared screen' })).toBeFocused();
});

test('a lost approval reply retries the same command without connecting twice', async ({
  page,
  request,
}) => {
  const response = await request.post('http://127.0.0.1:4310/api/v1/device-pairing-requests', {
    data: { deviceName: 'Retry screen', requestId: 'request_retry_screen' },
  });
  const created = (await response.json()) as { code: string };
  const identifiers: string[] = [];
  await page.route('**/api/v1/households/*/pairing-approvals', async (route) => {
    identifiers.push((route.request().postDataJSON() as { requestId: string }).requestId);
    const result = await route.fetch();
    if (identifiers.length === 1) await route.abort();
    else await route.fulfill({ response: result });
  });
  await page.goto('/admin/televisions');
  await page.getByLabel('Code from the screen').fill(created.code);
  await page.getByRole('button', { name: 'Connect screen', exact: true }).click();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.device-row').filter({ hasText: 'Retry screen' })).toHaveCount(1);
  expect(identifiers).toHaveLength(2);
  expect(identifiers[1]).toBe(identifiers[0]);
});

test('empty screens and an unavailable clipboard have clear next steps', async ({ page }) => {
  await page.route('**/api/v1/households/*/admin', async (route) => {
    const result = await route.fetch();
    const body = (await result.json()) as { pairedDevices: unknown[] };
    body.pairedDevices = [];
    await route.fulfill({ response: result, json: body });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('Unavailable');
        },
      },
    });
  });
  await page.goto('/admin/televisions');
  await expect(page.getByText('No screens connected. Add a TV below.')).toBeVisible();
  await page.getByText('Use Hearth on another phone', { exact: true }).click();
  await page.getByRole('button', { name: 'Copy address' }).click();
  await expect(page.getByRole('status')).toHaveText('Select and copy the address above.');
});

function pairing() {
  return {
    id: 'pairing_flow',
    requestId: 'request_flow',
    code: 'M7PAIR',
    deviceName: 'Wall tablet',
    status: 'pending',
    expiresAt: '2026-10-06T16:00:00.000Z',
    approvedDeviceId: null,
  };
}

test('first-use TV guidance does not misclassify a wide desktop computer', async ({ page }) => {
  await signedOut(page, true);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');
  await expect(page.getByLabel('Local first-use code')).toBeVisible();
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'userAgent', { value: 'HearthTV/1.0', configurable: true }),
  );
  await page.reload();
  await expect(page.getByText('Finish setup on your phone or computer')).toBeVisible();
  await expect(page.locator('form')).toHaveCount(0);
});

async function signedOut(page: Page, requiresSetup = false) {
  await page.route('**/api/v1/runtime', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'private',
        generatedAt: '2026-10-06T05:00:00.000Z',
        household: null,
        timezone: 'Australia/Perth',
        locale: 'en-AU',
        localDate: '2026-10-06',
        weekStart: '2026-10-05',
        currentMonth: '2026-10',
        requiresSetup,
      }),
    }),
  );
  await page.route('**/api/v1/auth/status', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'private',
        configured: true,
        secureOrigin: true,
        requiresSetup,
        authenticated: false,
        actor: null,
      }),
    }),
  );
}

async function contained(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
}

async function assertAccessible(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
}
