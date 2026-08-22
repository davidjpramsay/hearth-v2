import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { captureEvidence } from './visualEvidence';

const evidence = resolve('docs/evidence/today-polish');

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
});

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
});

test('@visual @a11y Today exposes real details, honest overflow and useful destinations', async ({
  page,
}) => {
  const consoleProblems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleProblems.push(message.text());
    }
  });
  await addOverflowPlans(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');

  await expect(page).toHaveTitle(/Hearth/);
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View 2 more plans in Calendar' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View 5 more chores' })).toBeVisible();
  await expect(page.locator('.event-row')).toHaveCount(3);
  await expect(page.locator('.chore-row')).toHaveCount(3);

  const firstEvent = page.getByRole('button', { name: /8:15 am, School drop-off/ });
  await expect(page.locator('[data-focus-id="today-chore-occurrence_school_bag"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(firstEvent).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'School drop-off' })).toBeVisible();
  await expect(page.locator('[data-focus-id="event-detail-close"]')).toBeFocused();
  await captureEvidence(page, {
    path: resolve(evidence, 'today-event-detail-tv-1080.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(firstEvent).toBeFocused();

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const eventOverflow = page.locator('[data-focus-id="today-event-overflow"]');
  await expect(eventOverflow).toBeFocused();
  await captureEvidence(page, {
    path: resolve(evidence, 'today-overflow-tv-1080.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/calendar\/agenda$/);
  await expect(page.getByRole('heading', { name: 'Agenda', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(eventOverflow).toBeFocused();

  await page.keyboard.press('ArrowDown');
  const dinner = page.locator('[data-focus-id="today-summary-dinner"]');
  await expect(dinner).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/meals$/);
  await expect(page.getByRole('heading', { name: 'Meals', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dinner).toBeFocused();

  await page.keyboard.press('ArrowDown');
  const list = page.locator('[data-focus-id="today-summary-list"]');
  await expect(list).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/lists$/);
  await expect(page.getByRole('heading', { name: 'Lists', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(list).toBeFocused();

  await page.keyboard.press('ArrowDown');
  const notice = page.locator('[data-focus-id="today-summary-notice"]');
  await expect(notice).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Notice' })).toContainText('Bins go out tonight');
  await expect(page.locator('[data-focus-id="notice-detail-close"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(notice).toBeFocused();

  await page.keyboard.press('ArrowRight');
  const photo = page.locator('[data-focus-id="today-photo"]');
  await expect(photo).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/photos$/);
  await expect(page.getByRole('heading', { name: 'Photos', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(photo).toBeFocused();
  await page.keyboard.press('ArrowUp');
  const choreOverflow = page.locator('[data-focus-id="today-chore-overflow"]');
  await expect(choreOverflow).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/chores$/);
  await expect(page.getByRole('heading', { name: 'Chores', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(choreOverflow).toBeFocused();

  const tvA11y = await new AxeBuilder({ page }).analyze();
  expect(
    tvA11y.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole('link', { name: 'View 2 more plans in Calendar' })).toBeVisible();
  await captureEvidence(page, {
    path: resolve(evidence, 'today-overflow-phone-portrait.png'),
    animations: 'disabled',
  });
  await page.locator('.summary-row').scrollIntoViewIfNeeded();
  await captureEvidence(page, {
    path: resolve(evidence, 'today-destinations-phone-portrait.png'),
    animations: 'disabled',
  });
  const phoneA11y = await new AxeBuilder({ page }).analyze();
  expect(
    phoneA11y.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
  expect(consoleProblems).toEqual([]);
});

for (const viewport of [
  { name: 'tv-1080', width: 1920, height: 1080 },
  { name: 'tv-1366', width: 1366, height: 768 },
] as const) {
  test(`@visual Today reflows a portrait photo without dashboard scrolling at ${viewport.name}`, async ({
    page,
  }) => {
    await usePortraitPhoto(page);
    await page.setViewportSize(viewport);
    await page.goto('/today');

    const dashboard = page.locator('.today-dashboard');
    await expect(dashboard).toHaveAttribute('data-photo-orientation', 'portrait');
    await expect(
      page.getByAltText('Ezra and Maya water herbs in the family garden.'),
    ).toBeVisible();
    expect(await hasTelevisionOverflow(page)).toBe(false);
    expect(
      await page.locator('.chore-row').evaluateAll((rows) =>
        rows.every((row) => {
          const copy = row.querySelector('.chore-row__copy');
          const action = row.querySelector('.chore-row__action');
          if (copy === null || action === null) return false;
          return copy.getBoundingClientRect().right <= action.getBoundingClientRect().left;
        }),
      ),
    ).toBe(true);

    const columnsBox = await page.locator('.today-columns').boundingBox();
    const photoBox = await page.locator('.today-photo-action').boundingBox();
    const summariesBox = await page.locator('.summary-details').boundingBox();
    const headings = await page.locator('.today-columns .section-heading').all();
    const rowRails = await Promise.all([
      page.locator('.event-list').boundingBox(),
      page.locator('.chore-list').boundingBox(),
    ]);
    expect(columnsBox).not.toBeNull();
    expect(photoBox).not.toBeNull();
    expect(summariesBox).not.toBeNull();
    expect(headings).toHaveLength(2);
    const headingBoxes = await Promise.all(headings.map((heading) => heading.boundingBox()));
    expect(headingBoxes[0]).not.toBeNull();
    expect(headingBoxes[1]).not.toBeNull();
    expect(Math.abs(headingBoxes[0]!.y - headingBoxes[1]!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(rowRails[0]!.y - rowRails[1]!.y)).toBeLessThanOrEqual(1);
    expect(photoBox!.x).toBeGreaterThan(columnsBox!.x + columnsBox!.width);
    expect(Math.abs(photoBox!.y - columnsBox!.y)).toBeLessThanOrEqual(1);
    expect(summariesBox!.y).toBeGreaterThanOrEqual(columnsBox!.y + columnsBox!.height + 12);
    expect(photoBox!.height).toBeGreaterThan(summariesBox!.height * 2);

    await captureEvidence(page, {
      path: resolve(evidence, `today-adaptive-portrait-${viewport.name}.png`),
      animations: 'disabled',
    });
  });
}

test('@visual Today aligns landscape media with the optional-summary rail', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');

  const dashboard = page.locator('.today-dashboard');
  await expect(dashboard).toHaveAttribute('data-photo-orientation', 'landscape');
  const eventRail = await page.locator('.event-list').boundingBox();
  const choreRail = await page.locator('.chore-list').boundingBox();
  const summaries = await page.locator('.summary-details').boundingBox();
  const photo = await page.locator('.today-photo-action').boundingBox();
  expect(eventRail).not.toBeNull();
  expect(choreRail).not.toBeNull();
  expect(summaries).not.toBeNull();
  expect(photo).not.toBeNull();
  expect(Math.abs(eventRail!.y - choreRail!.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(summaries!.y - photo!.y)).toBeLessThanOrEqual(1);
  expect(photo!.width).toBeGreaterThan((await dashboard.boundingBox())!.width * 0.35);
  expect(await hasTelevisionOverflow(page)).toBe(false);

  await captureEvidence(page, {
    path: resolve(evidence, 'today-aligned-landscape-tv-1080.png'),
    animations: 'disabled',
  });
});

test('Today covers every optional-module subset across representative native photo ratios', async ({
  page,
}) => {
  // This deliberately exercises 192 complete render/navigation cycles. GitHub's
  // shared runners need more headroom than the local Chromium run, while each
  // individual assertion retains the normal five-second expectation timeout.
  test.setTimeout(360_000);
  const sectionKeys = ['dinner', 'listSummary', 'notice', 'dailyVerse'] as const;
  const photoShapes = [
    { name: 'none', orientation: 'none', width: 0, height: 0 },
    { name: 'landscape-3-2', orientation: 'landscape', width: 1500, height: 1000 },
    { name: 'landscape-16-9', orientation: 'landscape', width: 1600, height: 900 },
    { name: 'square', orientation: 'square', width: 1000, height: 1000 },
    { name: 'portrait-2-3', orientation: 'portrait', width: 1000, height: 1500 },
    { name: 'portrait-9-16', orientation: 'portrait', width: 900, height: 1600 },
  ] as const;
  let matrixState: { mask: number; photo: (typeof photoShapes)[number] } = {
    mask: 0,
    photo: photoShapes[0],
  };

  await page.route('**/api/v1/households/*/today?date=*', async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as {
      photo: null | {
        alt: string;
        height?: number;
        orientation: 'landscape' | 'portrait' | 'square';
        url: string;
        width?: number;
      };
      sections: {
        dailyVerse: boolean;
        dinner: boolean;
        listSummary: boolean;
        notice: boolean;
        photo: boolean;
      };
    };
    const originalPhoto = payload.photo;
    payload.sections = {
      dailyVerse: Boolean(matrixState.mask & (1 << 3)),
      dinner: Boolean(matrixState.mask & (1 << 0)),
      listSummary: Boolean(matrixState.mask & (1 << 1)),
      notice: Boolean(matrixState.mask & (1 << 2)),
      photo: matrixState.photo.orientation !== 'none',
    };
    payload.photo =
      matrixState.photo.orientation === 'none' || originalPhoto === null
        ? null
        : {
            ...originalPhoto,
            height: matrixState.photo.height,
            orientation: matrixState.photo.orientation,
            url: `${originalPhoto.url}?matrix=${matrixState.photo.name}-${matrixState.mask}`,
            width: matrixState.photo.width,
          };
    await route.fulfill({ response, json: payload });
  });

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    for (const photo of photoShapes) {
      for (let mask = 0; mask < 1 << sectionKeys.length; mask += 1) {
        matrixState = { mask, photo };
        await page.goto('/today');
        await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();

        const summaryCount = sectionKeys.filter((_, index) => Boolean(mask & (1 << index))).length;
        const dashboard = page.locator('.today-dashboard');
        await expect(dashboard).toHaveAttribute('data-summary-count', String(summaryCount));
        await expect(dashboard).toHaveAttribute('data-photo-orientation', photo.orientation);
        await expect(page.locator('.summary-band')).toHaveCount(summaryCount);
        await expect(page.locator('.summary-row')).toHaveCount(
          summaryCount === 0 && photo.orientation === 'none' ? 0 : 1,
        );
        expect(await hasTelevisionOverflow(page)).toBe(false);

        if (photo.orientation === 'none') {
          await expect(page.locator('.today-photo')).toHaveCount(0);
          continue;
        }

        const photoFigure = page.locator('.today-photo');
        await expect(photoFigure).toHaveAttribute(
          'data-photo-ratio',
          (photo.width / photo.height).toFixed(4),
        );
        await expect(photoFigure.locator('img')).toHaveCSS('object-fit', 'contain');
        const photoBox = await photoFigure.boundingBox();
        expect(photoBox).not.toBeNull();
        expect(
          Math.abs(photoBox!.width / photoBox!.height - photo.width / photo.height),
        ).toBeLessThan(0.025);

        if (photo.orientation === 'landscape' && summaryCount > 0) {
          const dashboardBox = await dashboard.boundingBox();
          expect(dashboardBox).not.toBeNull();
          expect(photoBox!.width).toBeGreaterThan(dashboardBox!.width * 0.32);
        }
      }
    }
  }
});

test('@visual Today collapses every optional track in a photo-only composition', async ({
  page,
}) => {
  await usePhotoOnly(page);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/today');

  await expect(page.locator('.today-dashboard')).toHaveAttribute('data-summary-count', '0');
  await expect(page.locator('.summary-details')).toHaveCount(0);
  const dashboard = await page.locator('.today-dashboard').boundingBox();
  const photo = await page.locator('.today-photo-action').boundingBox();
  expect(dashboard).not.toBeNull();
  expect(photo).not.toBeNull();
  expect(photo!.width).toBeGreaterThan(dashboard!.width * 0.75);
  expect(photo!.width).toBeLessThan(dashboard!.width * 0.9);
  expect(
    Math.abs(photo!.x + photo!.width / 2 - (dashboard!.x + dashboard!.width / 2)),
  ).toBeLessThan(2);
  expect(await hasTelevisionOverflow(page)).toBe(false);

  await captureEvidence(page, {
    path: resolve(evidence, 'today-adaptive-photo-only-tv-1366.png'),
    animations: 'disabled',
  });
});

test('@visual Today expands enabled summaries when the photo is disabled', async ({ page }) => {
  await useNoPhoto(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');

  await expect(page.locator('.today-dashboard')).toHaveAttribute('data-photo-orientation', 'none');
  await expect(page.locator('.today-photo')).toHaveCount(0);
  expect(await hasTelevisionOverflow(page)).toBe(false);

  const dashboardBox = await page.locator('.today-dashboard').boundingBox();
  const summariesBox = await page.locator('.summary-details').boundingBox();
  expect(dashboardBox).not.toBeNull();
  expect(summariesBox).not.toBeNull();
  expect(summariesBox!.width).toBeGreaterThan(dashboardBox!.width * 0.95);

  await captureEvidence(page, {
    path: resolve(evidence, 'today-adaptive-no-photo-tv-1080.png'),
    animations: 'disabled',
  });
});

async function addOverflowPlans(page: Page): Promise<void> {
  await page.route('**/api/v1/households/*/today?date=*', async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as {
      events: Array<Record<string, unknown>>;
      chores: Array<Record<string, unknown>>;
    };
    const firstEvent = payload.events[0];
    const firstChore = payload.chores[0];
    if (firstEvent === undefined || firstChore === undefined) {
      throw new Error('The deterministic Today fixture must contain an event and a chore.');
    }
    payload.events.push(
      {
        ...firstEvent,
        id: 'event_library_pickup',
        title: 'Library pickup',
        start: '2026-08-03T16:30:00+08:00',
        end: '2026-08-03T17:00:00+08:00',
      },
      {
        ...firstEvent,
        id: 'event_family_walk',
        title: 'Family walk',
        start: '2026-08-03T18:15:00+08:00',
        end: '2026-08-03T19:00:00+08:00',
      },
    );
    payload.chores.push(
      { ...firstChore, id: 'occurrence_lunchboxes', title: 'Empty lunchboxes' },
      { ...firstChore, id: 'occurrence_school_shoes', title: 'Put school shoes away' },
    );
    await route.fulfill({ response, json: payload });
  });
}

async function usePortraitPhoto(page: Page): Promise<void> {
  await page.route('**/api/v1/households/*/today?date=*', async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as {
      photo: { alt: string; orientation: string; url: string } | null;
    };
    payload.photo = {
      alt: 'Ezra and Maya water herbs in the family garden.',
      orientation: 'portrait',
      url: '/demo/photos/garden-morning.webp',
    };
    await route.fulfill({ response, json: payload });
  });
}

async function useNoPhoto(page: Page): Promise<void> {
  await page.route('**/api/v1/households/*/today?date=*', async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as {
      photo: unknown;
      sections: { photo: boolean };
    };
    payload.photo = null;
    payload.sections.photo = false;
    await route.fulfill({ response, json: payload });
  });
}

async function usePhotoOnly(page: Page): Promise<void> {
  await page.route('**/api/v1/households/*/today?date=*', async (route) => {
    const response = await route.fetch();
    const payload = (await response.json()) as {
      sections: {
        dailyVerse: boolean;
        dinner: boolean;
        listSummary: boolean;
        notice: boolean;
        photo: boolean;
      };
    };
    payload.sections = {
      dailyVerse: false,
      dinner: false,
      listSummary: false,
      notice: false,
      photo: true,
    };
    await route.fulfill({ response, json: payload });
  });
}

async function hasTelevisionOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const appContent = document.querySelector('.app-content');
    const todayScreen = document.querySelector('.today-screen');
    return (
      document.documentElement.scrollHeight > window.innerHeight + 1 ||
      (appContent !== null && appContent.scrollHeight > appContent.clientHeight + 1) ||
      (todayScreen !== null && todayScreen.scrollHeight > todayScreen.clientHeight + 1)
    );
  });
}
