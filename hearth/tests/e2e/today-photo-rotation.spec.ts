import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
});

test('Today advances its featured photo after five visible minutes', async ({ page }) => {
  await accelerateTodayRotation(page, 200);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');

  const photo = page.locator('.today-photo');
  await expect(photo).toBeVisible();
  const initialUrl = await photo.getAttribute('data-photo-url');
  expect(initialUrl).not.toBeNull();

  await expect(photo).not.toHaveAttribute('data-photo-url', initialUrl!, { timeout: 1_000 });
});

test('the Photos pause control also freezes Today for this display session', async ({ page }) => {
  await accelerateTodayRotation(page, 120);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/photos');
  await page.getByRole('button', { name: 'Pause automatic photo rotation' }).click();
  await page.getByRole('link', { name: 'Today', exact: true }).click();

  const photo = page.locator('.today-photo');
  await expect(photo).toBeVisible();
  const pausedUrl = await photo.getAttribute('data-photo-url');
  expect(pausedUrl).not.toBeNull();
  await page.waitForTimeout(400);
  await expect(photo).toHaveAttribute('data-photo-url', pausedUrl!);

  await page.getByRole('link', { name: 'Photos', exact: true }).click();
  await page.getByRole('button', { name: 'Resume automatic photo rotation' }).click();
  await page.getByRole('link', { name: 'Today', exact: true }).click();
  const resumedUrl = await photo.getAttribute('data-photo-url');
  await expect(photo).not.toHaveAttribute('data-photo-url', resumedUrl!, { timeout: 1_000 });
});

test('reduced motion keeps the Today photo static', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await accelerateTodayRotation(page, 100);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');

  const photo = page.locator('.today-photo');
  await expect(photo).toBeVisible();
  const initialUrl = await photo.getAttribute('data-photo-url');
  expect(initialUrl).not.toBeNull();
  await page.waitForTimeout(350);
  await expect(photo).toHaveAttribute('data-photo-url', initialUrl!);
});

test('hidden time does not consume the Today photo interval', async ({ page }) => {
  await accelerateTodayRotation(page, 300);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');

  const photo = page.locator('.today-photo');
  await expect(photo).toBeVisible();
  const initialUrl = await photo.getAttribute('data-photo-url');
  expect(initialUrl).not.toBeNull();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(500);
  await expect(photo).toHaveAttribute('data-photo-url', initialUrl!);

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(photo).not.toHaveAttribute('data-photo-url', initialUrl!, { timeout: 1_000 });
});

async function accelerateTodayRotation(page: Page, delay: number): Promise<void> {
  await page.addInitScript((acceleratedDelay) => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      nativeSetTimeout(
        handler,
        timeout === 300_000 ? acceleratedDelay : timeout,
        ...args,
      )) as typeof window.setTimeout;
  }, delay);
}
