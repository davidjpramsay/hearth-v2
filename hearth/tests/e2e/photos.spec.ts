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

  await expect(page.getByRole('heading', { name: 'Photos', exact: true })).toBeVisible();
  const breakfast = page.locator('[data-focus-id="photos-thumb-photo_family_breakfast"]');
  await expect(breakfast).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const portrait = page.locator('[data-focus-id="photos-thumb-photo_garden_morning"]');
  await expect(portrait).toBeFocused();
  const portraitBox = await portrait.boundingBox();
  expect(portraitBox?.width).toBeGreaterThanOrEqual(250);
  expect(portraitBox?.height).toBeGreaterThanOrEqual(250);
  await expect(portrait.locator('img')).toHaveCSS('object-fit', 'contain');
  await page.keyboard.press('Enter');
  const portraitFeature = page.locator('.photos-hero--portrait');
  await expect(portraitFeature).toBeVisible();
  const portraitFeatureBox = await portraitFeature.boundingBox();
  expect(portraitFeatureBox?.height).toBeGreaterThan((portraitFeatureBox?.width ?? 0) * 1.4);
  await expect(page.locator('.photos-hero__image')).toHaveCSS('object-fit', 'contain');
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
        timeout === 45_000 ? 600 : timeout,
        ...args,
      )) as typeof window.setTimeout;
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/photos');
  await expect(page).toHaveTitle(/Hearth/);
  await expect(page.getByRole('heading', { name: 'Photos', exact: true })).toBeVisible();
  await expect(page.locator('.photos-rotation-note')).toHaveAttribute(
    'aria-label',
    /Photos change automatically every 45 seconds\./,
  );
  await expect(page.getByRole('button', { name: 'Pause automatic photo rotation' })).toBeVisible();
  await expect(page.locator('.photos-rotation-progress')).toBeVisible();

  const tiles = page.locator('.photo-collage__tile');
  await expect(tiles).toHaveCount(5);
  const photoIds = await tiles.evaluateAll((elements) =>
    elements.map((element) => (element as HTMLElement).dataset.photoId),
  );
  expect(new Set(photoIds).size).toBe(5);

  const portraitSupport = page.locator('[data-photo-id="photo_garden_morning"]');
  const portraitBox = await portraitSupport.boundingBox();
  expect(portraitBox?.width).toBeGreaterThanOrEqual(250);
  expect(portraitBox?.height).toBeGreaterThanOrEqual((portraitBox?.width ?? 0) * 1.5);
  await expect(portraitSupport.locator('img')).toHaveCSS('object-fit', 'contain');

  const landscapeBoxes = await page
    .locator('[data-photo-orientation="landscape"]')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { height: rect.height, width: rect.width };
      }),
    );
  expect(landscapeBoxes.every((box) => box.width > box.height * 1.25)).toBe(true);
  await captureEvidence(page, {
    animations: 'disabled',
    path: resolve(evidence, 'photos-adaptive-mixed-tv-1080.png'),
  });

  await page.getByRole('button', { name: 'Pause automatic photo rotation' }).click();
  await expect(page.locator('.photos-rotation-note')).toHaveAttribute(
    'aria-label',
    /Automatic photo rotation paused\./,
  );
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
        return {
          height: rect.height,
          nativeRatio: Number((element as HTMLElement).dataset.photoRatio),
          objectFit: window.getComputedStyle(element.querySelector('img')!).objectFit,
          photoId: (element as HTMLElement).dataset.photoId,
          width: rect.width,
        };
      }),
    );
    for (const box of boxes) {
      expect(
        Math.min(box.width, box.height),
        `${photoId}: ${box.photoId} should not collapse into a thin strip`,
      ).toBeGreaterThanOrEqual(130);
      expect(box.objectFit, `${photoId}: ${box.photoId} should never be cropped`).toBe('contain');
      expect(
        box.nativeRatio >= 1 ? box.width / box.height : box.height / box.width,
        `${photoId}: ${box.photoId} should retain its native orientation`,
      ).toBeGreaterThan(1.1);
    }
  }
  await page.getByRole('button', { name: 'Resume automatic photo rotation' }).click();
  await expect(page.locator('.photos-rotation-note')).toHaveAttribute(
    'aria-label',
    /Photos change automatically every 45 seconds\./,
  );

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
  expect(landscapePhoneBoxes.every((box) => box.width >= 90 && box.height >= 65)).toBe(true);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.reload();
  await expect(page.locator('.photos-hero')).toHaveAttribute(
    'data-photo-id',
    'photo_family_breakfast',
  );
  await expect(page.locator('.photos-hero')).toBeFocused();
  await expect(page.locator('.photos-collage--landscape')).toBeVisible();
  await expect(page.locator('.photos-collage--feature-start')).toBeVisible();
  await expect(page.locator('.photos-hero')).not.toHaveAttribute(
    'data-photo-id',
    'photo_family_breakfast',
    { timeout: 2_000 },
  );
  await expect(page.locator('[data-focus-id="photos-thumb-photo_family_breakfast"]')).toBeFocused();
  await expect(page.locator('.photos-hero')).toHaveAttribute(
    'data-photo-id',
    'photo_park_football',
  );
  await expect(page.locator('.photos-collage--feature-end')).toBeVisible();
  const mirroredFeatureBox = await page.locator('.photos-hero').boundingBox();
  expect((mirroredFeatureBox?.x ?? 0) + (mirroredFeatureBox?.width ?? 0) / 2).toBeGreaterThan(960);
  await captureEvidence(page, {
    animations: 'disabled',
    path: resolve(evidence, 'photos-auto-mirrored-tv-1080.png'),
  });
  await page.getByRole('button', { name: 'Pause automatic photo rotation' }).click();
  await expect(page.locator('.photos-rotation-note')).toHaveAttribute(
    'aria-label',
    /Automatic photo rotation paused\./,
  );
  await page.locator('.photos-hero').focus();
  const leftTargetFocusId = await page.locator('.photos-hero').getAttribute('data-focus-left');
  expect(leftTargetFocusId).not.toBeNull();
  await page.keyboard.press('ArrowLeft');
  const leftTarget = page.locator(`[data-focus-id="${leftTargetFocusId}"]`);
  await expect(leftTarget).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.photos-hero')).toBeFocused();
  await page.getByRole('button', { name: 'Resume automatic photo rotation' }).click();
  await expect(page.locator('.photos-rotation-note')).toHaveAttribute(
    'aria-label',
    /Photos change automatically every 45 seconds\./,
  );
  await page.locator('.photos-hero').focus();
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
  await expect(page.locator('.photos-rotation-note')).toHaveAttribute(
    'aria-label',
    /Automatic photo rotation paused\./,
  );
  const pausedPhotoId = await page.locator('.photos-hero').getAttribute('data-photo-id');
  await page.waitForTimeout(900);
  await expect(page.locator('.photos-hero')).toHaveAttribute('data-photo-id', pausedPhotoId!);
  await page.getByRole('button', { name: 'Resume automatic photo rotation' }).click();
  await expect(page.locator('.photos-rotation-note')).toHaveAttribute(
    'aria-label',
    /Photos change automatically every 45 seconds\./,
  );
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

