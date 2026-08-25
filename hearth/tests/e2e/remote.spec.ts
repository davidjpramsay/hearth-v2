import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page, request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
  await page.setViewportSize({ width: 1920, height: 1080 });
});

test('remote-only Today → Calendar views → Chores → complete → undo → Back flow', async ({
  page,
}) => {
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.locator('[data-focus-id="today-chore-occurrence_school_bag"]')).toBeFocused();

  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-focus-id="nav-today"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Week' })).toBeVisible();

  await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-focus-id="calendar-view-week"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-focus-id="calendar-view-month"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'August' })).toBeVisible();
  await expect(page.locator('[data-focus-id="month-day-2026-08-03"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-focus-id="nav-calendar"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-focus-id="month-day-2026-08-03"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-focus-id="month-day-2026-08-04"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focus-id="month-day-2026-08-11"]')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Week' })).toBeVisible();
  await expect(page.locator('[data-focus-id="calendar-view-month"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-focus-id="nav-calendar"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Chores' })).toBeVisible();
  const schoolBag = page.locator('[data-focus-id="chore-primary"]');
  await expect(schoolBag).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-focus-id="chore-occurrence_laundry"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(schoolBag).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(schoolBag).toContainText('Done');
  await expect(schoolBag).toHaveAccessibleName('Pack school bag, done. Undo');
  await expect(schoolBag).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(schoolBag).toContainText('Mark done');
  await expect(schoolBag).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Week' })).toBeVisible();
  await expect(page.locator('[data-focus-id="nav-chores"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.locator('[data-focus-id="nav-calendar"]')).toBeFocused();
});

test('Month keeps faces in its key and names events in date cells', async ({ page }) => {
  await page.goto('/month?scenario=unavailable');
  await expect(page.getByRole('heading', { name: 'August' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Showing saved plans');
  await expect(page.locator('.month-grid .avatar')).toHaveCount(0);
  await expect(page.locator('.month-event-label')).toHaveCount(19);
  const busyDay = page.locator('[data-focus-id="month-day-2026-08-03"]');
  await expect(busyDay.locator('.month-event-label')).toHaveText(['School drop-off', 'Dentist']);
  await expect(busyDay.locator('.month-event-more--wide')).toHaveText('+2 more');
  await expect(page.locator('.month-legend .avatar')).toHaveCount(2);
  await expect(page.locator('.month-legend__family')).toHaveText('H');
  await expect(page.getByLabel(/Monday 3 August, 4 plans/)).toBeVisible();

  await expect(page.locator('[data-focus-id="month-day-2026-08-03"]')).toBeFocused();
  for (let step = 0; step < 5; step += 1) await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-focus-id="month-earlier"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-focus-id="month-today"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'September' })).toBeVisible();
  await expect(page).toHaveURL(/month=2026-09/);
  await expect(page.locator('[data-focus-id="month-later"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'August' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('.calendar-view-switch')).toBeVisible();
  await expect(page.locator('[data-focus-id="phone-tab-calendar"]')).toHaveClass(
    /phone-tab--active/,
  );
  await expect(page.locator('.month-grid')).toBeVisible();
  await expect(page.locator('.month-day-details')).toContainText('School drop-off');
  await expect(page.locator('.month-day-details')).toContainText('4 plans');
  await page.locator('[data-focus-id="month-day-2026-08-03"]').focus();
  await expect(page.locator('.month-day-details')).toContainText('School drop-off');
});

test('cached Month remains readable through a real browser offline event', async ({
  page,
  context,
}) => {
  await page.goto('/month');
  await expect(page.locator('.month-event-label')).toHaveCount(19);
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByRole('status')).toContainText('Showing saved plans');
  await expect(page.locator('.month-event-label')).toHaveCount(19);
  await context.setOffline(false);
});

test('a failed optimistic completion restores pending state and retries in place', async ({
  page,
}) => {
  await page.goto('/today?scenario=fail-next');
  const chore = page.locator('[data-focus-id="today-chore-occurrence_school_bag"]');
  await expect(chore).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(chore).toContainText('Mark done');
  await expect(page.getByRole('alert')).toContainText('Couldn’t mark this done.');
  await expect(chore).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(chore).toContainText('Done');
  await expect(chore).toHaveAccessibleName('Pack school bag, done. Undo');
});

test('cached Today content remains visible through a real browser offline event', async ({
  page,
  context,
}) => {
  await page.goto('/today');
  await expect(page.getByText('School drop-off')).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByRole('status')).toContainText('Showing saved plans');
  await expect(page.getByText('School drop-off')).toBeVisible();
  await context.setOffline(false);
});

