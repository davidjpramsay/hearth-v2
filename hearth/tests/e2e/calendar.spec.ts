import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { captureEvidence } from './visualEvidence';

const evidence = resolve('docs/evidence/calendar-navigation');

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
});

test.beforeEach(async ({ page, request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
  await page.setViewportSize({ width: 1920, height: 1080 });
});

test('Calendar is one television destination with Week, Month and Agenda views', async ({
  page,
}) => {
  await page.goto('/calendar/week');
  const rail = page.getByRole('complementary', { name: 'Primary navigation' });
  await expect(rail.getByRole('link', { name: 'Calendar', exact: true })).toBeVisible();
  await expect(rail.getByRole('link', { name: 'Week', exact: true })).toHaveCount(0);
  await expect(rail.getByRole('link', { name: 'Month', exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Calendar view' })).toContainText(
    'WeekMonthAgenda',
  );

  await page.locator('[data-focus-id="calendar-view-agenda"]').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/calendar\/agenda$/);
  await expect(page.getByRole('heading', { name: 'Agenda' })).toBeVisible();
  const agendaDays = page.locator('.agenda-day');
  await expect(agendaDays).toHaveCount(4);
  await expect(agendaDays.nth(0)).toContainText('Mon3 AugToday');
  await expect(agendaDays.nth(3)).toContainText('Thu6 Aug');
  await expect(page.getByRole('button', { name: /Earlier|Later/ })).toHaveCount(0);
  await expect(page.locator('.agenda-event').first()).toBeFocused();
});

test('Agenda always starts today and ignores old period links', async ({ page }) => {
  await page.goto('/calendar/agenda?start=2026-07-20');
  const agendaDays = page.locator('.agenda-day');
  await expect(agendaDays).toHaveCount(4);
  await expect(agendaDays.nth(0)).toContainText('Mon3 AugToday');
  await expect(agendaDays.nth(3)).toContainText('Thu6 Aug');
  await expect(page.getByText('3–6 August')).toBeVisible();
  await expect(page.getByText('Fri7 Aug')).toHaveCount(0);
});

test('Agenda event details open and Back restores the exact event focus', async ({ page }) => {
  await page.goto('/calendar/agenda');
  const event = page.locator('.agenda-event').first();
  await expect(event).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'School drop-off' })).toBeVisible();
  await expect(dialog).toContainText('Ezra');
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(event).toBeFocused();
});

test('week navigation changes the requested date and returns to the real current week', async ({
  page,
}) => {
  await page.goto('/calendar/week');
  await page.getByRole('button', { name: 'Later week' }).click();
  await expect(page).toHaveURL(/start=2026-08-10/);
  await expect(page.getByText('10–16 August')).toBeVisible();
  await page.getByRole('button', { name: 'Go to this week' }).click();
  await expect(page).not.toHaveURL(/start=/);
  await expect(page.getByText('3–9 August')).toBeVisible();
});

test('legacy Week and Month links preserve their query while redirecting to Calendar', async ({
  page,
}) => {
  await page.goto('/week?scenario=unavailable');
  await expect(page).toHaveURL(/\/calendar\/week\?scenario=unavailable$/);
  await expect(page.getByRole('status')).toContainText('Showing saved plans');
  await page.goto('/month?month=2026-09');
  await expect(page).toHaveURL(/\/calendar\/month\?month=2026-09$/);
  await expect(page.getByRole('heading', { name: 'September' })).toBeVisible();
});

test('Month renders on television browsers without Array.prototype.toSorted', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Array.prototype, 'toSorted', {
      configurable: true,
      value: undefined,
      writable: true,
    });
  });

  await page.goto('/calendar/month');
  await expect(page.getByRole('heading', { name: 'August', exact: true })).toBeVisible();
  await expect(page.locator('.month-grid')).toBeVisible();
  await expect(page.locator('.month-legend')).toContainText('Calendar key');
});

