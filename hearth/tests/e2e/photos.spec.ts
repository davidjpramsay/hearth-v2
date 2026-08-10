import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { captureEvidence } from './visualEvidence';

const evidence = resolve('docs/evidence/phase-7/screenshots');

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
});

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
});

test('remote-only navigation opens Photos, selects portrait content, and exits ambient immediately', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');
  await expect(page.locator('[data-focus-id="today-chore-occurrence_school_bag"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  for (let step = 0; step < 6; step += 1) await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focus-id="nav-photos"]')).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();
  const breakfast = page.locator('[data-focus-id="photos-thumb-photo_family_breakfast"]');
  await expect(breakfast).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  const portrait = page.locator('[data-focus-id="photos-thumb-photo_garden_morning"]');
  await expect(portrait).toBeFocused();
  const portraitBox = await portrait.boundingBox();
  expect(portraitBox?.width).toBeGreaterThanOrEqual(250);
  expect(portraitBox?.height).toBeGreaterThanOrEqual(250);
  await expect(portrait.locator('img')).toHaveCSS('object-fit', 'cover');
  await page.keyboard.press('Enter');
  const portraitFeature = page.locator('.photos-hero--portrait');
  await expect(portraitFeature).toBeVisible();
  const portraitFeatureBox = await portraitFeature.boundingBox();
  expect(portraitFeatureBox?.height).toBeGreaterThan((portraitFeatureBox?.width ?? 0) * 1.4);
  await expect(page.locator('.photos-hero__image')).toHaveCSS('object-fit', 'cover');
  await expect(page.locator('.photos-hero figcaption')).toHaveCount(0);
  await expect(page.locator('.photos-hero')).not.toContainText(
    'Ezra and Maya water herbs in the family garden.',
  );

  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-focus-id="photos-start-ambient"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: /Ambient family photo/ })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('dialog', { name: /Ambient family photo/ })).toHaveCount(0);
  await expect(page.locator('[data-focus-id="photos-start-ambient"]')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.locator('[data-focus-id="nav-photos"]')).toBeFocused();
});

