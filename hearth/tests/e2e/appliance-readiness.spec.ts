import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const householdRoutes = [
  { path: '/today', title: 'Today' },
  { path: '/calendar/week', title: 'This week' },
  { path: '/calendar/month', title: 'August' },
  { path: '/calendar/agenda', title: 'Agenda' },
  { path: '/weather', title: 'Weather' },
  { path: '/reminders', title: 'Reminders' },
  { path: '/chores', title: 'Chores' },
  { path: '/lists', title: 'Lists' },
  { path: '/meals', title: 'Meals' },
  { path: '/home', title: 'Home' },
  { path: '/photos', title: 'Photos' },
  { path: '/appearance', title: 'Appearance' },
  { path: '/more', title: 'More' },
] as const;

const adminRoutes = [
  { path: '/admin', title: 'Hearth settings' },
  { path: '/admin/household', title: 'Household' },
  { path: '/admin/people', title: 'People' },
  { path: '/admin/access', title: 'Adult access' },
  { path: '/admin/today', title: 'Today & notices' },
  { path: '/admin/televisions', title: 'Paired televisions' },
  { path: '/admin/connections', title: 'Connections' },
  { path: '/admin/connections/calendar', title: 'Calendar' },
  { path: '/admin/connections/home-assistant', title: 'Home Assistant' },
  { path: '/admin/planning', title: 'Family planning' },
  { path: '/admin/lists', title: 'Household lists' },
  { path: '/admin/meals', title: 'Meal planning' },
  { path: '/admin/photos', title: 'Manage photos' },
  { path: '/admin/routines', title: 'Routines and chores' },
  { path: '/admin/chore-day', title: 'Chores this week' },
  { path: '/admin/pocket-money', title: 'Pocket money' },
  { path: '/admin/system', title: 'System health' },
  { path: '/admin/activity', title: 'Recent activity' },
] as const;

const themes = ['light', 'dark'] as const;
const tabletViewports = [
  { name: 'portrait', width: 820, height: 1180, theme: 'light' },
  { name: 'landscape', width: 1180, height: 820, theme: 'dark' },
] as const;

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
});

for (const route of householdRoutes) {
  for (const theme of themes) {
    test(`appliance TV route ${route.path} is ${theme}, one-screen and D-pad ready`, async ({
      page,
    }) => {
      await prepareRoute(page, route.path, route.title, theme, { width: 1920, height: 1080 });
      await expect(page.locator('[data-focus-id]:focus')).toHaveCount(1);
      await page.keyboard.press('ArrowDown');
      await expect(page.locator('[data-focus-id]:focus')).toHaveCount(1);
      if (route.path !== '/more') {
        expect(
          await page.evaluate(() => {
            const content = document.querySelector('#main-content');
            return content === null || content.scrollHeight <= content.clientHeight + 1;
          }),
        ).toBe(true);
      }
      await expectNoSeriousAccessibilityViolations(page);
    });

    test(`appliance phone route ${route.path} is ${theme}, accessible and horizontally contained`, async ({
      page,
    }) => {
      await prepareRoute(page, route.path, route.title, theme, { width: 390, height: 844 });
      await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
      await expectNoSeriousAccessibilityViolations(page);
    });
  }
}

for (const route of householdRoutes) {
  for (const viewport of tabletViewports) {
    test(`appliance tablet ${viewport.name} route ${route.path} is contained and companion-ready`, async ({
      page,
    }) => {
      await prepareRoute(page, route.path, route.title, viewport.theme, viewport);
      await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
      await expect(page.locator('.tv-rail')).toBeHidden();
      await page.keyboard.press('Tab');
      expect(
        await page.evaluate(
          () =>
            document.activeElement instanceof HTMLElement &&
            document.activeElement !== document.body,
        ),
      ).toBe(true);
      await expectNoSeriousAccessibilityViolations(page);
    });
  }
}

for (const route of adminRoutes) {
  for (const theme of themes) {
    test(`admin phone route ${route.path} is ${theme}, accessible and horizontally contained`, async ({
      page,
    }) => {
      await prepareRoute(page, route.path, route.title, theme, { width: 390, height: 844 });
      await expectNoSeriousAccessibilityViolations(page);
    });

    test(`admin TV route ${route.path} is ${theme}, accessible and keyboard ready`, async ({
      page,
    }) => {
      await prepareRoute(page, route.path, route.title, theme, { width: 1920, height: 1080 });
      expect(
        await page.evaluate(
          () =>
            document.activeElement instanceof HTMLElement &&
            document.activeElement !== document.body,
        ),
      ).toBe(true);
      await expectNoSeriousAccessibilityViolations(page);
    });
  }
}

for (const route of adminRoutes) {
  for (const viewport of tabletViewports) {
    test(`admin tablet ${viewport.name} route ${route.path} is contained and keyboard-ready`, async ({
      page,
    }) => {
      await prepareRoute(page, route.path, route.title, viewport.theme, viewport);
      if (viewport.name === 'landscape') {
        await expect(page.locator('.admin-desktop-rail')).toBeVisible();
        await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeHidden();
      } else {
        await expect(page.locator('.admin-desktop-rail')).toBeHidden();
        await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
      }
      expect(
        await page.evaluate(
          () =>
            document.activeElement instanceof HTMLElement &&
            document.activeElement !== document.body,
        ),
      ).toBe(true);
      await expectNoSeriousAccessibilityViolations(page);
    });
  }
}

for (const state of [
  { path: '/chores', title: 'Chores', copy: 'Offline · Showing saved chores.' },
  { path: '/meals', title: 'Meals', copy: 'Offline · Showing saved meals.' },
  { path: '/reminders', title: 'Reminders', copy: 'Offline · Showing saved reminders.' },
  { path: '/weather', title: 'Weather', copy: 'Offline · Showing saved weather.' },
] as const) {
  test(`${state.path} keeps cached content visible offline`, async ({ context, page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(state.path);
    await expect(page.locator('h1').first()).toHaveText(state.title);
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByRole('status')).toContainText(state.copy);
    await context.setOffline(false);
  });
}

async function prepareRoute(
  page: Page,
  path: string,
  title: string,
  theme: 'light' | 'dark',
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.addInitScript((selectedTheme) => {
    window.localStorage.setItem(
      'hearth.appearance.v1',
      JSON.stringify({ theme: selectedTheme, eveningDimming: false }),
    );
  }, theme);
  await page.goto(path);
  await expect(page.locator('h1').first()).toHaveText(title);
  await expect(page.locator('#main-content')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= window.innerWidth + 1 &&
        document.body.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
}