test('Month fills the television height and matches the Week navigation bar', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/calendar/month');

  const monthGridBox = await page.locator('.month-grid').boundingBox();
  const monthFooterBox = await page.locator('.month-footer-controls').boundingBox();
  if (monthGridBox === null || monthFooterBox === null) {
    throw new Error('Expected the Month calendar and navigation bar to be visible');
  }

  expect(monthGridBox.height).toBeGreaterThan(470);
  expect(monthFooterBox.y + monthFooterBox.height).toBeGreaterThan(860);

  await page.goto('/calendar/week');
  const weekFooterBox = await page.locator('.week-footer-controls').boundingBox();
  if (weekFooterBox === null) throw new Error('Expected the Week navigation bar to be visible');
  expect(monthFooterBox.height).toBe(weekFooterBox.height);
});

test('Week and Month events use their calendar colour as a card surface', async ({ page }) => {
  await page.goto('/calendar/week');
  const weekEvent = page.getByRole('button', { name: /School drop-off, Ezra$/ }).first();
  await expect(weekEvent).toBeVisible();
  expect(await weekEvent.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
    'rgba(0, 0, 0, 0)',
  );
  await expect(weekEvent).toHaveCSS('border-left-width', '1px');

  await page.goto('/calendar/month');
  const monthEvent = page
    .locator('.month-event-label')
    .filter({ hasText: 'School drop-off' })
    .first();
  await expect(monthEvent).toBeVisible();
  expect(
    await monthEvent.evaluate((element) => getComputedStyle(element).backgroundColor),
  ).not.toBe('rgba(0, 0, 0, 0)');
  await expect(monthEvent.locator('i')).toHaveCount(0);
});

test('multiple all-day Week events stack without overlapping and keep D-pad order', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.route(/\/api\/v1\/households\/[^/]+\/week\?start=/, async (route) => {
    const response = await route.fetch();
    const week = (await response.json()) as {
      events: Array<Record<string, unknown>>;
    };
    const source = week.events[0];
    if (source === undefined) throw new Error('Expected seeded calendar events');

    week.events.push(
      {
        ...source,
        id: 'event_uniform_due',
        title: 'Formal uniform',
        start: '2026-08-06T00:00:00+08:00',
        end: '2026-08-06T23:59:00+08:00',
        startLocalDate: '2026-08-06',
        endLocalDate: '2026-08-06',
        allDay: true,
      },
      {
        ...source,
        id: 'event_homework_due',
        title: 'English HWK Due',
        start: '2026-08-06T00:00:00+08:00',
        end: '2026-08-06T23:59:00+08:00',
        startLocalDate: '2026-08-06',
        endLocalDate: '2026-08-06',
        allDay: true,
      },
    );
    await route.fulfill({ response, json: week });
  });

  await page.goto('/calendar/week');
  const uniform = page.getByRole('button', { name: /All day, Formal uniform/ });
  const homework = page.getByRole('button', { name: /All day, English HWK Due/ });
  const uniformBox = await uniform.boundingBox();
  const homeworkBox = await homework.boundingBox();
  if (uniformBox === null || homeworkBox === null) {
    throw new Error('Expected both all-day cards to be visible');
  }

  expect(uniformBox.y + uniformBox.height).toBeLessThan(homeworkBox.y);
  await uniform.focus();
  await page.keyboard.press('ArrowDown');
  await expect(homework).toBeFocused();
});

test('phone Calendar exposes sources and More exposes family tools before settings', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar/agenda');
  await expect(page.getByRole('link', { name: 'Calendar', exact: true })).toHaveClass(
    /phone-tab--active/,
  );
  await expect(page.getByRole('link', { name: 'Sources' })).toBeVisible();
  await page.getByRole('link', { name: 'More', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'More' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Lists/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Connections/ })).toBeVisible();
});

for (const viewport of [
  { name: 'agenda-tv-1080', path: '/calendar/agenda', width: 1920, height: 1080 },
  { name: 'week-tv-1366', path: '/calendar/week', width: 1366, height: 768 },
  { name: 'month-tv-1366', path: '/calendar/month', width: 1366, height: 768 },
  { name: 'agenda-phone-portrait', path: '/calendar/agenda', width: 390, height: 844 },
  { name: 'week-phone-landscape', path: '/calendar/week', width: 844, height: 390 },
  { name: 'more-phone-portrait', path: '/more', width: 390, height: 844 },
] as const) {
  test(`@visual and @a11y ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(viewport.path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
    await captureEvidence(page, {
      path: resolve(evidence, `${viewport.name}.png`),
      animations: 'disabled',
    });
  });
}