test('the collage uses each photo once, fits both orientations and rotates calmly', async ({
  page,
}) => {
  const consoleProblems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleProblems.push(message.text());
    }
  });
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      nativeSetTimeout(
        handler,
        timeout === 30_000 ? 600 : timeout,
        ...args,
      )) as typeof window.setTimeout;
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/photos');
  await expect(page).toHaveTitle(/Hearth/);
  await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();
  await expect(page.getByText('Automatic · every 30 seconds')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause automatic photo rotation' })).toBeVisible();
  await expect(page.locator('.photos-rotation-progress')).toBeVisible();

  const tiles = page.locator('.photo-collage__tile');
  await expect(tiles).toHaveCount(5);
  const photoIds = await tiles.evaluateAll((elements) =>
    elements.map((element) => (element as HTMLElement).dataset.photoId),
  );
  expect(new Set(photoIds).size).toBe(5);

  const landscapeFeature = page.locator('.photo-collage__tile--feature');
  const portraitSupport = page.locator('[data-photo-id="photo_garden_morning"]');
  const landscapeSupport = page.locator('.photo-collage__tile--support-1');
  const [featureBox, portraitBox, landscapeBox] = await Promise.all([
    landscapeFeature.boundingBox(),
    portraitSupport.boundingBox(),
    landscapeSupport.boundingBox(),
  ]);
  expect(featureBox?.width).toBeGreaterThan((landscapeBox?.width ?? 0) * 1.8);
  expect(featureBox?.height).toBeGreaterThan((landscapeBox?.height ?? 0) * 1.8);
  expect(portraitBox?.width).toBeGreaterThanOrEqual(250);
  expect(portraitBox?.height).toBeGreaterThanOrEqual(250);

  for (const photoId of photoIds) {
    await page.locator(`[data-photo-id="${photoId}"]`).click();
    await expect(page.locator('.photo-collage__tile--feature')).toHaveAttribute(
      'data-photo-id',
      photoId!,
    );
    await expect(
      page.locator(
        photoId === 'photo_garden_morning'
          ? '.photos-collage--portrait'
          : '.photos-collage--landscape',
      ),
    ).toBeVisible();
    const boxes = await tiles.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { height: rect.height, width: rect.width };
      }),
    );
    expect(boxes.every((box) => box.width >= 250 && box.height >= 250)).toBe(true);
  }

  const overflow = await page.locator('.photos-collage').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const phoneBoxes = await page.locator('.photo-collage__tile').evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { height: rect.height, width: rect.width };
    }),
  );
  expect(phoneBoxes.every((box) => box.width >= 130 && box.height >= 130)).toBe(true);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.reload();
  const landscapePhoneTiles = page.locator('.photo-collage__tile');
  await expect(landscapePhoneTiles).toHaveCount(3);
  const landscapePhoneBoxes = await landscapePhoneTiles.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { height: rect.height, width: rect.width };
    }),
  );
  expect(landscapePhoneBoxes.every((box) => box.width >= 160 && box.height >= 200)).toBe(true);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.reload();
  await expect(page.locator('.photos-hero')).toHaveAttribute(
    'data-photo-id',
    'photo_family_breakfast',
  );
  await expect(page.locator('.photos-collage--landscape')).toBeVisible();
  await expect(page.locator('.photos-hero')).not.toHaveAttribute(
    'data-photo-id',
    'photo_family_breakfast',
    { timeout: 2_000 },
  );
  await expect(page.locator('.photos-hero')).toHaveAttribute(
    'data-photo-id',
    'photo_park_football',
  );
  await expect(page.locator('.photos-hero')).toHaveAttribute(
    'data-photo-id',
    'photo_garden_morning',
    { timeout: 2_000 },
  );
  await expect(page.locator('.photos-collage--portrait')).toBeVisible();
  await captureEvidence(page, {
    animations: 'disabled',
    path: resolve(evidence, 'photos-auto-portrait-tv-1080.png'),
  });
  await page.getByRole('button', { name: 'Pause automatic photo rotation' }).click();
  await expect(page.getByText('Automatic rotation paused')).toBeVisible();
  const pausedPhotoId = await page.locator('.photos-hero').getAttribute('data-photo-id');
  await page.waitForTimeout(900);
  await expect(page.locator('.photos-hero')).toHaveAttribute('data-photo-id', pausedPhotoId!);
  await page.getByRole('button', { name: 'Resume automatic photo rotation' }).click();
  await expect(page.getByText('Automatic · every 30 seconds')).toBeVisible();
  await expect(page.locator('.photos-rotation-progress')).toBeVisible();
  await expect(page.locator('.photos-hero')).not.toHaveAttribute('data-photo-id', pausedPhotoId!, {
    timeout: 2_000,
  });
  await page.locator('[data-photo-id="photo_family_breakfast"]').click();
  await page.waitForTimeout(350);
  await expect(page.locator('.photos-hero')).toHaveAttribute(
    'data-photo-id',
    'photo_family_breakfast',
  );
  await expect(page.locator('.photos-hero')).not.toHaveAttribute(
    'data-photo-id',
    'photo_family_breakfast',
    { timeout: 2_000 },
  );
  expect(consoleProblems).toEqual([]);
});

test('reduced motion keeps the Photos collage still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      nativeSetTimeout(
        handler,
        timeout === 30_000 ? 100 : timeout,
        ...args,
      )) as typeof window.setTimeout;
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/photos');
  await expect(page.getByText('Automatic · every 30 seconds')).toHaveCount(0);
  await expect(page.locator('.photos-rotation-progress')).toHaveCount(0);
  await expect(page.locator('.photos-hero')).toHaveAttribute(
    'data-photo-id',
    'photo_family_breakfast',
  );
  await page.waitForTimeout(350);
  await expect(page.locator('.photos-hero')).toHaveAttribute(
    'data-photo-id',
    'photo_family_breakfast',
  );
});

