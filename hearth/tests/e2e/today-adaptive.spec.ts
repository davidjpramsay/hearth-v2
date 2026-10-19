import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import type { ModulesConfiguration, PhotoGallery, TodaySummary } from '@hearth/shared';
import { expectTodayGeometry } from './todayGeometry';
import { stabilizePhotoPlayback } from './photoPlaybackFixture';

const shapes = [
  { orientation: 'none', width: 0, height: 0 },
  { orientation: 'landscape', width: 1600, height: 400 },
  { orientation: 'square', width: 800, height: 800 },
  { orientation: 'portrait', width: 400, height: 1200 },
] as const;
const viewports = [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1024, height: 1366 },
  { width: 1200, height: 620 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 3840, height: 2160 },
] as const;

test.afterEach(async ({ page }) => page.unrouteAll({ behavior: 'wait' }));

for (const viewport of viewports) {
  for (const theme of ['light', 'dark'] as const) {
    test(`Today adaptive stress ${viewport.width}x${viewport.height} ${theme}`, async ({
      page,
      request,
    }, info) => {
      // One inventory case deliberately exercises 16 full navigations, including 4K image decode.
      test.setTimeout(60_000);
      await request.post('/api/v1/demo/reset');
      await stabilizePhotoPlayback(page);
      await page.setViewportSize(viewport);
      await page.addInitScript(
        (theme) =>
          localStorage.setItem(
            'hearth.appearance.v1',
            JSON.stringify({ theme, eveningDimming: false }),
          ),
        theme,
      );
      const fixture = await installAdaptiveFixture(page);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      // All four core combinations; tall/wide *real pixel* fixtures; sparse and full shelves.
      for (let core = 0; core < 4; core += 1) {
        for (const photo of shapes) {
          fixture.core = core;
          fixture.photo = photo;
          fixture.sparse = core % 2 === 0;
          await page.goto('/today');
          await expect(page.locator('.today-dashboard')).toHaveAttribute(
            'data-core-count',
            String(Number(Boolean(core & 1)) + Number(Boolean(core & 2))),
          );
          await expect(page.locator('.today-dashboard')).toHaveAttribute(
            'data-photo-orientation',
            photo.orientation,
          );
          await expect(page.locator('.summary-band')).toHaveCount(fixture.sparse ? 2 : 5);
          if (photo.orientation !== 'none') {
            const image = page.locator('.today-photo__image');
            await expect(image).toBeVisible();
            await expect
              .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth))
              .toBe(photo.width);
          }
          await expectTodayGeometry(page, viewport.width >= 1200);
          if (viewport.width >= 1200) {
            expect(
              await page
                .locator('.app-content')
                .evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
            ).toBe(true);
          }
          if (core === 3) {
            const chores = await page.locator('.chores-due-section').boundingBox();
            const events = await page.locator('.upcoming-section').boundingBox();
            if (viewport.width >= 700 && viewport.width > viewport.height)
              expect(chores!.x).toBeLessThan(events!.x);
            else expect(chores!.y).toBeLessThan(events!.y);
          }
          if (core === 2 && photo.orientation === 'landscape')
            await page.screenshot({
              path: info.outputPath(`sparse-${viewport.width}-${theme}.png`),
              fullPage: viewport.width < 1200,
            });
        }
      }
      expect(errors).toEqual([]);
    });
  }
}

for (const viewport of [viewports[4], viewports[6], viewports[7]]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`Today filled cards keep settled focus inside ${viewport.width}x${viewport.height} ${theme}`, async ({
      page,
      request,
    }, info) => {
      await request.post('/api/v1/demo/reset');
      await stabilizePhotoPlayback(page);
      await page.setViewportSize(viewport);
      await page.addInitScript(
        (theme) =>
          localStorage.setItem(
            'hearth.appearance.v1',
            JSON.stringify({ theme, eveningDimming: false }),
          ),
        theme,
      );
      const fixture = await installAdaptiveFixture(page);
      fixture.core = 0;
      fixture.sparse = true;
      for (const photo of shapes) {
        fixture.photo = photo;
        await page.goto('/today');
        await expect(page.locator('.today-dashboard')).toHaveAttribute('data-core-count', '0');
        await expect(page.locator('.today-dashboard')).toHaveAttribute(
          'data-photo-orientation',
          photo.orientation,
        );
        await expect(page.locator('.summary-band')).toHaveCount(2);
        for (const target of await page
          .locator('.summary-band.focusable, .today-photo-action')
          .all()) {
          await target.focus();
          await expect(target).toBeFocused();
          await expect(target).toHaveCSS('transform', 'none');
          await expect(target).toHaveCSS('outline-style', 'solid');
          await expect(target).toHaveCSS('outline-width', '3px');
          await expectTodayGeometry(page);
        }
      }
      await page.screenshot({ path: info.outputPath(`today-settled-focus-${theme}.png`) });
    });
  }
}

