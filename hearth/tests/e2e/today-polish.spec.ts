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
  await expect(page).toHaveURL(/\/calendar\/agenda\?start=2026-08-03$/);
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