test('a portrait-rich gallery uses tall rails and wide bands without cropping portrait files', async ({
  page,
}) => {
  await page.route('**/api/v1/households/*/photos', async (route) => {
    const response = await route.fetch();
    const data = (await response.json()) as {
      featuredPhotoId: string | null;
      photos: Array<{
        alt: string;
        capturedAt: string | null;
        displayUrl: string;
        favourite: boolean;
        height: number;
        id: string;
        orientation: 'landscape' | 'portrait' | 'square';
        thumbnailUrl: string;
        width: number;
      }>;
    };
    const portrait = data.photos.find((photo) => photo.orientation === 'portrait');
    const landscapes = data.photos.filter((photo) => photo.orientation === 'landscape');
    if (portrait === undefined || landscapes.length < 2) {
      await route.fulfill({ response });
      return;
    }
    data.photos = [
      { ...portrait, id: 'portrait-a', alt: 'Portrait A' },
      { ...portrait, id: 'portrait-b', alt: 'Portrait B' },
      { ...portrait, id: 'portrait-c', alt: 'Portrait C' },
      { ...landscapes[0]!, id: 'landscape-a', alt: 'Landscape A' },
      { ...landscapes[1]!, id: 'landscape-b', alt: 'Landscape B' },
    ];
    data.featuredPhotoId = 'portrait-a';
    await route.fulfill({ response, json: data });
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/photos');
  const portraitTiles = page.locator('[data-photo-orientation="portrait"]');
  const landscapeTiles = page.locator('[data-photo-orientation="landscape"]');
  await expect(portraitTiles).toHaveCount(3);
  await expect(landscapeTiles).toHaveCount(2);

  const portraitBoxes = await portraitTiles.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { height: rect.height, width: rect.width };
    }),
  );
  const wideBoxes = await landscapeTiles.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { height: rect.height, width: rect.width };
    }),
  );
  expect(portraitBoxes.every((box) => box.height >= box.width * 1.45)).toBe(true);
  expect(wideBoxes.every((box) => box.width > box.height * 1.45)).toBe(true);
  await expect(portraitTiles.first().locator('img')).toHaveCSS('object-fit', 'contain');

  const overflow = await page.locator('.photos-collage').evaluate((element) => ({
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  expect(overflow.scrollHeight).toBeLessThanOrEqual(overflow.clientHeight + 2);
  const pageOverflow = await page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(pageOverflow.scrollHeight).toBeLessThanOrEqual(pageOverflow.clientHeight);
  await captureEvidence(page, {
    animations: 'disabled',
    path: resolve(evidence, 'photos-adaptive-portrait-rich-tv-1080.png'),
  });
});

test('reduced motion keeps the Photos collage still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      nativeSetTimeout(
        handler,
        timeout === 45_000 ? 100 : timeout,
        ...args,
      )) as typeof window.setTimeout;
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/photos');
  await expect(page.locator('.photos-rotation-note')).toHaveCount(0);
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

