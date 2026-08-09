import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const screenshotDirectory = '/tmp/hearth-appearance-evidence';

test.beforeAll(async () => {
  await mkdir(screenshotDirectory, { recursive: true });
});

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
});

test('theme choices persist and Automatic follows the device setting', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/appearance');

  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Automatic/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.getByRole('radio', { name: /^Dark/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.getByRole('radio', { name: /^Dark/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('radio', { name: /^Automatic/ }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByText('This device currently uses dark mode.')).toBeVisible();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('evening dimming is separate, persistent and family-readable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/appearance');
  const dimming = page.getByRole('switch', { name: /Evening dimming/ });

  await expect(dimming).toHaveAttribute('aria-checked', 'false');
  await dimming.click();
  await expect(dimming).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-evening-dim', 'true');
  await expect(page.getByText(/does not run the Home Assistant Evening scene/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('switch', { name: /Evening dimming/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('remote navigation reaches Appearance, changes dimming and restores focus on Back', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/admin');
  await expect(page.locator('[data-focus-id="admin-household"]')).toBeFocused();

  for (let index = 0; index < 7; index += 1) await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focus-id="admin-appearance"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/appearance$/);
  await expect(page.locator('[data-focus-id="appearance-automatic"]')).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focus-id="appearance-dim"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-focus-id="appearance-dim"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator('[data-focus-id="admin-appearance"]')).toBeFocused();
});

test('television rail opens the per-display Appearance control', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');
  await expect(page.locator('[data-focus-id="today-chore-occurrence_school_bag"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-focus-id="nav-today"]')).toBeFocused();
  for (let index = 0; index < 7; index += 1) await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focus-id="nav-appearance"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/admin\/appearance$/);
  await expect(page.locator('[data-focus-id="appearance-automatic"]')).toBeFocused();
});

for (const path of ['/today', '/admin/appearance']) {
  test(`@a11y dark ${path} has no serious accessibility violations`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'hearth.appearance.v1',
        JSON.stringify({ theme: 'dark', eveningDimming: false }),
      );
    });
    await page.setViewportSize(
      path === '/today' ? { width: 1920, height: 1080 } : { width: 390, height: 844 },
    );
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
  });
}

test('@visual dark Today and phone Appearance', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'hearth.appearance.v1',
      JSON.stringify({ theme: 'dark', eveningDimming: false }),
    );
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await page.screenshot({
    path: resolve(screenshotDirectory, 'dark-today-tv-1080.png'),
    animations: 'disabled',
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/appearance');
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
  await page.screenshot({
    path: resolve(screenshotDirectory, 'dark-appearance-phone.png'),
    animations: 'disabled',
    fullPage: true,
  });
});

const darkViewportCases = [
  { name: 'today-tv-4k', path: '/today', heading: 'Today', width: 3840, height: 2160 },
  { name: 'week-tv-1080', path: '/week', heading: /week/i, width: 1920, height: 1080 },
  { name: 'month-tv-1366', path: '/month', heading: 'August', width: 1366, height: 768 },
  { name: 'chores-tv-1080', path: '/chores', heading: 'Chores', width: 1920, height: 1080 },
  { name: 'photos-tv-1080', path: '/photos', heading: 'Photos', width: 1920, height: 1080 },
  { name: 'home-tv-1080', path: '/home', heading: 'Home', width: 1920, height: 1080 },
  { name: 'today-phone-portrait', path: '/today', heading: 'Today', width: 390, height: 844 },
  {
    name: 'pocket-money-phone-portrait',
    path: '/admin/pocket-money',
    heading: 'Pocket money',
    width: 390,
    height: 844,
  },
  {
    name: 'week-phone-landscape',
    path: '/week',
    heading: /week/i,
    width: 844,
    height: 390,
  },
] as const;

for (const viewport of darkViewportCases) {
  test(`@visual dark ${viewport.name}`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'hearth.appearance.v1',
        JSON.stringify({ theme: 'dark', eveningDimming: false }),
      );
    });
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(viewport.path);
    await expect(page.getByRole('heading', { name: viewport.heading })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: resolve(screenshotDirectory, `dark-${viewport.name}.png`),
      animations: 'disabled',
    });
  });
}
