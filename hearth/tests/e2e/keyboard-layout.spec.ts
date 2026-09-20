import { expect, test } from '@playwright/test';

test.afterEach(async ({ page }) => {
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
});

test.beforeEach(async ({ page, request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
  await page.setViewportSize({ width: 1920, height: 1080 });
});

test('Agenda enters on its view selector and follows visible day columns', async ({ page }) => {
  await page.goto('/calendar/week');
  await expect(page.locator('[data-focus-id="calendar-view-week"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Agenda', exact: true })).toBeVisible();
  await expect(page.locator('[data-focus-id="calendar-view-agenda"]')).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const firstDay = page.locator('.agenda-day').nth(0);
  const first = firstDay.locator('.agenda-event').first();
  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.agenda-day').nth(1).locator('.agenda-event').first()).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(first).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(firstDay.locator('.agenda-event').nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Close' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(firstDay.locator('.agenda-event').nth(1)).toBeFocused();
  await page.screenshot({ path: '/tmp/hearth-keyboard-agenda-tv.png' });
});

for (const route of [
  'today',
  'calendar/week',
  'calendar/month',
  'calendar/agenda',
  'weather',
  'reminders',
  'chores',
  'lists',
  'meals',
  'home',
  'photos',
  'more',
]) {
  test(`visible controls have an arrow path on ${route}`, async ({ page }) => {
    await page.goto(`/${route}`);
    await expect(page.locator('#main-content .screen')).toBeVisible();
    await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0);
    const unreachable = await page.evaluate(() => {
      const selector = 'a[href], button, input, select, textarea, summary, [tabindex]';
      const controls = [...document.querySelectorAll<HTMLElement>(selector)].filter((el) => {
        const r = el.getBoundingClientRect();
        return (
          el.tabIndex >= 0 &&
          r.width > 0 &&
          r.height > 0 &&
          !el.matches(':disabled, [aria-disabled="true"]') &&
          !el.closest('[hidden], [inert], [aria-hidden="true"]') &&
          getComputedStyle(el).visibility !== 'hidden'
        );
      });
      const visited = new Set<HTMLElement>();
      const queue = controls.length ? [controls[0]!] : [];
      while (queue.length) {
        const el = queue.shift()!;
        if (visited.has(el)) continue;
        visited.add(el);
        for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
          el.focus();
          el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
          const next = document.activeElement as HTMLElement;
          if (controls.includes(next) && !visited.has(next)) queue.push(next);
        }
      }
      return controls
        .filter((el) => !visited.has(el))
        .map((el) => el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName);
    });
    expect(unreachable).toEqual([]);
  });
}

test('phone reflow retains vertical Agenda movement', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/calendar/agenda');
  const first = page.locator('.agenda-event').first();
  await expect(first).toBeVisible();
  await first.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.agenda-event').nth(1)).toBeFocused();
  await page.screenshot({ path: '/tmp/hearth-keyboard-agenda-phone.png' });
});

for (const width of [1920, 390]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`Reminders filters stay reachable and focused at ${width}px in ${theme}`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width, height: width === 1920 ? 1080 : 844 });
      await page.goto('/reminders');
      await expect(page).toHaveTitle(/Hearth/);
      const open = page.getByRole('button', { name: 'Open', exact: true });
      const all = page.getByRole('button', { name: 'All', exact: true });
      await expect(open).toBeFocused();
      const first = page.getByRole('button', { name: /^Complete / }).first();
      const completedTitle = (await first.getAttribute('aria-label'))!.slice('Complete '.length);
      await first.click();
      await expect(
        page.getByRole('button', { name: `Complete ${completedTitle}`, exact: true }),
      ).toHaveCount(0);
      const remaining = page.getByRole('button', { name: /^Complete / }).first();
      await remaining.focus();
      await page.keyboard.press('ArrowUp');
      await expect(open).toBeFocused();
      // A filter switch must not fetch again, unmount controls or lose focus offline.
      await page.route('**/api/v1/households/*/reminders?*', (route) => route.abort());
      await page.keyboard.press('ArrowRight');
      await expect(all).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(all).toBeFocused();
      await expect(all).toHaveAttribute('aria-pressed', 'true');
      await expect(
        page.getByRole('button', { name: `Reopen ${completedTitle}`, exact: true }),
      ).toBeVisible();
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('Enter');
      await expect(open).toBeFocused();
      await expect(open).toHaveAttribute('aria-pressed', 'true');
      await expect(
        page.getByRole('button', { name: `Reopen ${completedTitle}`, exact: true }),
      ).toHaveCount(0);
      await page.keyboard.press('ArrowDown');
      await expect(remaining).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(errors).toEqual([]);
      await page.screenshot({ path: `/tmp/hearth-reminders-navigation-${width}-${theme}.png` });
    });
  }
}

test('empty Reminders keeps both filters available without a text field detour', async ({
  page,
}) => {
  await page.goto('/reminders');
  const complete = page.getByRole('button', { name: /^Complete / });
  await expect(complete).toHaveCount(3);
  for (let count = 3; count > 0; count -= 1) {
    await complete.first().click();
    await expect(complete).toHaveCount(count - 1);
  }
  await expect(page.getByText('No open reminders', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'All', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: /^Reopen / })).toHaveCount(3);
});

test('admin text fields retain cursor keys and ordinary Tab navigation', async ({ page }) => {
  await page.goto('/admin/household');
  const name = page.getByLabel('Household name');
  await name.fill('Keyboard check');
  await name.press('Home');
  await name.press('ArrowRight');
  await expect(name).toBeFocused();
  expect(await name.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(1);
  await name.press('Tab');
  await expect(name).not.toBeFocused();
});

test('admin screens retain visible keyboard focus without runtime errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const route of [
    'household',
    'people',
    'access',
    'today',
    'televisions',
    'connections',
    'connections/calendar',
    'connections/home-assistant',
    'planning',
    'lists',
    'meals',
    'photos',
    'routines',
    'chore-day',
    'pocket-money',
    'system',
    'activity',
  ]) {
    await page.goto(`/admin/${route}`);
    await expect(page.locator('#main-content h1')).toBeVisible();
    await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0);
    // Start at the first navigation control. On read-only demo access pages the
    // Back link is otherwise the last enabled control and Tab correctly exits
    // the document to the browser chrome.
    await page
      .getByRole('complementary', { name: 'Administration' })
      .getByRole('link')
      .first()
      .focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() => {
        const active = document.activeElement;
        return (
          active instanceof HTMLElement &&
          active !== document.body &&
          active.getBoundingClientRect().height > 0
        );
      }),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
