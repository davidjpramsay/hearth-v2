import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { captureEvidence } from './visualEvidence';

const evidence = resolve('docs/evidence/weather');
const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page, request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
  });
});

test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1672, height: 941 },
  { width: 1920, height: 1080 },
  { width: 3840, height: 2160 },
]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`Weather chart returns to the menu with D-pad at ${viewport.width} in ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/weather');
      await expect(page).toHaveURL(/\/weather$/);
      await expect(page).toHaveTitle('Hearth');
      await expect(page.getByRole('heading', { name: 'Weather', exact: true })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      const chart = page.locator('[data-focus-id="weather-chart"]');
      const weatherMenu = page.locator('[data-focus-id="nav-weather"]');
      const temperature = page.getByRole('button', { name: 'Temperature', exact: true });
      await expect(temperature).toBeFocused();

      for (const [modeIndex, mode] of ['Temperature', 'Rain', 'Wind'].entries()) {
        for (const hourIndex of [0, 7, 24]) {
          if (await weatherMenu.evaluate((element) => element === document.activeElement)) {
            await enterWeatherGraphButtons(page);
          }
          for (let index = 0; index < modeIndex; index += 1)
            await page.keyboard.press('ArrowRight');
          const button = page.getByRole('button', { name: mode, exact: true });
          await expect(button).toBeFocused();
          await page.keyboard.press('Enter');
          await expect(button).toHaveAttribute('aria-pressed', 'true');
          await page.keyboard.press('ArrowDown');
          await expect(chart).toBeFocused();
          const priorHour = Number(await chart.getAttribute('aria-valuenow'));
          for (let step = 0; step < Math.abs(hourIndex - priorHour); step += 1) {
            await page.keyboard.press(hourIndex < priorHour ? 'ArrowLeft' : 'ArrowRight');
          }
          await expect(chart).toHaveAttribute('aria-valuenow', String(hourIndex));
          await expect(chart).toBeFocused();
          await page.keyboard.press('ArrowUp');
          await expect(button).toBeFocused();
          // IntersectionObserver rounds fractional button bounds. Allow only
          // numeric noise (0.001%), not a partially clipped control.
          await expect(button).toBeInViewport({ ratio: 0.99999 });
          await expect(button).toHaveAttribute('aria-pressed', 'true');
          await expect(chart).toHaveAttribute('aria-valuenow', String(hourIndex));
          for (let index = 0; index <= modeIndex; index += 1) {
            await page.keyboard.press('ArrowLeft');
          }
          await expect(weatherMenu).toBeFocused();
          await expect(weatherMenu).toBeInViewport({ ratio: 0.99999 });
          await expect(button).toHaveAttribute('aria-pressed', 'true');
          await expect(chart).toHaveAttribute('aria-valuenow', String(hourIndex));
          expect(await page.locator('.app-shell').evaluate((shell) => shell.scrollTop)).toBe(0);
          if (mode === 'Rain' && hourIndex === 7) {
            await captureEvidence(page, {
              path: testInfo.outputPath(`weather-menu-rain-${theme}.png`),
            });
          }

          // Keep the hour-action row reachable too, skipping only disabled
          // endpoint buttons. It must have the same bounded route back out.
          await enterWeatherGraphButtons(page);
          await page.keyboard.press('ArrowRight');
          await page.keyboard.press('ArrowRight');
          await expect(page.getByRole('button', { name: 'Wind', exact: true })).toBeFocused();
          await page.keyboard.press('ArrowRight');
          const previous = page.getByRole('button', { name: 'Previous hour', exact: true });
          const now = page.getByRole('button', { name: 'Return to current time', exact: true });
          const next = page.getByRole('button', { name: 'Next hour', exact: true });
          if (hourIndex === 0) {
            await expect(previous).toBeDisabled();
          } else {
            await expect(previous).toBeFocused();
            await page.keyboard.press('ArrowRight');
          }
          await expect(now).toBeFocused();
          await page.keyboard.press('ArrowRight');
          if (hourIndex === 24) {
            await expect(next).toBeDisabled();
            await expect(now).toBeFocused();
          } else {
            await expect(next).toBeFocused();
          }
          await page.keyboard.press('ArrowDown');
          await expect(chart).toBeFocused();
          await expect(chart).toHaveAttribute('aria-valuenow', String(hourIndex));
          await page.keyboard.press('ArrowUp');
          await expect(button).toBeFocused();
          for (let index = 0; index <= modeIndex; index += 1) {
            await page.keyboard.press('ArrowLeft');
          }
          await expect(weatherMenu).toBeFocused();
          await expect(button).toHaveAttribute('aria-pressed', 'true');
        }
      }

      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.filter((violation) =>
          ['serious', 'critical'].includes(violation.impact ?? ''),
        ),
      ).toEqual([]);
      await page.keyboard.press('ArrowDown');
      await expect(page.locator('[data-focus-id="nav-reminders"]')).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(page.locator('[data-focus-id="nav-chores"]')).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/chores$/);
      await expect(page.getByRole('heading', { name: 'Chores', exact: true })).toBeVisible();
    });
  }
}

async function enterWeatherGraphButtons(page: Page) {
  // The shared spatial engine enters the nearest visible control, not always
  // Temperature. Navigate back to that button using only the same bounded
  // Up/Left paths a remote user has; do not programmatically assign focus.
  await page.keyboard.press('ArrowRight');
  let focused = await page.evaluate(
    () => (document.activeElement as HTMLElement | null)?.dataset.focusId,
  );
  if (focused === 'weather-chart' || focused?.startsWith('weather-hour-')) {
    await page.keyboard.press('ArrowUp');
    focused = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.dataset.focusId,
    );
  }
  const buttons = ['weather-mode-temperature', 'weather-mode-rain', 'weather-mode-wind'];
  expect(buttons).toContain(focused);
  for (let step = 0; step < buttons.indexOf(focused!); step += 1) {
    await page.keyboard.press('ArrowLeft');
  }
  await expect(page.getByRole('button', { name: 'Temperature', exact: true })).toBeFocused();
}

test('compact television keeps every day visible offline and restores the normal freshness cue', async ({
  context,
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/weather');
  await expect(page.locator('.weather-day')).toHaveCount(7);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByRole('status')).toHaveText('Offline · Showing saved weather.');
  await expect(page.locator('.weather-saved-age')).toHaveText('Updated now');
  for (const mode of ['Temperature', 'Rain', 'Wind']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    const dimensions = await page.locator('.app-content').evaluate((content) => ({
      height: content.clientHeight,
      scrollHeight: content.scrollHeight,
    }));
    expect(dimensions.scrollHeight).toBeLessThanOrEqual(dimensions.height + 1);
    await expect(page.locator('.weather-day').last()).toBeInViewport();
  }
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.weather-updated')).toHaveText('Updated now');
  await expect(page.locator('.weather-saved-age')).toHaveCount(0);
  await expect(page.locator('.weather-day')).toHaveCount(7);
});

for (const viewport of [
  { width: 320, height: 700 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 820, height: 1180 },
  { width: 1366, height: 768 },
  { width: 1672, height: 941 },
  { width: 1920, height: 1080 },
  { width: 3840, height: 2160 },
]) {
  for (const theme of ['light', 'dark']) {
    test(`@visual @a11y Weather graph units and layout at ${viewport.width}×${viewport.height} ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript((theme) => {
        window.localStorage.setItem(
          'hearth.appearance.v1',
          JSON.stringify({ theme, eveningDimming: false }),
        );
      }, theme);
      await page.goto('/weather');
      await expect(page.locator('.weather-day')).toHaveCount(7);
      await expect(page.getByRole('heading', { name: 'Seven days' })).toBeVisible();
      const chart = page.getByRole('slider');
      for (const mode of ['Temperature', 'Rain', 'Wind']) {
        await page.getByRole('button', { name: mode, exact: true }).click();
        await expect(chart).toHaveAccessibleName(new RegExp(`${mode} daily forecast`));
        const geometry = await page.locator('.weather-chart__plot').evaluate((svg) => {
          const element = svg as SVGSVGElement;
          return {
            width: element.clientWidth,
            height: element.clientHeight,
            boxWidth: element.viewBox.baseVal.width,
            boxHeight: element.viewBox.baseVal.height,
          };
        });
        expect(Math.abs(geometry.width - geometry.boxWidth)).toBeLessThanOrEqual(1);
        expect(Math.abs(geometry.height - geometry.boxHeight)).toBeLessThanOrEqual(1);
        const labels = await page.locator('.weather-chart__hour').allTextContents();
        expect(labels[0]).toBe('12 am');
        expect(labels.at(-1)).toBe('12 am');
        await expect(page.locator('.weather-selected-hour span')).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        ).toBe(true);
        if (viewport.width >= 1200) {
          const bounds = await page.locator('.app-content').evaluate((content) => ({
            scrollHeight: content.scrollHeight,
            clientHeight: content.clientHeight,
            scrollWidth: content.scrollWidth,
            clientWidth: content.clientWidth,
          }));
          expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1);
          expect(bounds.scrollHeight).toBeLessThanOrEqual(bounds.clientHeight + 1);
        }
      }
      await page.getByRole('button', { name: 'Rain', exact: true }).click();
      await expect(page.locator('.weather-chart__lane-label--chance')).toHaveText(
        'Rain chance (%)',
      );
      await expect(page.locator('.weather-chart__lane-label--amount')).toHaveText(
        'Expected rain (mm per hour)',
      );
      const encoding = await page.evaluate(() => {
        const chance = document.querySelector('.weather-chart__rain-chance')!;
        const bar = document.querySelector('.weather-chart__rain-bars rect')!;
        const chanceLabel = document.querySelector('.weather-chart__lane-label--chance')!;
        const amountLabel = document.querySelector('.weather-chart__lane-label--amount')!;
        return {
          chance: getComputedStyle(chance).stroke,
          amount: getComputedStyle(bar).fill,
          chanceLabel: getComputedStyle(chanceLabel).fill,
          amountLabel: getComputedStyle(amountLabel).fill,
          chanceBottom: chance.getBoundingClientRect().bottom,
          amountTop: document.querySelector('.weather-chart__rain-grid')!.getBoundingClientRect()
            .top,
        };
      });
      expect(encoding.chance).not.toBe(encoding.amount);
      expect(encoding.chanceLabel).toBe(encoding.chance);
      expect(encoding.amountLabel).toBe(encoding.amount);
      // All expected-rain bars sit in the lower lane, not on the percent scale.
      const separated = await page.locator('.weather-chart__rain-bars').evaluate((bars) => {
        const line = document.querySelector('.weather-chart__rain-chance')!.getBoundingClientRect();
        return [...bars.querySelectorAll('rect')].every(
          (bar) => bar.getBoundingClientRect().top > line.bottom,
        );
      });
      expect(separated).toBe(true);
      await page.getByRole('button', { name: 'Return to current time' }).click();
      await page.getByRole('button', { name: 'Next hour' }).click();
      await expect(chart).toHaveAttribute('aria-valuenow', '8');
      await expect(chart).toHaveAttribute('aria-valuetext', /% chance, .* mm expected/);
      // A tap selects an hour; stepping and Now remain alternatives to precise tapping.
      const plot = await page.locator('.weather-chart__plot').boundingBox();
      await page
        .locator('.weather-chart__plot')
        .click({ position: { x: plot!.width / 2, y: plot!.height / 2 } });
      await expect(page.locator('.weather-chart__selected-point')).toBeVisible();
      await page.getByRole('button', { name: 'Return to current time' }).click();
      await expect(page.locator('.weather-chart__selected-point')).toHaveCount(0);
      if (viewport.width >= 1200) {
        await expect(page.getByRole('heading', { name: 'Weather', exact: true })).toBeInViewport({
          ratio: 1,
        });
        await expect(page.locator('.household-date-time--rail')).toBeInViewport({ ratio: 1 });
        expect(await page.locator('.app-shell').evaluate((shell) => shell.scrollTop)).toBe(0);
      }
      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.filter((violation) =>
          ['serious', 'critical'].includes(violation.impact ?? ''),
        ),
      ).toEqual([]);
      await captureEvidence(page, {
        path: resolve(evidence, `weather-rain-${viewport.width}-${theme}.png`),
        animations: 'disabled',
        fullPage: viewport.width < 1200,
      });
    });
  }
}

