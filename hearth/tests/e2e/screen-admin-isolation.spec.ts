import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const api = 'http://127.0.0.1:4310/api/v1';
const household = `${api}/households/household_hearth_demo`;
const companion = { 'user-agent': 'HearthCompanionTest' };

test.beforeEach(async ({ request }) => {
  await request.post(`${api}/demo/reset`, { headers: companion });
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
});

async function connectScreen(page: Page, request: APIRequestContext) {
  const secret = 'w'.repeat(43);
  const started = await request.post(`${api}/tv-pairing-sessions`, {
    data: {
      requestId: 'request_isolation_pair',
      deviceName: 'Test wall screen',
      pairingSecret: secret,
      applicationVersion: 'test',
    },
  });
  expect(started.ok()).toBe(true);
  const { pairing } = await started.json();
  const approval = await request.post(`${household}/pairing-approvals`, {
    headers: companion,
    data: { requestId: 'request_isolation_approve', code: pairing.code },
  });
  expect(approval.ok()).toBe(true);
  const exchange = await request.post(
    `${api}/tv-pairing-sessions/${pairing.id}/credential-exchanges`,
    {
      data: { requestId: 'request_isolation_exchange', pairingSecret: secret },
    },
  );
  expect(exchange.ok()).toBe(true);
  await page.context().addCookies([
    {
      name: 'hearth_device',
      value: secret,
      url: 'http://127.0.0.1:4320',
      httpOnly: true,
      sameSite: 'Strict',
    },
    {
      name: 'hearth_session',
      value: 'retained-adult-session',
      url: 'http://127.0.0.1:4320',
      httpOnly: true,
      sameSite: 'Strict',
    },
  ]);
  // Challenge the UI with old adult status as well as a retained cookie.
  await page.route('**/api/v1/auth/status', (route) =>
    route.fulfill({
      json: {
        mode: 'private',
        configured: true,
        secureOrigin: true,
        requiresSetup: false,
        authenticated: true,
        actor: { id: 'member_maya', displayName: 'Maya', role: 'adult' },
      },
    }),
  );
}

for (const viewport of [
  { name: 'wall-tablet', width: 390, height: 844 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'tv', width: 1920, height: 1080 },
  { name: '4k-tv', width: 3840, height: 2160 },
]) {
  test(`paired ${viewport.name} has no administration links and keeps appearance and family controls`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(viewport);
    await connectScreen(page, request);
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));
    page.on('console', (message) => {
      if (['warning', 'error'].includes(message.type())) problems.push(message.text());
    });
    for (const [route, surface] of [
      ['/calendar/agenda', '.agenda-screen'],
      ['/calendar/week', '.week-screen'],
      ['/calendar/month', '.month-screen'],
      ['/lists', '.lists-screen'],
      ['/meals', '.meals-screen'],
      ['/more', '.more-screen'],
    ]) {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(`${route}$`));
      await expect(page).toHaveTitle('Hearth');
      await expect(page.locator(surface!)).toBeVisible();
      await expect(page.locator('a[href^="/admin"], a[href="/pair"]')).toHaveCount(0);
      await expect(page.getByRole('button', { name: /passkey|recover/i })).toHaveCount(0);
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    }
    await page.screenshot({ path: test.info().outputPath(`${viewport.name}-more.png`) });
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual(
      [],
    );
    await page.getByRole('link', { name: 'Appearance', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/appearance$/);
    await page.locator('[data-focus-id="appearance-dark"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/more$/);
    await page.goto('/chores');
    const chore = page.locator('[data-focus-id="chore-primary"]');
    await chore.focus();
    await page.keyboard.press('Enter');
    await expect(chore).toContainText('Done');
    await page.keyboard.press('Enter');
    await expect(chore).toContainText('Mark done');
    expect(problems).toEqual([]);
  });
}

