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
    test(`Indoors fits ${viewport.width}x${viewport.height} in ${theme} with range and Back navigation`, async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/weather?view=indoors');
      await expect(page).toHaveTitle('Hearth');
      await expect(page.getByRole('heading', { name: 'Family room', exact: true })).toBeVisible();
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'Temperature', exact: true })).toContainText(
        '21.4°C',
      );
      await expect(page.getByRole('region', { name: 'Humidity', exact: true })).toContainText(
        '53%',
      );
      await page.getByRole('button', { name: 'Year', exact: true }).click();
      await expect(page).toHaveURL(/period=year/);
      await expect(page.getByText('Past 365 days · Daily averages')).toBeVisible();
      await expect(page.getByRole('img', { name: /Temperature history/ })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('button', { name: 'Year', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      const metrics = await page.locator('.indoor-screen').evaluate((element) => ({
        horizontal: document.documentElement.scrollWidth > innerWidth + 1,
        scroll: element.scrollHeight - element.clientHeight,
        body: document.documentElement.scrollHeight - innerHeight,
      }));
      expect(metrics.horizontal).toBe(false);
      if (viewport.width >= 1200) {
        expect(metrics.scroll).toBeLessThanOrEqual(2);
        expect(metrics.body).toBeLessThanOrEqual(2);
      }
      if (viewport.width === 390 || viewport.width === 1920)
        await page.screenshot({
          path: info.outputPath(`indoors-${theme}-${viewport.width}.png`),
          fullPage: viewport.width === 390,
        });
      await page.getByRole('link', { name: 'Outdoors', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Temperature', exact: true })).toBeVisible();
      await page.goBack();
      await expect(page.getByRole('heading', { name: 'Family room', exact: true })).toBeVisible();
      if (viewport.width === 390 || viewport.width === 1920) {
        const results = await new AxeBuilder({ page }).analyze();
        expect(
          results.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
        ).toEqual([]);
      }
      expect(errors).toEqual([]);
    });
  }
}
test('Indoors D-pad controls have an exit to Weather and the menu', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/weather?view=indoors');
  const day = page.getByRole('button', { name: 'Day', exact: true });
  await expect(day).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Week', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/period=week/);
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('link', { name: 'Indoors', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('link', { name: 'Outdoors', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-focus-id="nav-weather"]')).toBeFocused();
});
test('indoor settings save named selections and keep source credentials out of the page after testing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/connections/indoor-sensors');
  await page.getByRole('button', { name: 'Replace source', exact: true }).click();
  await page
    .getByLabel('Home Assistant access token', { exact: true })
    .fill('fictional-test-token-never-real');
  await page.getByRole('button', { name: 'Check sensors', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add room', exact: true })).toBeVisible();
  await expect(page.getByLabel('Home Assistant access token', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add room', exact: true }).click();
  await page.getByLabel('Room 1 name', { exact: true }).fill('Play room');
  await page
    .getByLabel('Room 1 temperature', { exact: true })
    .selectOption({ label: 'Family room temperature' });
  await page
    .getByLabel('Room 1 humidity', { exact: true })
    .selectOption({ label: 'Family room humidity' });
  await page.getByRole('button', { name: 'Save sensors', exact: true }).click();
  await expect(page.getByText('Indoor sensors saved.', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('fictional-test-token-never-real');
  await page.goto('/weather?view=indoors');
  await expect(page.getByRole('heading', { name: 'Play room', exact: true })).toBeVisible();
});
test('missing history and unavailable sensors remain explicit and never become zero', async ({
  page,
}) => {
  await page.route('**/indoor-climate?period=*', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.status = 'partial';
    body.rooms[0].temperature = {
      value: null,
      reportedAt: null,
      status: 'unavailable',
      historyStatus: 'unavailable',
      samples: [],
    };
    await route.fulfill({ response, json: body });
  });
  try {
    await page.goto('/weather?view=indoors');
    await expect(page.getByRole('region', { name: 'Temperature', exact: true })).toContainText(
      'Unavailable',
    );
    await expect(
      page.getByText('Some readings or history are unavailable. Available readings are shown.'),
    ).toBeVisible();
    await expect(page.getByRole('region', { name: 'Humidity', exact: true })).toContainText('53%');
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
  }
});
test('a lost settings response retries the exact accepted request and keeps the draft locked', async ({
  page,
}) => {
  await page.goto('/admin/connections/indoor-sensors');
  await page.getByRole('button', { name: 'Choose sensors', exact: true }).click();
  const requests: unknown[] = [];
  await page.route('**/indoor-climate-settings', async (route) => {
    if (route.request().method() !== 'PUT') {
      await route.continue();
      return;
    }
    requests.push(route.request().postDataJSON());
    const response = await route.fetch();
    if (requests.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  try {
    await page.getByLabel('Room 1 name', { exact: true }).fill('Reading room');
    await page.getByRole('button', { name: 'Save sensors', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retry exact save', exact: true })).toBeVisible();
    await expect(page.getByLabel('Room 1 name', { exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Retry exact save', exact: true }).click();
    await expect(page.getByText('Indoor sensors saved.', { exact: true })).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toEqual(requests[0]);
  } finally {
    await page.unrouteAll({ behavior: 'wait' });
  }
});