test('@visual @a11y Weather is readable and remote-operable on television', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/weather');

  await expect(page.getByRole('heading', { name: 'Weather', exact: true })).toBeVisible();
  await expect(page.getByText('Baldivis, WA')).toBeVisible();
  await expect(page.locator('.weather-day')).toHaveCount(7);
  await expect(page.locator('.weather-day').first()).toContainText('11°');
  await expect(page.locator('.weather-day').first()).toContainText('21°');
  await expect(page.locator('.weather-day__wind')).toHaveCount(7);
  await expect(page.locator('.weather-day__wind').first()).toHaveText('Up to 24 km/h W');
  await expect(page.getByText('Weather data by')).toHaveCount(0);
  await expect(page.locator('.weather-week__rows')).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.weather-day--today')).toHaveCSS('border-top-width', '0px');

  const weatherSectionSpacing = await page.evaluate(() => {
    const screen = document.querySelector('.weather-screen')?.getBoundingClientRect();
    const hourly = document.querySelector('.weather-hourly')?.getBoundingClientRect();
    const week = document.querySelector('.weather-week__rows')?.getBoundingClientRect();
    if (screen === undefined || hourly === undefined || week === undefined) return null;
    return {
      graphToWeek: week.top - hourly.bottom,
      weekToScreenBottom: screen.bottom - week.bottom,
    };
  });
  expect(weatherSectionSpacing).not.toBeNull();
  expect(weatherSectionSpacing?.graphToWeek).toBeGreaterThanOrEqual(20);
  expect(weatherSectionSpacing?.weekToScreenBottom).toBeLessThanOrEqual(40);

  const chart = page.locator('[data-focus-id="weather-chart"]');
  await expect(page.locator('[data-focus-id="weather-mode-temperature"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(chart).toBeFocused();
  await expect(page.locator('.weather-selected-hour')).toContainText('Now · 7 am');

  const firstHourAlignment = await page.evaluate(() => {
    const marker = document.querySelector('.weather-chart__marker');
    const markerStrip = document.querySelector('.weather-chart__markers');
    const firstHour = document.querySelector('.weather-chart__hour');
    const chartSvg = document.querySelector('.weather-chart__canvas > svg');
    if (marker === null || markerStrip === null || firstHour === null || chartSvg === null)
      return null;

    const centre = (element: Element) => {
      const bounds = element.getBoundingClientRect();
      return (bounds.left + bounds.right) / 2;
    };

    return {
      markerToHour: Math.abs(centre(marker) - centre(firstHour)),
      markerBottom: marker.getBoundingClientRect().bottom,
      markerStripBottom: markerStrip.getBoundingClientRect().bottom,
      svgTop: chartSvg.getBoundingClientRect().top,
    };
  });
  expect(firstHourAlignment).not.toBeNull();
  expect(firstHourAlignment?.markerToHour).toBeLessThanOrEqual(1);
  expect(firstHourAlignment?.markerBottom).toBeLessThanOrEqual(firstHourAlignment?.svgTop ?? 0);
  expect(firstHourAlignment?.markerStripBottom).toBeCloseTo(firstHourAlignment?.svgTop ?? 0, 0);

  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.weather-selected-hour')).toContainText('8 am');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focus-id="weather-mode-rain"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.weather-selected-hour')).toContainText('mm expected');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focus-id="weather-mode-wind"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.weather-selected-hour')).toContainText('Gusts');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.weather-selected-hour')).toContainText('7 am');
  await page.keyboard.press('Enter');
  await expect(page.locator('.weather-selected-hour')).toContainText('Now · 7 am');
  for (let hour = 6; hour >= 0; hour -= 1) await page.keyboard.press('ArrowLeft');
  await expect(chart).toHaveAttribute('aria-valuenow', '0');
  await page.keyboard.press('ArrowLeft');
  // Leaving the chart goes to the aligned rail item, not a diagonal shortcut
  // back to the current route's link.
  await expect(page.locator('[data-focus-id="nav-chores"]')).toBeFocused();

  await page.getByRole('button', { name: 'Temperature', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Temperature', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  expect(
    await page.evaluate(() => {
      const content = document.querySelector('.app-content');
      return (
        content === null ||
        (content.scrollWidth <= content.clientWidth + 1 &&
          content.scrollHeight <= content.clientHeight + 1)
      );
    }),
  ).toBe(true);

  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);

  await captureEvidence(page, {
    path: resolve(evidence, 'weather-tv-1080.png'),
    animations: 'disabled',
  });
});