test('all admin routes and restored/encoded links return a paired screen to the family dashboard', async ({
  page,
  request,
}) => {
  await connectScreen(page, request);
  let adultReads = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/auth/')) adultReads++;
  });
  for (const path of [
    '/admin',
    '/admin/household',
    '/admin/people',
    '/admin/access',
    '/admin/today',
    '/admin/televisions',
    '/admin/connections',
    '/admin/connections/calendar',
    '/admin/connections/home-assistant',
    '/admin/planning',
    '/admin/lists',
    '/admin/meals',
    '/admin/photos',
    '/admin/routines',
    '/admin/chore-day',
    '/admin/pocket-money',
    '/admin/system',
    '/admin/activity',
    '/admin/rewards',
    '/pair',
    '/ADMIN/people',
    '/%61dmin/photos',
    '/%70air',
    '/admin/system/?from=screen#updates',
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await expect(page.locator('.admin-desktop-rail, .admin-auth-gate')).toHaveCount(0);
    await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
  }
  await page.reload();
  await expect(page).toHaveURL(/\/today$/);
  await page.goto('/calendar/agenda');
  await page.goBack();
  await expect(page).toHaveURL(/\/today$/);
  await page.goto('/admin/appearance');
  await expect(page).toHaveURL(/\/appearance$/);
  expect(adultReads).toBe(0);
});

test('unconfigured weather gives a paired screen phone guidance without a settings link', async ({
  page,
  request,
}) => {
  await connectScreen(page, request);
  await page.route('**/api/v1/households/*/weather', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      json: {
        ...body,
        configured: false,
        current: null,
        hourly: [],
        source: null,
        locationLabel: null,
      },
    });
  });
  await page.goto('/weather');
  await expect(page.getByText('Ask an adult to choose a location from their phone.')).toBeVisible();
  await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
});

test('an unconfigured calendar never offers administration on a paired screen', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await connectScreen(page, request);
  await page.route(/\/api\/v1\/households\/[^/]+\/(?:week|month)\?/, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      json: {
        ...body,
        calendars: [],
        events: [],
        freshness: 'stale',
        statusMessage: 'Ask an adult to connect calendars from their phone · Showing saved plans.',
      },
    });
  });
  for (const path of ['/calendar/agenda', '/calendar/week', '/calendar/month']) {
    await page.goto(path);
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Ask an adult to connect calendars from their phone' }),
    ).toContainText('Ask an adult to connect calendars from their phone');
    await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^(Sources|Admin|Open settings)$/i })).toHaveCount(
      0,
    );
  }
  await page.screenshot({ path: test.info().outputPath('screen-empty-calendar.png') });
  await page.context().clearCookies();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Sources', exact: true })).toBeVisible();
});

test('a generic screen uses runtime context even with stale adult status and no household access', async ({
  page,
}) => {
  await page.route('**/api/v1/runtime', (route) =>
    route.fulfill({
      json: {
        mode: 'private',
        sharedScreen: true,
        household: null,
        generatedAt: '2026-08-03T07:42:00+08:00',
        timezone: 'Australia/Perth',
        locale: 'en-AU',
        localDate: '2026-08-03',
        weekStart: '2026-08-03',
        currentMonth: '2026-08',
        requiresSetup: false,
      },
    }),
  );
  await page.route('**/api/v1/auth/status', (route) =>
    route.fulfill({
      json: {
        mode: 'private',
        configured: true,
        secureOrigin: true,
        requiresSetup: false,
        authenticated: true,
        actor: { id: 'member_maya', displayName: 'Maya', role: 'adult' },
      },
    }),
  );
  await page.goto('/admin');
  await expect(page.getByRole('button', { name: 'Connect shared screen' })).toBeVisible();
  await expect(page.getByRole('button', { name: /passkey|recover/i })).toHaveCount(0);
  await expect(page.locator('.admin-desktop-rail, .admin-auth-gate')).toHaveCount(0);
});

