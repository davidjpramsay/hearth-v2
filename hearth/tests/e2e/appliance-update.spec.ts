import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import type { ApplianceUpdateStatus } from '@hearth/shared';

test.beforeEach(async ({ page, request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
  await page.route('**/api/v1/runtime', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), mode: 'private' } });
  });
  await page.route('**/api/v1/auth/status', (route) =>
    route.fulfill({
      json: {
        mode: 'private',
        configured: true,
        secureOrigin: true,
        requiresSetup: false,
        authenticated: true,
        actor: { id: 'member_maya', displayName: 'Maya', role: 'adult' },
      },
    }),
  );
});

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
]) {
  test(`completed appliance updates stay tidy and allow the next release at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.addInitScript(() =>
      localStorage.setItem(
        'hearth.appearance.v1',
        JSON.stringify({ theme: 'dark', eveningDimming: false }),
      ),
    );
    const status: ApplianceUpdateStatus = {
      supported: true,
      platform: 'synology',
      installedVersion: 'a'.repeat(40),
      checkedAt: '2026-08-03T00:30:00.000Z',
      availableRelease: {
        version: 'a'.repeat(40),
        publishedAt: '2026-08-03T00:00:00.000Z',
        summary: 'Calendar and update improvements',
      },
      updateAvailable: false,
      canInstall: false,
      checks: {
        internet: { state: 'ready', message: 'Ready.' },
        storage: { state: 'ready', message: 'Ready.' },
        power: { state: 'unavailable', message: 'Power protection cannot be checked.' },
      },
      operation: {
        phase: 'succeeded',
        progress: 100,
        message: 'Update installed and checked.',
        targetVersion: 'a'.repeat(40),
        startedAt: '2026-08-03T00:00:00.000Z',
        completedAt: '2026-08-03T00:10:00.000Z',
      },
    };
    await page.route('**/appliance-update', (route) => route.fulfill({ json: status }));
    await page.goto('/admin/system');
    const card = page.getByRole('region', { name: 'Hearth update' });
    await expect(card.getByText('Update installed and checked.')).toBeVisible();
    await expect(card.getByRole('progressbar')).toHaveCount(0);
    await expect(card.getByText('Installed aaaaaaaa', { exact: true })).toBeVisible();
    await expect(card.getByRole('button')).toHaveCount(0);
    await card.screenshot({ path: testInfo.outputPath('installed-update.png') });

    status.availableRelease = { ...status.availableRelease!, version: 'b'.repeat(40) };
    status.canInstall = true;
    status.updateAvailable = true;
    await page.reload();
    const install = card.getByRole('button', { name: 'Install update' });
    await expect(install).toBeEnabled();
    await install.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('link', { name: 'Manage connections' })).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(install).toBeFocused();
    await expect(card.getByText('Available', { exact: true })).toBeVisible();
    await expect(card.getByRole('progressbar')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
      (await new AxeBuilder({ page }).analyze()).violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
    await card.screenshot({ path: testInfo.outputPath('next-update.png') });
    expect(errors).toEqual([]);
  });
}
