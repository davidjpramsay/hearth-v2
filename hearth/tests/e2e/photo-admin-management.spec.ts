import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  expect((await request.post('http://127.0.0.1:4310/api/v1/demo/reset')).ok()).toBe(true);
});
for (const profile of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'narrow phone', width: 320, height: 700 },
  { name: 'iPad', width: 820, height: 1180 },
  { name: 'desktop', width: 1366, height: 1024 },
])
  for (const theme of ['light', 'dark'] as const) {
    test(`photo management stays compact on ${profile.name} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width: profile.width, height: profile.height });
      await page.emulateMedia({ colorScheme: theme });
      await page.route('**/api/v1/households/*/photo-source', async (route) => {
        const response = await route.fetch();
        const source = await response.json();
        const original = source.photos[0];
        source.photos = Array.from({ length: 130 }, (_, i) => ({
          ...original,
          id: `photo_fixture_${i}`,
          alt: `Fictional family photo ${i + 1}${i === 1 ? ' from a long day outdoors with the whole family' : ''}`,
          hidden: i % 10 === 0,
          favourite: i % 3 === 0,
        }));
        source.indexedFileCount = source.managedPhotoCount = 130;
        source.collection.photoCount = source.visiblePhotoCount = 117;
        source.hiddenPhotoCount = 13;
        await route.fulfill({ response, json: source });
      });
      await page.goto('/admin/photos');
      await expect(page).toHaveTitle('Hearth');
      await expect(page.getByRole('heading', { name: 'Manage photos' })).toBeVisible();
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      await expect(page.getByText(/MB per photo/)).toHaveCount(0);
      if (profile.name === 'phone' && theme === 'light')
        await page.screenshot({ path: info.outputPath('photo-upload-settings.png') });
      const cards = page.locator('.photo-curation-card');
      await expect(cards).toHaveCount(48);
      await cards.first().scrollIntoViewIfNeeded();
      const first = (await cards.nth(0).boundingBox())!;
      const second = (await cards.nth(1).boundingBox())!;
      expect(Math.abs(first.y - second.y)).toBeLessThanOrEqual(1);
      expect(second.x).toBeGreaterThan(first.x + first.width);
      const firstActions = (await cards
        .nth(0)
        .locator('.photo-curation-card__actions')
        .boundingBox())!;
      const secondActions = (await cards
        .nth(1)
        .locator('.photo-curation-card__actions')
        .boundingBox())!;
      expect(
        Math.abs(firstActions.y + firstActions.height - secondActions.y - secondActions.height),
      ).toBeLessThanOrEqual(1);
      await expect(cards.first().locator('img')).toHaveCSS('object-fit', 'contain');
      for (const button of await cards.first().getByRole('button').all()) {
        const bounds = (await button.boundingBox())!;
        expect(bounds.height).toBeGreaterThanOrEqual(44);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(first.x + first.width);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: info.outputPath('photo-gallery.png') });
      await page.getByRole('button', { name: 'Next photos' }).click();
      await expect(cards.first()).toContainText('Fictional family photo 49');
      await page.getByRole('button', { name: 'Hidden', exact: true }).click();
      await expect(cards).toHaveCount(13);
      await page.getByRole('button', { name: 'All photos', exact: true }).click();
      await page.getByRole('button', { name: 'Select photos', exact: true }).click();
      await page.getByRole('button', { name: 'Select page', exact: true }).click();
      await expect(page.getByText('48 selected', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Next photos' }).click();
      await page.getByRole('button', { name: 'Select photo: Fictional family photo 49' }).click();
      await expect(page.getByText('49 selected', { exact: true })).toBeVisible();
      if (profile.name === 'phone') {
        const audit = await new AxeBuilder({ page }).analyze();
        expect(
          audit.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
        ).toEqual([]);
      }
      expect(errors).toEqual([]);
    });
  }

test('batch queue overlaps transfers, pauses future photos and retries only an ambiguous failure', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requests: Array<{ id: string; body: string | null }> = [];
  let failedId: string | null = null;
  let replayed = false;
  const attempts = new Map<string, number>();
  await page.route('**/api/v1/households/*/photo-uploads', async (route) => {
    const id = route.request().headers()['x-hearth-request-id']!;
    requests.push({ id, body: route.request().postData() });
    const count = (attempts.get(id) ?? 0) + 1;
    attempts.set(id, count);
    if (requests.length <= 2) await gate;
    if (attempts.size === 3 && count === 1 && failedId === null) {
      failedId = id;
      // Accept the command, then lose its response; exact retry must not duplicate it.
      const accepted = await route.fetch();
      expect((await accepted.json()).replayed).toBe(false);
      await route.abort();
    } else if (id === failedId) {
      const replay = await route.fetch();
      replayed = (await replay.json()).replayed;
      await route.fulfill({ response: replay });
    } else await route.continue();
  });
  await page.goto('/admin/photos');
  await expect(page.getByText(/MB per photo/)).toHaveCount(0);
  await page.locator('input[type=file]').setInputFiles(
    [1, 2, 3, 4].map((i) => ({
      name: `Local photo ${i}.jpg`,
      mimeType: 'image/jpeg',
      buffer: Buffer.from(`photo-${i}`),
    })),
  );
  await expect.poll(() => requests.length).toBe(2);
  await page.getByRole('button', { name: 'Pause queue' }).click();
  release();
  await expect(
    page.getByRole('status').filter({ hasText: '2 of 4 photos finished · paused' }),
  ).toBeVisible();
  expect(requests).toHaveLength(2);
  await page.screenshot({ path: test.info().outputPath('photo-upload-queue.png') });
  await page.getByRole('button', { name: 'Continue uploading' }).click();
  await expect(page.getByRole('button', { name: 'Retry failed photos' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '3 photos added.' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry failed photos' }).click();
  await expect(page.getByRole('status').filter({ hasText: '4 photos added.' })).toBeVisible();
  expect(requests).toHaveLength(5);
  const failed = requests.filter((item) => item.id === failedId);
  expect(replayed).toBe(true);
  expect(failed).toHaveLength(2);
  expect(failed[0]).toEqual(failed[1]);
  expect(JSON.stringify(requests)).not.toContain('Local photo');
});