test('Photos has deliberate empty, cached-unavailable and failure/retry states', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/photos?scenario=empty');
  await expect(page.getByRole('heading', { name: 'No family photos selected' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show demo photos' })).toBeVisible();

  await page.goto('/photos?scenario=unavailable');
  await expect(
    page.getByRole('status').filter({ hasText: 'Showing saved family photos' }),
  ).toBeVisible();
  await expect(page.locator('.photos-grid img')).toHaveCount(5);

  await page.goto('/photos?scenario=fail-next');
  await expect(page.getByRole('heading', { name: 'Hearth couldn’t load this view' })).toBeVisible();
  await page.getByRole('button', { name: /Try again/ }).click();
  await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();
  await expect(page.locator('.photos-grid img')).toHaveCount(5);
});

test('cached Photos remain visible through a real browser offline event', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/photos');
  const photos = page.locator('.photos-grid img');
  await expect(photos).toHaveCount(5);
  await expect
    .poll(() =>
      photos.evaluateAll((images) =>
        images.every(
          (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
        ),
      ),
    )
    .toBe(true);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(
    page.getByRole('status').filter({ hasText: 'Showing saved family photos' }),
  ).toBeVisible();
  await expect(photos).toHaveCount(5);
  await context.setOffline(false);
});

test('a corrupt display derivative fails without revealing its URL', async ({ page }) => {
  await page.route('**/demo/photos/bush-camping.webp', (route) => route.abort());
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/photos');
  await page.locator('[data-focus-id="photos-thumb-photo_bush_camping"]').click();
  await page.getByRole('button', { name: 'Start ambient' }).click();
  const fallback = page
    .getByRole('dialog', { name: /Ambient family photo/ })
    .getByRole('img', { name: /toast marshmallows.*unavailable/i });
  await expect(fallback).toBeVisible();
  await expect(page.locator('body')).not.toContainText('bush-camping.webp');
});

test('@visual phone administration reports and refreshes the safe photo index', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/photos');
  await expect(page.getByRole('heading', { name: 'Photo source' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Scan now' })).toBeFocused();
  await expect(page.getByText('Read-only Synology folder')).toBeVisible();
  await expect(page.getByText('5 ready')).toBeVisible();
  await expect(page.getByText('3 Aug 2026, 7:30 am')).toBeVisible();
  await page.getByRole('button', { name: 'Scan now' }).click();
  await expect(page.getByRole('status')).toContainText('Photo folder checked. 5 photos are ready.');
  await expect(page.getByText('Apple Shared Album link')).toBeVisible();
  await expect(page.getByText(/not a supported private Hearth feed/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose family photos' })).toBeVisible();
  await expect(page.getByText('5 showing')).toBeVisible();
  await expect(page.getByText('0 hidden')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('/volume1');
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await captureEvidence(page, {
    path: resolve(evidence, 'photos-admin-phone.png'),
    animations: 'disabled',
  });

  const curationHeading = page.getByRole('heading', { name: 'Choose family photos' });
  const firstFavourite = page.locator(
    '[data-focus-id="photo-curation-favourite-photo_coastal_picnic"]',
  );
  await curationHeading.scrollIntoViewIfNeeded();
  await captureEvidence(page, {
    path: resolve(evidence, 'photos-curation-phone.png'),
    animations: 'disabled',
  });
  await firstFavourite.scrollIntoViewIfNeeded();
  await captureEvidence(page, {
    path: resolve(evidence, 'photos-curation-controls-phone.png'),
    animations: 'disabled',
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Scan now' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(firstFavourite).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.locator('[data-focus-id="photo-curation-hide-photo_coastal_picnic"]'),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Photo hidden from Today, Photos and ambient mode.' }),
  ).toBeVisible();
  await expect(page.getByText('4 showing')).toBeVisible();
  await expect(page.getByText('1 hidden')).toBeVisible();
  const firstRestore = page.locator(
    '[data-focus-id="photo-curation-restore-photo_coastal_picnic"]',
  );
  await expect(firstRestore).toBeFocused();
  await firstRestore.scrollIntoViewIfNeeded();
  await captureEvidence(page, {
    path: resolve(evidence, 'photos-curation-hidden-phone.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('status').filter({ hasText: 'Photo restored to the family rotation.' }),
  ).toBeVisible();
  await expect(firstFavourite).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(firstFavourite).toHaveAttribute('aria-pressed', 'false');
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Photo will still rotate, after family favourites.' }),
  ).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(firstFavourite).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(firstRestore).toBeFocused();
  for (let step = 0; step < 5; step += 1) await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('link', { name: 'View family photos' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();
  await expect(page.locator('.photo-collage__tile')).toHaveCount(4);
  await expect(page.locator('[data-photo-id="photo_coastal_picnic"]')).toHaveCount(0);
});

test('@visual photo curation remains calm in dark phone landscape', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/admin/photos');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const heading = page.getByRole('heading', { name: 'Choose family photos' });
  await heading.scrollIntoViewIfNeeded();
  await expect(page.locator('.photo-curation-card')).toHaveCount(5);
  const overflow = await page.locator('.photo-curation__grid').evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  await captureEvidence(page, {
    path: resolve(evidence, 'photos-curation-dark-phone-landscape.png'),
    animations: 'disabled',
  });
});

for (const viewport of [
  { name: 'tv-4k', width: 3840, height: 2160 },
  { name: 'tv-1080', width: 1920, height: 1080 },
  { name: 'tv-1366', width: 1366, height: 768 },
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
] as const) {
  test(`@visual Photos at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/photos');
    await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();
    await expect(page.locator('.photos-grid img')).toHaveCount(
      viewport.name === 'phone-landscape' ? 3 : 5,
    );
    await captureEvidence(page, {
      path: resolve(evidence, `photos-${viewport.name}.png`),
      animations: 'disabled',
    });
  });
}

test('@visual Photos empty, unavailable, failure, portrait and ambient states', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/photos?scenario=empty');
  await expect(page.getByRole('heading', { name: 'No family photos selected' })).toBeVisible();
  await captureEvidence(page, {
    path: resolve(evidence, 'photos-state-empty.png'),
    animations: 'disabled',
  });

  await page.goto('/photos?scenario=unavailable');
  await expect(
    page.getByRole('status').filter({ hasText: 'Showing saved family photos' }),
  ).toBeVisible();
  await captureEvidence(page, {
    path: resolve(evidence, 'photos-state-unavailable.png'),
    animations: 'disabled',
  });

  await page.goto('/photos?scenario=fail-next');
  await expect(page.getByRole('heading', { name: 'Hearth couldn’t load this view' })).toBeVisible();
  await captureEvidence(page, {
    path: resolve(evidence, 'photos-state-failure.png'),
    animations: 'disabled',
  });

  await page.goto('/photos');
  await page.locator('[data-focus-id="photos-thumb-photo_garden_morning"]').click();
  await expect(page.locator('.photos-hero--portrait')).toBeVisible();
  await expect(page.locator('.photos-hero__image')).toHaveAttribute(
    'src',
    '/demo/photos/garden-morning.webp',
  );
  await expect
    .poll(() =>
      page
        .locator('.photos-hero__image')
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await captureEvidence(page, {
    path: resolve(evidence, 'photos-portrait-selected.png'),
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Start ambient' }).click();
  await expect(page.getByRole('dialog', { name: /Ambient family photo/ })).toBeVisible();
  await captureEvidence(page, {
    path: resolve(evidence, 'photos-ambient.png'),
    animations: 'disabled',
  });
});

for (const viewport of [
  { name: 'tv', width: 1920, height: 1080 },
  { name: 'phone', width: 390, height: 844 },
] as const) {
  test(`@a11y Photos has no serious accessibility violations on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/photos');
    await expect(page.getByRole('heading', { name: 'Photos' })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
  });
}