test('calendar sources remain identifiable and cached Week survives provider outage', async ({
  page,
}) => {
  await page.goto('/week?scenario=unavailable');
  await expect(page.getByRole('status')).toContainText('Showing saved plans');
  await expect(page.getByRole('button', { name: /School drop-off, Ezra$/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Nan visits, Family$/ }).first()).toBeVisible();
  await expect(page.locator('.week-grid .week-event__meta .avatar').first()).toBeVisible();
  await expect(page.locator('.week-grid .week-event__family').first()).toHaveText('H');
  await expect(page.locator('.week-grid .week-day-forecast')).toHaveCount(7);
  await expect(page.getByLabel('Clear, 16 degrees Celsius').first()).toBeVisible();
  await expect(page.locator('.week-agenda')).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const agenda = page.locator('.week-agenda');
  await expect(agenda).toBeVisible();
  await expect(agenda.locator('.week-day-forecast')).toHaveCount(7);
  const dentist = agenda.locator('.agenda-event').filter({ hasText: 'Dentist' });
  await expect(dentist).toBeVisible();
  await expect(dentist.locator('p')).not.toHaveText('Family');
});

test('three active assignees become three television columns with horizontal D-pad movement', async ({
  page,
  request,
}) => {
  const headers = { 'x-hearth-demo-actor': 'member_maya' };
  const memberResponse = await request.post(
    'http://127.0.0.1:4310/api/v1/households/household_hearth_demo/members',
    {
      headers,
      data: {
        requestId: 'request_e2e_third_chore_member',
        displayName: 'Alex',
        role: 'child',
        color: '#7a5b8f',
        administrator: false,
      },
    },
  );
  expect(memberResponse.ok()).toBe(true);
  const member = (await memberResponse.json()) as { id: string };
  const templateResponse = await request.post(
    'http://127.0.0.1:4310/api/v1/households/household_hearth_demo/chore-templates',
    {
      headers,
      data: {
        requestId: 'request_e2e_third_chore_template',
        title: 'Put lunchbox away',
        description: null,
        assigneeId: member.id,
        routineLabel: 'After school',
        dueTime: '16:00',
        repeat: 'weekly',
        repeatDays: ['MO'],
        activeFrom: '2026-08-03',
      },
    },
  );
  expect(templateResponse.ok()).toBe(true);

  await page.goto('/chores');
  const board = page.locator('.chore-groups');
  await expect(board).toHaveAttribute('data-column-count', '3');
  await expect(board.locator('.chore-group')).toHaveCount(3);
  await expect(board.getByRole('heading', { name: 'Alex' })).toBeVisible();

  await expect(page.locator('[data-focus-id="chore-primary"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(board.locator('.chore-group').nth(1).getByRole('button').first()).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(board.locator('.chore-group').nth(2).getByRole('button').first()).toBeFocused();
});

test('an open television Chores screen refreshes when the phone adds a child and due chore', async ({
  page,
  request,
}) => {
  await page.goto('/chores');
  await expect(page.getByRole('heading', { name: 'Chores' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Jordan' })).toHaveCount(0);

  const headers = { 'x-hearth-demo-actor': 'member_maya' };
  const memberResponse = await request.post(
    'http://127.0.0.1:4310/api/v1/households/household_hearth_demo/members',
    {
      headers,
      data: {
        requestId: 'request_realtime_child',
        displayName: 'Jordan',
        role: 'child',
        color: '#557a70',
        administrator: false,
      },
    },
  );
  expect(memberResponse.ok()).toBe(true);
  const member = (await memberResponse.json()) as { id: string };

  const templateResponse = await request.post(
    'http://127.0.0.1:4310/api/v1/households/household_hearth_demo/chore-templates',
    {
      headers,
      data: {
        requestId: 'request_realtime_chore',
        title: 'Put shoes away',
        description: null,
        assigneeIds: [member.id],
        routineLabel: 'After school',
        availableFromTime: null,
        dueTime: '16:30',
        repeat: 'weekly',
        repeatDays: ['MO'],
        activeFrom: '2026-08-03',
      },
    },
  );
  expect(templateResponse.ok()).toBe(true);

  await expect(page.getByRole('heading', { name: 'Jordan' })).toBeVisible();
  await expect(page.getByText('Put shoes away')).toBeVisible();
});

test('a no-chore day keeps children and weekly progress visible without demo wording', async ({
  page,
}) => {
  await page.goto('/chores?scenario=empty');
  await expect(page.getByRole('heading', { name: 'Chores' })).toBeVisible();
  await expect(page.getByText('No chores due today').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ezra' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show demo household' })).toHaveCount(0);
});

test('long chore navigation keeps the final row visible', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/chores');
  const last = page.locator('[data-focus-id="chore-occurrence_make_bed"]');
  await last.focus();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  await expect(last).toBeFocused();
  await expect(last).toBeInViewport();
});

test('pocket-money summary matches its chore-row width on television and phone', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const viewport of [
    { width: 3840, height: 2160 },
    { width: 1920, height: 1080 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/chores');
    const ezra = page.locator('.chore-group').filter({
      has: page.getByRole('heading', { name: 'Ezra' }),
    });
    const summaryBox = await ezra.locator('.chore-pocket-summary').boundingBox();
    const choreBox = await ezra.locator('.chore-row').first().boundingBox();
    if (summaryBox === null || choreBox === null) throw new Error('Expected visible chore layout');

    expect(Math.abs(summaryBox.x - choreBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(summaryBox.width - choreBox.width)).toBeLessThanOrEqual(1);
  }
});

test('reduced motion removes meaningful focus transforms', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/today');
  const chore = page.locator('[data-focus-id="today-chore-occurrence_school_bag"]');
  await expect(chore).toBeFocused();
  await expect(chore).toHaveCSS('transform', 'none');
});

test('phone presents Week navigation and the same chore command', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/today');
  await expect(page.locator('.phone-tabs')).toBeVisible();
  await page.getByRole('link', { name: 'Calendar' }).click();
  await expect(page.locator('.week-agenda')).toBeVisible();
  await page.getByRole('link', { name: 'Chores' }).click();
  const schoolBag = page.getByRole('button', { name: 'Complete Pack school bag' });
  await schoolBag.click();
  await expect(page.getByRole('button', { name: 'Pack school bag, done. Undo' })).toBeVisible();
});

test('a chore change invalidates an already-open Today screen in real time', async ({
  page,
  context,
}) => {
  const todayEvents = page.waitForRequest((request) => request.url().endsWith('/events'));
  await page.goto('/today');
  await todayEvents;
  const todayChore = page.locator('[data-focus-id="today-chore-occurrence_school_bag"]');
  await expect(todayChore).toContainText('Mark done');

  const choresPage = await context.newPage();
  const choresEvents = choresPage.waitForRequest((request) => request.url().endsWith('/events'));
  await choresPage.goto('/chores');
  await choresEvents;
  await choresPage.locator('[data-focus-id="chore-primary"]').press('Enter');
  await expect(todayChore).toContainText('Done');
  await expect(todayChore).toHaveAccessibleName('Pack school bag, done. Undo');
  await choresPage.close();
});
