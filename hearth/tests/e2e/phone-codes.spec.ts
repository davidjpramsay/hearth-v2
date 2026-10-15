import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function privatePhone(page: Page, requiresSetup = false) {
  await page.route('**/api/v1/runtime', (route) =>
    route.fulfill({
      json: {
        mode: 'private',
        generatedAt: '2026-10-15T00:00:00Z',
        household: null,
        timezone: 'Australia/Perth',
        locale: 'en-AU',
        localDate: '2026-10-15',
        weekStart: '2026-10-12',
        currentMonth: '2026-10',
        requiresSetup,
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
        requiresSetup,
        authenticated: false,
        actor: null,
      },
    }),
  );
}
for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`phone code entry is uppercase, keyboard usable and waits for adult consent at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize(viewport);
    await privatePhone(page);
    let claimed = false;
    let payload: unknown;
    const pending = {
      id: 'invitation_fixture',
      state: 'scanned',
      adultName: 'Rachael',
      phoneName: 'New phone',
      expiresAt: '2026-10-15T00:05:00Z',
    };
    await page.route('**/api/v1/auth/phones/pending', (route) =>
      route.fulfill({ json: claimed ? pending : null }),
    );
    await page.route('**/api/v1/auth/phones/invitation-claims', (route) => {
      payload = route.request().postDataJSON();
      claimed = true;
      return route.fulfill({ json: pending });
    });
    await page.goto('/today');
    await expect(page).toHaveTitle(/Hearth/);
    await expect(page.getByRole('heading', { name: 'Connect to Hearth' })).toBeVisible();
    const code = page.getByLabel('Connection code');
    await page.screenshot({ path: testInfo.outputPath('phone-six-letter-entry.png') });
    await code.fill('abc-def');
    await expect(code).toHaveValue('ABCDEF');
    await page.getByLabel('Phone name').fill('New phone');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Request connection' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Waiting for approval on the inviting phone.')).toBeVisible();
    expect(payload).toEqual({ code: 'ABCDEF', phoneName: 'New phone' });
    await expect(page.getByRole('button', { name: /Connect as/ })).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const audit = await new AxeBuilder({ page }).analyze();
    expect(
      audit.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
    ).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath('phone-code-waiting.png') });
    expect(errors).toEqual([]);
  });
}
test('first-owner access asks for a private QR, never a long key', async ({ page }, testInfo) => {
  await privatePhone(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'Set up Hearth' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Scan your private setup card' })).toBeVisible();
  await expect(page.getByLabel('Owner setup key')).toHaveCount(0);
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('phone-private-qr-guidance.png') });
});
