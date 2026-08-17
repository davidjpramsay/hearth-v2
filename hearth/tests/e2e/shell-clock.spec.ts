import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const householdRoutes = [
  '/today',
  '/calendar/week',
  '/calendar/month',
  '/calendar/agenda',
  '/chores',
  '/lists',
  '/meals',
  '/home',
  '/photos',
  '/more',
] as const;

test.beforeEach(async ({ page, request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
  await page.setViewportSize({ width: 1920, height: 1080 });
});

test('every television household page shows one consistent date and time in the rail', async ({
  page,
}) => {
  for (const route of householdRoutes) {
    await page.goto(route);
    const clock = page.locator('.household-date-time--rail');
    await expect(clock).toBeVisible();
    await expect(clock.locator('.household-date-time__time')).toHaveText('7:42 am');
    await expect(clock.locator('.household-date-time__date')).toHaveText('Monday 3 August');
    await expect(page.locator('.household-date-time:visible')).toHaveCount(1);
  }
});

test('phone household and administration pages share the compact date and time header', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/lists');
  const mobileClock = page.locator('.household-date-time--mobile');
  await expect(mobileClock).toBeVisible();
  await expect(mobileClock.locator('.household-date-time__time')).toHaveText('7:42 am');
  await expect(mobileClock.locator('.household-date-time__date')).toHaveText('Monday 3 August');
  await expect(page.locator('.household-date-time:visible')).toHaveCount(1);

  await page.goto('/admin/meals');
  const companionClock = page.locator('.household-date-time--companion');
  await expect(companionClock).toBeVisible();
  await expect(companionClock.locator('.household-date-time__time')).toHaveText('7:42 am');
  await expect(companionClock.locator('.household-date-time__date')).toHaveText('Monday 3 August');
  await expect(page.locator('.household-date-time:visible')).toHaveCount(1);

  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
});

test('Today uses the shared shell clock without duplicating its former page clock', async ({
  page,
}) => {
  await page.goto('/today');
  await expect(page.locator('.household-date-time:visible')).toHaveCount(1);
  await expect(page.locator('.today-glance')).toContainText('16°Clear');
  await expect(page.locator('.today-glance')).not.toContainText('7:42 am');
});
