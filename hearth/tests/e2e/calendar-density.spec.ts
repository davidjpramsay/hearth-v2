import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { CalendarEvent, WeekSchedule } from '@hearth/shared';

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
});

async function crowdedWeek(page: Page) {
  await page.route(/\/api\/v1\/households\/[^/]+\/week\?start=/, async (route) => {
    const response = await route.fetch();
    const week = (await response.json()) as WeekSchedule;
    const source = week.events[0]!;
    const event = (
      id: string,
      title: string,
      start: string,
      end: string,
      allDay = false,
    ): CalendarEvent => ({
      ...source,
      id,
      title,
      start,
      end,
      allDay,
      owner: null,
      sourceLabel: 'Family',
      startLocalDate: start.slice(0, 10),
      endLocalDate: end.slice(0, 10),
    });
    week.events = [
      event('early', 'Early swim', '2026-08-03T05:30:00+08:00', '2026-08-03T06:30:00+08:00'),
      event(
        'overnight',
        'Overnight trip',
        '2026-08-03T20:00:00+08:00',
        '2026-08-04T06:00:00+08:00',
      ),
      event('late', 'Late pickup', '2026-08-03T23:45:00+08:00', '2026-08-04T00:00:00+08:00'),
      ...[
        'School holiday',
        'Library books due',
        'Wear sports uniform',
        'Bring permission slip',
      ].map((title, index) =>
        event(
          `all-day-${index}`,
          title,
          '2026-08-05T00:00:00+08:00',
          '2026-08-05T23:59:00+08:00',
          true,
        ),
      ),
      ...[
        'Dentist appointment',
        'Piano lesson',
        'Netball training',
        'Community garden',
        'Friends visiting',
      ].map((title, index) =>
        event(`busy-${index}`, title, '2026-08-05T14:00:00+08:00', '2026-08-05T15:00:00+08:00'),
      ),
    ];
    await route.fulfill({ response, json: week });
  });
}

for (const viewport of [
  { width: 1366, height: 768, theme: 'dark' },
  { width: 1920, height: 1080, theme: 'dark' },
  { width: 3840, height: 2160, theme: 'dark' },
  { width: 1920, height: 1080, theme: 'light' },
]) {
  test(`off-hours and crowded Week stay bounded at ${viewport.width}px ${viewport.theme}`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize(viewport);
    await page.addInitScript(
      (theme) =>
        localStorage.setItem(
          'hearth.appearance.v1',
          JSON.stringify({ theme, eveningDimming: false }),
        ),
      viewport.theme,
    );
    await crowdedWeek(page);
    await page.goto('/calendar/week');
    await expect(page).toHaveTitle(/Hearth/);
    await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
    await expect(page.locator('.week-time-axis span').first()).toHaveText('12 am');
    await expect(page.locator('.week-time-axis span').last()).toHaveText('12 am');
    await expect(page.getByRole('button', { name: /Until 6:00 am, Overnight trip/ })).toBeVisible();
    const more = page.getByRole('button', { name: /5 more events, Wed/ });
    await expect(more).toBeVisible();
    const geometryErrors = await page.locator('.week-column').evaluateAll((columns) =>
      columns.flatMap((column) => {
        const issues: string[] = [];
        const timeline = column.querySelector('.week-column__events')!.getBoundingClientRect();
        const cards = Array.from(
          column.querySelectorAll('.week-column__events .week-event'),
          (card) => card.getBoundingClientRect(),
        );
        for (const [index, card] of cards.entries()) {
          if (
            card.top < timeline.top - 1 ||
            card.bottom > timeline.bottom + 1 ||
            card.left < timeline.left ||
            card.right > timeline.right
          )
            issues.push('clipped card');
          for (const other of cards.slice(index + 1)) {
            if (
              card.left < other.right &&
              card.right > other.left &&
              card.top < other.bottom &&
              card.bottom > other.top
            )
              issues.push('overlapping cards');
          }
        }
        return issues;
      }),
    );
    expect(geometryErrors).toEqual([]);
    const axisError = await page.locator('.week-grid').evaluate((grid) => {
      const timeline = grid.querySelector('.week-column__events')!.getBoundingClientRect();
      const labels = Array.from(grid.querySelectorAll('.week-time-axis span'));
      return Math.max(
        ...labels.map((label, index) => {
          const bounds = label.getBoundingClientRect();
          return Math.abs(
            bounds.top +
              bounds.height / 2 -
              (timeline.top + (index / (labels.length - 1)) * timeline.height),
          );
        }),
      );
    });
    expect(axisError).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`crowded-week-${viewport.theme}.png`),
      fullPage: true,
    });

    await more.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.agenda-event')).toHaveCount(9);
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(dialog.locator('.agenda-event').first()).toBeFocused();
    for (let index = 0; index < 8; index++) await page.keyboard.press('ArrowDown');
    const last = dialog.locator('.agenda-event').last();
    await expect(last).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog.getByRole('heading', { name: 'Friends visiting' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Back to day' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(last).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(last).toBeFocused();
    await page.keyboard.press('Tab');
    await page.screenshot({ path: testInfo.outputPath(`full-day-${viewport.theme}.png`) });
    expect(
      (await new AxeBuilder({ page }).include('.calendar-day-dialog').analyze()).violations,
    ).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(more).toBeFocused();
    await expect(page).toHaveURL(/\/calendar\/week$/);

    await page.getByRole('button', { name: /1 more events, Mon/ }).click();
    await dialog.getByRole('button', { name: /Late pickup/ }).click();
    await expect(dialog).toContainText('Monday 3 August · 11:45 pm – Tuesday 4 August · 12:00 am');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    expect(errors).toEqual([]);
  });
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
]) {
  test(`phone and tablet keep every event readable at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await crowdedWeek(page);
    await page.goto('/calendar/week');
    await expect(page.locator('.week-grid')).toHaveCount(0);
    await expect(page.locator('.agenda-event').first()).toBeFocused();
    await expect(page.getByRole('button', { name: /Late pickup/ })).toHaveCount(1);
    const continuation = page.getByRole('button', { name: /Until 6:00 am, Overnight trip/ });
    await continuation.click();
    await expect(page.getByRole('dialog')).toContainText(
      'Monday 3 August · 8:00 pm – Tuesday 4 August · 6:00 am',
    );
    await page.keyboard.press('Escape');
    await expect(continuation).toBeFocused();
    const busyDay = page.locator('.agenda-day').nth(2);
    await expect(busyDay.locator('.agenda-event')).toHaveCount(9);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await busyDay.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('crowded-week-companion.png') });
  });
}

test('overflow works from saved plans offline and remote arrows cross days', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await crowdedWeek(page);
  await page.goto('/calendar/week');
  const early = page.getByRole('button', { name: /5:30 am, Early swim/ });
  await expect(early).toBeFocused();
  await page.keyboard.press('ArrowRight');
  const continuation = page.getByRole('button', { name: /Until 6:00 am, Overnight trip/ });
  await expect(continuation).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(early).toBeFocused();
  await context.setOffline(true);
  await expect(page.getByRole('status')).toContainText('Offline');
  const more = page.getByRole('button', { name: /5 more events, Wed/ });
  await more.click();
  await expect(page.getByRole('dialog').locator('.agenda-event')).toHaveCount(9);
  await page.keyboard.press('Escape');
  await expect(more).toBeFocused();
});
