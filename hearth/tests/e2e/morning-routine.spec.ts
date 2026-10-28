import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { DEFAULT_MODULE_FLAGS, MODULE_IDS } from '../../packages/shared/src/modules';

const api = 'http://127.0.0.1:4310/api/v1';
const home = `${api}/households/household_hearth_demo`;
const adult = { 'X-Hearth-Demo-Actor': 'member_maya' };
const titles = [
  'Get dressed',
  'Shoes and socks',
  'Have breakfast',
  'Pack school bag',
  'Fill water bottle',
];
const overview = {
  householdId: 'household_hearth_demo',
  generatedAt: '2026-08-03T07:42:00+08:00',
  timezone: 'Australia/Perth',
  localDate: '2026-08-03',
  isWeekday: true,
  settingsRevision: 1,
  startTime: '07:00',
  endTime: '08:00',
  people: ['Ari', 'Bo', 'Kai'].map((name, i) => ({
    person: {
      id: `member_${name.toLowerCase()}`,
      displayName: name,
      color: ['#1668b7', '#3f7251', '#c97900'][i],
      role: 'child',
      avatarUrl: i === 1 ? '/demo/maya.png' : '/demo/ezra.png',
    },
    steps: titles.map((title, j) => ({
      id: `step_${i}_${j}`,
      title,
      isCompleted: j === 0,
      version: j === 0 ? 1 : 0,
    })),
  })),
};
test.beforeEach(async ({ request }) => {
  expect((await request.post(`${api}/demo/reset`)).ok()).toBe(true);
});
for (const viewport of [
  { width: 3840, height: 2160 },
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1280, height: 640 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
])
  for (const theme of ['light', 'dark'] as const) {
    test(`Morning Routine fits ${viewport.width}x${viewport.height} ${theme} @visual @a11y`, async ({
      page,
    }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      await page.route('**/api/v1/households/*/modules', (route) =>
        route.fulfill({
          json: {
            householdId: overview.householdId,
            enabled: { ...DEFAULT_MODULE_FLAGS, morningRoutine: true },
          },
        }),
      );
      await page.route('**/api/v1/households/*/morning-routine', (route) =>
        route.fulfill({ json: overview }),
      );
      await page.goto('/morning-routine');
      await expect(page).toHaveTitle(/Hearth/);
      await expect(
        page.getByRole('heading', { name: 'Morning Routine', exact: true }),
      ).toBeVisible();
      await expect(page.getByText('18:00', { exact: true })).toBeVisible();
      await expect(
        page.getByRole('progressbar', { name: 'Morning time remaining' }),
      ).toHaveAttribute('aria-valuenow', '30');
      expect(
        await page
          .locator('.morning-timer__fill')
          .evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration)),
      ).toBeLessThanOrEqual(0.00001);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      if (viewport.width >= 1200) {
        expect(
          await page
            .locator('.app-content')
            .evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
        ).toBe(true);
        expect(
          await page
            .locator('.morning-screen')
            .evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
        ).toBe(true);
        const first = page.getByRole('button', { name: 'Ari: Shoes and socks', exact: true });
        await first.focus();
        await page.keyboard.press('ArrowLeft');
        await expect(page.locator('.tv-rail :focus')).toHaveCount(1);
      }
      expect(
        (await new AxeBuilder({ page }).analyze()).violations.filter((violation) =>
          ['serious', 'critical'].includes(violation.impact ?? ''),
        ),
      ).toEqual([]);
      expect(errors).toEqual([]);
      await page.screenshot({
        path: info.outputPath('morning-routine.png'),
        fullPage: viewport.width < 1200,
      });
    });
  }