for (const cancelExchange of [false, true]) {
  test(`pairing clears another open admin document and refreshes ${cancelExchange ? 'cancelled' : 'normal'} exchange`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.context().addCookies([
      {
        name: 'hearth_session',
        value: 'retained-adult-session',
        url: 'http://127.0.0.1:4320',
        httpOnly: true,
        sameSite: 'Strict',
      },
    ]);
    await page.route('**/api/v1/runtime', async (route) => {
      const body = await (await route.fetch()).json();
      await route.fulfill({ json: { ...body, mode: 'private' } });
    });
    await page.route('**/api/v1/auth/status', async (route) => {
      const body = await (await route.fetch()).json();
      await route.fulfill({
        json: {
          ...body,
          mode: 'private',
          configured: true,
          secureOrigin: true,
          authenticated: !body.sharedScreen,
          actor: body.sharedScreen
            ? null
            : { id: 'member_maya', displayName: 'Maya', role: 'adult' },
        },
      });
    });
    await page.goto('/admin/people');
    await expect(page.getByRole('heading', { name: 'People', exact: true })).toBeVisible();
    const screen = await page.context().newPage();
    await screen.route('**/api/v1/runtime', async (route) => {
      const body = await (await route.fetch()).json();
      await route.fulfill({
        json: {
          ...body,
          mode: 'private',
          household: body.sharedScreen ? body.household : null,
          requiresSetup: false,
        },
      });
    });
    await screen.route('**/api/v1/auth/status', async (route) => {
      const body = await (await route.fetch()).json();
      await route.fulfill({
        json: {
          ...body,
          mode: 'private',
          configured: true,
          secureOrigin: true,
          authenticated: false,
          actor: null,
          requiresSetup: false,
        },
      });
    });
    let enter = () => {};
    let release = () => {};
    const exchanging = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await screen.route('**/api/v1/tv-pairing-sessions/*/credential-exchanges', async (route) => {
      const response = await route.fetch();
      enter();
      await gate;
      await route.fulfill({ response });
    });
    await screen.goto('/today');
    const created = screen.waitForResponse((response) =>
      response.url().endsWith('/api/v1/tv-pairing-sessions'),
    );
    await screen.getByRole('button', { name: 'Connect shared screen' }).click();
    const { pairing } = await (await created).json();
    expect(
      (
        await request.post(`${household}/pairing-approvals`, {
          headers: companion,
          data: { requestId: 'request_other_document_approve', code: pairing.code },
        })
      ).ok(),
    ).toBe(true);
    await exchanging;
    if (cancelExchange) await screen.getByRole('button', { name: 'Cancel connection' }).click();
    release();
    await expect(screen).toHaveURL(/\/today$/);
    await expect(screen.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await expect(page.locator('.admin-desktop-rail, .admin-auth-gate')).toHaveCount(0);
    await expect(screen.getByRole('button', { name: /passkey|recover/i })).toHaveCount(0);
    await screen.close();
  });
}

test.describe('recognized television browser', () => {
  test.use({ userAgent: 'Mozilla/5.0 SMART-TV Tizen HearthTV/1.0' });
  test('signed-out entry offers screen connection without adult sign-in or recovery', async ({
    page,
  }) => {
    await page.route('**/api/v1/runtime', (route) =>
      route.fulfill({
        json: {
          mode: 'private',
          sharedScreen: true,
          household: null,
          generatedAt: '2026-08-03T07:42:00+08:00',
          timezone: 'Australia/Perth',
          locale: 'en-AU',
          localDate: '2026-08-03',
          weekStart: '2026-08-03',
          currentMonth: '2026-08',
          requiresSetup: false,
        },
      }),
    );
    await page.route('**/api/v1/auth/status', (route) =>
      route.fulfill({
        json: {
          mode: 'private',
          configured: true,
          secureOrigin: true,
          requiresSetup: false,
          authenticated: false,
          actor: null,
        },
      }),
    );
    await page.goto('/admin');
    await expect(page.getByRole('button', { name: 'Connect shared screen' })).toBeFocused();
    await expect(page.getByRole('button', { name: /passkey|recover/i })).toHaveCount(0);
    await expect(page.getByText('Trouble signing in?', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Phone or computer' })).toHaveCount(0);
  });
});