test('Today remote can reach and leave every tile after reflow without losing opener focus', async ({
  page,
  request,
}) => {
  await request.post('/api/v1/demo/reset');
  const fixture = await installAdaptiveFixture(page);
  fixture.core = 3;
  for (const photo of shapes) {
    fixture.photo = photo;
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/today');
    await expect(page.locator('.summary-band')).toHaveCount(5);
    const first = page.locator('.chore-row').first();
    await first.focus();
    const pending = [await first.getAttribute('data-focus-id')];
    const seen = new Set<string>();
    while (pending.length > 0) {
      const id = pending.shift();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
        await page.locator(`[data-focus-id="${id}"]`).focus();
        await page.keyboard.press(key);
        const next = await page.evaluate(
          () => (document.activeElement as HTMLElement)?.dataset.focusId,
        );
        if (next?.startsWith('today-') && !seen.has(next)) pending.push(next);
      }
    }
    const targets = await page
      .locator('.today-dashboard [data-focus-id]')
      .evaluateAll((elements) =>
        elements.map((element) => (element as HTMLElement).dataset.focusId!),
      );
    expect(targets.filter((id) => !seen.has(id))).toEqual([]);
    const verse = page.locator('[data-focus-id="today-summary-daily-verse"]');
    await verse.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(verse).toBeFocused();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(verse).toBeFocused();
    await expectTodayGeometry(page, false);
  }
});

for (const width of [1200, 1366, 1920]) {
  test(`Today stale and failed chore layouts stay bounded at ${width}`, async ({
    page,
    request,
  }, info) => {
    await request.post('/api/v1/demo/reset');
    await page.setViewportSize({
      width,
      height: width === 1200 ? 620 : width === 1366 ? 768 : 1080,
    });
    const fixture = await installAdaptiveFixture(page);
    fixture.stale = true;
    await page.goto('/today');
    await expect(page.locator('.status-banner')).toContainText('saved calendar');
    await expectTodayGeometry(page);
    await page.route('**/chore-occurrences/*/completions', (route) => route.abort('failed'));
    await page.locator('.chore-row').first().click();
    await expect(page.locator('.inline-error')).toBeVisible();
    await expectTodayGeometry(page);
    await page.screenshot({ path: info.outputPath(`today-error-${width}.png`) });
  });
}

async function installAdaptiveFixture(page: Page) {
  const base = '/api/v1/households/household_hearth_demo';
  const today = (await (
    await page.request.get(`${base}/today?date=2026-08-03`)
  ).json()) as TodaySummary;
  const modules = (await (
    await page.request.get(`${base}/modules`)
  ).json()) as ModulesConfiguration;
  const gallery = (await (await page.request.get(`${base}/photos`)).json()) as PhotoGallery;
  const fixture: { core: number; photo: (typeof shapes)[number]; sparse: boolean; stale: boolean } =
    {
      core: 3,
      photo: shapes[1],
      sparse: false,
      stale: false,
    };
  const pixels = new Map<string, Buffer>();
  for (const photo of shapes.slice(1)) {
    pixels.set(
      photo.orientation,
      await sharp({
        create: { width: photo.width, height: photo.height, channels: 3, background: '#c4d7c5' },
      })
        .png()
        .toBuffer(),
    );
  }
  await page.route(`**${base}/modules`, (route) =>
    route.fulfill({
      json: {
        ...modules,
        enabled: {
          ...modules.enabled,
          chores: Boolean(fixture.core & 1),
          calendar: Boolean(fixture.core & 2),
        },
      },
    }),
  );
  await page.route('**/demo/photos/layout-proof.png', (route) =>
    route.fulfill({ contentType: 'image/png', body: pixels.get(fixture.photo.orientation)! }),
  );
  await page.route(`**${base}/photos`, (route) => {
    const asset = gallery.photos[0]!;
    return route.fulfill({
      json: {
        ...gallery,
        featuredPhotoId: asset.id,
        photos: [{ ...asset, ...fixture.photo, displayUrl: '/demo/photos/layout-proof.png' }],
      },
    });
  });
  await page.route(`**${base}/today?date=*`, (route) =>
    route.fulfill({
      json: {
        ...today,
        freshness: fixture.stale ? 'stale' : 'current',
        statusMessage: fixture.stale ? 'Showing saved calendar plans.' : null,
        sections: {
          dinner: !fixture.sparse,
          listSummary: !fixture.sparse,
          notice: !fixture.sparse,
          dailyVerse: true,
          reminders: true,
          photo: fixture.photo.orientation !== 'none',
        },
        notice:
          'An intentionally longer household notice to check wrapping without widening the dashboard or covering another tile.',
        dailyVerse: {
          freshness: 'current',
          reference: 'Philippians 4:6–7',
          sourceUrl: null,
          statusMessage: null,
          translation: 'ESV',
          text: 'Do not be anxious about anything, but in everything by prayer and supplication with thanksgiving let your requests be made known to God.',
        },
        reminderSummary: {
          openCount: 7,
          items: [
            {
              dueAt: null,
              hasDueTime: false,
              id: 'reminder_layout',
              title: 'Remember the library books and the school excursion permission form',
            },
          ],
        },
        photo:
          fixture.photo.orientation === 'none'
            ? null
            : {
                ...fixture.photo,
                alt: 'Deterministic layout test photograph',
                url: '/demo/photos/layout-proof.png',
              },
      },
    }),
  );
  return fixture;
}