test('adult settings save/reorder and any-order checks survive reopening; exact retry does not toggle twice', async ({
  page,
  request,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (
      await request.put(`${home}/modules/morningRoutine`, {
        headers: adult,
        data: { requestId: 'request_enable_morning', enabled: true },
      })
    ).ok(),
  ).toBe(true);
  await page.goto('/admin/morning-routine');
  await expect(page.getByRole('checkbox', { name: 'Ezra', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Maya', exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Add step for Ezra' }).click();
  await page.getByRole('textbox', { name: 'Ezra step 1' }).fill('Get dressed');
  await page.getByRole('button', { name: 'Add step for Ezra' }).click();
  await page.getByRole('textbox', { name: 'Ezra step 2' }).fill('Pack school bag');
  await page.getByRole('button', { name: 'Move Ezra step 2 up' }).click();
  await expect(page.getByRole('textbox', { name: 'Ezra step 1' })).toHaveValue('Pack school bag');
  await page.getByRole('button', { name: 'Save Morning Routine' }).click();
  await expect(page.getByText('Morning Routine saved.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Ezra step 1' })).toHaveValue('Pack school bag');
  await page.screenshot({ path: info.outputPath('morning-settings-phone.png'), fullPage: true });
  await page.goto('/morning-routine');
  let lost = false;
  const requests: unknown[] = [];
  await page.route('**/morning-routine/completion', async (route) => {
    requests.push(route.request().postDataJSON());
    if (!lost) {
      lost = true;
      await route.fetch();
      await route.abort('failed');
    } else await route.continue();
  });
  const step = page.getByRole('button', { name: 'Ezra: Get dressed', exact: true });
  await step.click(); // A later step can be checked first.
  await expect(page.getByRole('button', { name: 'Retry check' })).toBeVisible();
  await expect(step).toHaveAttribute('aria-pressed', 'false'); // No false success for a lost response.
  await page.getByRole('button', { name: 'Retry check' }).click();
  await expect(step).toHaveAttribute('aria-pressed', 'true');
  expect(requests).toHaveLength(2);
  expect(requests[0]).toEqual(requests[1]);
  await page.reload();
  await expect(step).toHaveAttribute('aria-pressed', 'true');
  await step.click();
  await expect(step).toHaveAttribute('aria-pressed', 'false');
  for (const id of MODULE_IDS.filter((id) => id !== 'morningRoutine'))
    expect(
      (
        await request.put(`${home}/modules/${id}`, {
          headers: adult,
          data: { requestId: `request_solo_${id.toLowerCase()}`, enabled: false },
        })
      ).ok(),
    ).toBe(true);
  await page.goto('/admin/planning');
  await expect(page.getByRole('link', { name: 'Morning Routine', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Routines and chores', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Morning Routine', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Ezra step 1' })).toHaveValue('Pack school bag');
});
test('weekend and failed-refresh states retain steps but prevent stale writes', async ({
  page,
}) => {
  await page.route('**/api/v1/households/*/modules', (route) =>
    route.fulfill({
      json: {
        householdId: overview.householdId,
        enabled: { ...DEFAULT_MODULE_FLAGS, morningRoutine: true },
      },
    }),
  );
  await page.route('**/api/v1/households/*/morning-routine', (route) =>
    route.fulfill({
      json: {
        ...overview,
        generatedAt: '2026-08-08T07:42:00+08:00',
        localDate: '2026-08-08',
        isWeekday: false,
      },
    }),
  );
  await page.goto('/morning-routine');
  await expect(page.getByText('Weekend', { exact: true })).toBeVisible();
  await expect(page.locator('[data-focus-id="morning-today"]')).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Ari: Shoes and socks', exact: true }),
  ).toHaveAttribute('aria-disabled', 'true');
  await page.route('**/api/v1/households/*/morning-routine', (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: {
          code: 'OFFLINE',
          message: 'Routine unavailable',
          retryable: true,
          requestId: null,
        },
      },
    }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(
    page.getByText('Showing saved progress. Refresh before ticking steps.'),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ari', exact: true })).toBeVisible();
});

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1280, height: 640 },
]) {
  test(`long steps and extra people remain paged and bounded at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.route('**/api/v1/households/*/modules', (route) =>
      route.fulfill({
        json: {
          householdId: overview.householdId,
          enabled: { ...DEFAULT_MODULE_FLAGS, morningRoutine: true },
        },
      }),
    );
    const people = [
      ...overview.people,
      {
        ...overview.people[0]!,
        person: { ...overview.people[0]!.person, id: 'member_extra', displayName: 'Dee' },
      },
    ].map((person, i) => ({
      ...person,
      steps: Array.from({ length: 12 }, (_, j) => ({
        id: `step_long_${i}_${j}`,
        title: 'Get ready for school and put your packed school bag and water bottle by the door',
        isCompleted: false,
        version: 0,
      })),
    }));
    await page.route('**/api/v1/households/*/morning-routine', (route) =>
      route.fulfill({ json: { ...overview, people } }),
    );
    await page.goto('/morning-routine');
    await expect(page.getByRole('heading', { name: 'Ari', exact: true })).toBeVisible();
    expect(
      await page
        .locator('.app-content')
        .evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
    ).toBe(true);
    await page.getByRole('button', { name: 'More steps for Ari', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Previous steps for Ari', exact: true }),
    ).toBeEnabled();
    await page.getByRole('button', { name: 'More people', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Dee', exact: true })).toBeVisible();
    expect(
      await page
        .locator('.app-content')
        .evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
    ).toBe(true);
  });
}