test('@visual Weather remains one-screen and legible on a compact dark television', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'hearth.appearance.v1',
      JSON.stringify({ theme: 'dark', eveningDimming: false }),
    );
  });
  await page.goto('/weather');

  await expect(page.locator('.weather-day')).toHaveCount(7);
  await expect(page.locator('.weather-day__wind').first()).toBeVisible();
  expect(
    await page
      .locator('.weather-day__wind')
      .first()
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  expect(
    await page.evaluate(() => {
      const content = document.querySelector('.app-content');
      return (
        content === null ||
        (content.scrollWidth <= content.clientWidth + 1 &&
          content.scrollHeight <= content.clientHeight + 1)
      );
    }),
  ).toBe(true);

  await captureEvidence(page, {
    path: resolve(evidence, 'weather-tv-1366-dark.png'),
    animations: 'disabled',
  });
});

test('@visual Weather stacks without page overflow on phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/weather');

  await expect(page.getByRole('heading', { name: 'Weather', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Rain', exact: true }).click();
  await expect(page.locator('.weather-selected-hour')).toContainText('mm expected');
  await expect(page.getByRole('link', { name: 'Weather', exact: true })).toHaveClass(
    /phone-tab--active/,
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await expect(page.locator('.weather-chart')).toHaveCSS('scrollbar-width', 'none');
  expect(
    await page
      .locator('.weather-chart')
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
  await expect(page.locator('.weather-day__wind').first()).toHaveText('Up to 24 km/h W');
  expect(
    await page
      .locator('.weather-day__wind')
      .first()
      .evaluate((element) => {
        const wind = element.getBoundingClientRect();
        const range = element
          .parentElement!.querySelector('.weather-day__range')!
          .getBoundingClientRect();
        return wind.top >= range.bottom;
      }),
  ).toBe(true);

  await captureEvidence(page, {
    path: resolve(evidence, 'weather-phone-portrait.png'),
    animations: 'disabled',
    fullPage: true,
  });
});

test('Calendar Week keeps weather text without temperature bars or empty-day dashes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/calendar/week');

  const strips = page.locator('.week-grid .week-forecast-strip');
  await expect(strips).toHaveCount(7);
  await expect(strips.first()).toHaveAttribute('aria-label', /chance of rain, low 11°, high 21°/);
  await expect(page.locator('.week-forecast-strip__range')).toHaveCount(0);
  await expect(page.locator('.week-column__empty')).toHaveCount(0);

  await captureEvidence(page, {
    path: resolve(evidence, 'calendar-week-weather-tv-1080.png'),
    animations: 'disabled',
  });
});

test('daily wind distinguishes calm, missing direction and an older saved forecast', async ({
  page,
}) => {
  await page.route(/\/api\/v1\/households\/[^/]+\/weather$/, async (route) => {
    const response = await route.fetch();
    const forecast = await response.json();
    forecast.freshness = 'stale';
    forecast.daily[0].maxWindSpeedKph = 0;
    forecast.daily[1].dominantWindDirectionDegrees = null;
    delete forecast.daily[2].maxWindSpeedKph;
    delete forecast.daily[2].dominantWindDirectionDegrees;
    await route.fulfill({ response, json: forecast });
  });
  await page.goto('/weather');
  await expect(page.getByRole('status')).toContainText('Showing the last saved forecast');
  await expect(page.locator('.weather-day__wind').nth(0)).toHaveText('Calm');
  await expect(page.locator('.weather-day__wind').nth(1)).toHaveText('Up to 20 km/h');
  await expect(page.locator('.weather-day__wind').nth(2)).toHaveText('Wind unavailable');
  await expect(page.locator('.weather-day')).toHaveCount(7);
});

test('rain keeps cached evidence and leaves a missing-hour gap without fabricating the live dot', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/\/api\/v1\/households\/[^/]+\/weather$/, async (route) => {
    const response = await route.fetch();
    const forecast = await response.json();
    forecast.freshness = 'stale';
    forecast.hourly = forecast.hourly.filter(
      (hour: { time: string }) => !hour.time.endsWith('T07:00'),
    );
    forecast.hourly[8].precipitationMillimetres = 49;
    await route.fulfill({ response, json: forecast });
  });
  await page.goto('/weather');
  await page.getByRole('button', { name: 'Rain', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Showing the last saved forecast');
  await expect(page.locator('.weather-day')).toHaveCount(7);
  await expect(page.locator('.weather-chart__now')).toHaveCount(0);
  const path = await page.locator('.weather-chart__rain-chance').getAttribute('d');
  expect(path!.match(/M /g)).toHaveLength(2);
  await expect(page.locator('.weather-chart__rain-grid text').last()).toHaveText('50');
  await expect(
    page.locator('.weather-chart__grid:not(.weather-chart__rain-grid) text').last(),
  ).toHaveText('100%');
  await expect(
    page.locator('.weather-chart__rain-bars rect[data-millimetres="0"]').first(),
  ).toHaveAttribute('height', '0');
  await expect(page.locator('.weather-chart__rain-bars rect[data-millimetres="49"]')).toBeVisible();
});