test('automatic rotation pauses while Hearth is hidden and resumes when it returns', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const nativeSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      nativeSetTimeout(
        handler,
        timeout === 45_000 ? 300 : timeout,
        ...args,
      )) as typeof window.setTimeout;
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/photos');
  const feature = page.locator('.photos-hero');
  await expect(feature).toHaveAttribute('data-photo-id', 'photo_family_breakfast');

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(500);
  await expect(feature).toHaveAttribute('data-photo-id', 'photo_family_breakfast');

  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(feature).not.toHaveAttribute('data-photo-id', 'photo_family_breakfast', {
    timeout: 1_000,
  });
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
  await expect(page.getByRole('heading', { name: 'Photos', exact: true })).toBeVisible();
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

test('@visual phone administration uploads and curates the private photo collection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/photos');
  await expect(page.getByRole('heading', { name: 'Manage photos', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose photos' })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Add photos from this phone' })).toBeVisible();
  await expect(page.getByText('Optional Synology folder import', { exact: true })).toBeVisible();
  await expect(page.getByText('5 showing · 5 added in Hearth · 0 imported')).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'family-photo.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  });
  await expect(page.getByRole('status')).toContainText('1 photo added.');
  await expect(page.getByRole('heading', { name: 'Choose family photos' })).toBeVisible();
  await expect(page.getByText('5 showing', { exact: true })).toBeVisible();
  await expect(page.getByText('0 hidden', { exact: true })).toBeVisible();
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
  await expect(page.getByRole('button', { name: 'Choose photos' })).toBeFocused();
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
  await expect(page.getByText('4 showing', { exact: true })).toBeVisible();
  await expect(page.getByText('1 hidden', { exact: true })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Photos', exact: true })).toBeVisible();
  await expect(page.locator('.photo-collage__tile')).toHaveCount(4);
  await expect(page.locator('[data-photo-id="photo_coastal_picnic"]')).toHaveCount(0);
});

test('phone administration explains an unavailable optional import without blocking uploads', async ({
  page,
}) => {
  await page.route('**/api/v1/households/*/photo-source', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const data = (await response.json()) as {
      collection: {
        source: { message: string; status: string };
      };
      folderImport: {
        configured: boolean;
        status: string;
        message: string;
      };
    };
    data.folderImport.configured = true;
    data.folderImport.status = 'unavailable';
    data.folderImport.message =
      'Hearth cannot read the optional import folder right now; managed uploads still work.';
    await route.fulfill({ response, json: data });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/photos');
  await expect(page.getByRole('heading', { name: 'Add photos from this phone' })).toBeVisible();
  await expect(page.getByText(/cannot read the optional import folder right now/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose photos' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check folder' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('/volume1');
  await expect(page.locator('body')).not.toContainText('/photos-source');
});

test('@visual phone administration bulk-selects and permanently removes managed photos', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/photos');
  await page.getByRole('button', { name: 'Select photos' }).click();
  const first = page.locator('[data-focus-id="photo-curation-select-photo_coastal_picnic"]');
  const second = page.locator('[data-focus-id="photo-curation-select-photo_family_breakfast"]');
  await first.scrollIntoViewIfNeeded();
  await first.click();
  await second.click();
  await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete uploads (2)' })).toBeEnabled();
  await captureEvidence(page, {
    path: resolve(evidence, 'photos-bulk-selection-phone.png'),
    animations: 'disabled',
  });

  await page.getByRole('button', { name: 'Delete uploads (2)' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete 2 Hearth photos?' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep photos' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Delete permanently' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: '2 photos deleted.' })).toBeVisible();
  await expect(page.getByText('3 showing', { exact: true })).toBeVisible();
  await expect(page.locator('.photo-curation-card')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Select photos' })).toBeFocused();

  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
});

test('folder-imported photos can be hidden but not permanently deleted in Hearth', async ({
  page,
}) => {
  await page.route('**/api/v1/households/*/photo-source', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    const data = (await response.json()) as {
      photos: Array<{
        id: string;
        source: 'demo' | 'hearth-upload' | 'synology-folder';
        canDeletePermanently: boolean;
      }>;
    };
    const first = data.photos.find((photo) => photo.id === 'photo_coastal_picnic');
    if (first !== undefined) {
      first.source = 'synology-folder';
      first.canDeletePermanently = false;
    }
    await route.fulfill({ response, json: data });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/photos');
  await page.getByRole('button', { name: 'Select photos' }).click();
  await page.locator('[data-focus-id="photo-curation-select-photo_coastal_picnic"]').click();
  await expect(page.getByText('NAS folder', { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText(/from the NAS folder can be hidden but not deleted here/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete uploads (0)' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Hide (1)' })).toBeEnabled();
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
