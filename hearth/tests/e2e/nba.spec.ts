import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const api = 'http://127.0.0.1:4310/api/v1';
const home = `${api}/households/household_hearth_demo`;
const adult = { 'X-Hearth-Demo-Actor': 'member_maya' };

test('TV remote changes NBA views and Back returns to Today', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');
  await page.locator('[data-focus-id="nav-nba"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'This week', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Next week', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('table')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/today$/);
});

test('stale NBA is prominently labelled and still fits the TV', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route('**/households/*/nba', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...(await response.json()), status: 'stale' } });
  });
  await page.goto('/nba');
  await expect(page.locator('.nba-warning')).toContainText('Showing saved NBA data');
  await expect(page.locator('.nba-game')).toHaveCount(6);
  expect(
    await page
      .locator('.app-content')
      .evaluate((element) => element.scrollHeight <= element.clientHeight + 2),
  ).toBe(true);
});

test('paired screens can browse NBA but cannot reach its adult settings or save teams', async ({
  page,
  request,
}) => {
  const secret = 'n'.repeat(43);
  const started = await request.post(`${api}/tv-pairing-sessions`, {
    data: {
      requestId: 'request_nba_screen',
      deviceName: 'NBA test screen',
      pairingSecret: secret,
      applicationVersion: 'test',
    },
  });
  const { pairing } = await started.json();
  expect(
    (
      await request.post(`${home}/pairing-approvals`, {
        headers: adult,
        data: { requestId: 'request_nba_approve', code: pairing.code },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await request.post(`${api}/tv-pairing-sessions/${pairing.id}/credential-exchanges`, {
        data: { requestId: 'request_nba_exchange', pairingSecret: secret },
      })
    ).ok(),
  ).toBe(true);
  const headers = { authorization: `Bearer ${secret}` };
  expect((await request.get(`${home}/nba`, { headers })).ok()).toBe(true);
  expect([401, 403]).toContain((await request.get(`${home}/nba/settings`, { headers })).status());
  expect([401, 403]).toContain(
    (
      await request.put(`${home}/nba/settings`, {
        headers,
        data: { requestId: 'request_nba_forbidden', standoutTeamIds: ['1'] },
      })
    ).status(),
  );
  await page.context().addCookies([
    {
      name: 'hearth_device',
      value: secret,
      url: 'http://127.0.0.1:4320',
      httpOnly: true,
      sameSite: 'Strict',
    },
  ]);
  await page.goto('/nba');
  await expect(page.locator('.nba-game')).toHaveCount(6);
  await page.goto('/more');
  await expect(page.locator('a[href="/admin/nba"]')).toHaveCount(0);
  await page.goto('/admin/nba');
  await expect(page).toHaveURL(/\/today$/);
});
test.beforeEach(async ({ request }) => {
  expect((await request.post(`${api}/demo/reset`)).ok()).toBe(true);
  expect(
    (
      await request.put(`${home}/modules/nba`, {
        headers: adult,
        data: { requestId: 'request_enable_nba', enabled: true },
      })
    ).ok(),
  ).toBe(true);
});
for (const viewport of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'small-phone', width: 320, height: 740 },
  { name: 'tv', width: 1920, height: 1080 },
  { name: '4k', width: 3840, height: 2160 },
]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`NBA views, pagination and accessibility fit ${viewport.name} ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto('/nba');
      await expect(page.locator('.nba-game')).toHaveCount(6);
      await expect(page.locator('.nba-source')).toContainText('Fictional demo');
      const labels = ['This week', 'Next week', 'Standings', 'Weekly best'];
      for (const [index, label] of labels.entries()) {
        await page.getByRole('button', { name: label, exact: true }).click();
        if (label === 'Standings') {
          await expect(page.getByRole('table')).toBeVisible();
          await expect(page.locator('tbody tr')).toHaveCount(8);
          await page.getByRole('button', { name: /switch conference/ }).click();
          await expect(page.getByRole('table')).toContainText('West');
        } else if (label === 'Weekly best')
          await expect(page.locator('.nba-highlight')).toHaveCount(3);
        else await expect(page.locator('.nba-game')).toHaveCount(6);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        if (viewport.width >= 1920) {
          expect(
            await page
              .locator('.app-content')
              .evaluate((element) => element.scrollHeight <= element.clientHeight + 2),
          ).toBe(true);
        }
        if (
          process.env.HEARTH_NBA_EVIDENCE_DIR &&
          (viewport.name === 'tv' || viewport.name === 'phone')
        )
          await page.screenshot({
            path: join(
              process.env.HEARTH_NBA_EVIDENCE_DIR,
              `nba-${viewport.name}-${theme}-${index}.png`,
            ),
            fullPage: viewport.name === 'phone',
          });
      }
      expect((await new AxeBuilder({ page }).include('.nba-screen').analyze()).violations).toEqual(
        [],
      );
      expect(errors).toEqual([]);
      await page.getByRole('button', { name: 'Next week', exact: true }).click();
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(page).toHaveURL(/page=2/);
      await page.reload();
      await expect(page.getByRole('button', { name: 'Next week', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      if (viewport.width >= 1920) {
        await page.getByRole('button', { name: 'Weekly best', exact: true }).focus();
        const rail = page.locator('.tv-rail');
        for (let i = 0; i < 6; i++) {
          if (await rail.evaluate((element) => element.contains(document.activeElement))) break;
          await page.keyboard.press('ArrowLeft');
        }
        await expect(page.locator('.tv-rail a:focus')).toHaveCount(1);
        await page.keyboard.press('ArrowRight');
        await expect(page.getByRole('button', { name: 'This week', exact: true })).toBeFocused();
      }
    });
  }
}
test('adult saves teams, retains them after module off/on, and all teams remain available', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/nba');
  await page.getByRole('checkbox', { name: 'Boston Celtics', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Los Angeles Lakers', exact: true }).check();
  await page.getByRole('button', { name: 'Save teams' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Standout teams saved.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Boston Celtics', exact: true })).toBeChecked();
  await page.goto('/nba');
  await expect(page.getByRole('button', { name: /Standout teams/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: /Standout teams/ }).click();
  await expect(page.getByRole('button', { name: 'All teams', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.locator('.nba-game')).toHaveCount(6);
  await request.put(`${home}/modules/nba`, {
    headers: adult,
    data: { requestId: 'request_disable_nba', enabled: false },
  });
  await expect(page).toHaveURL(/\/today$/);
  await page.goto('/more');
  await expect(page.locator('a[href="/nba"],a[href="/admin/nba"]')).toHaveCount(0);
  await page.goto('/nba');
  await expect(page).toHaveURL(/\/today$/);
  await request.put(`${home}/modules/nba`, {
    headers: adult,
    data: { requestId: 'request_reenable_nba', enabled: true },
  });
  await page.reload();
  await page.goto('/admin/nba');
  await expect(
    page.getByRole('checkbox', { name: 'Los Angeles Lakers', exact: true }),
  ).toBeChecked();
  expect((await new AxeBuilder({ page }).include('.admin-page').analyze()).violations).toEqual([]);
});
test('unavailable and empty NBA states are intentional and keyboard refreshable', async ({
  page,
}) => {
  await page.route('**/households/*/nba', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ json: { ...body, data: null, fetchedAt: null, status: 'unavailable' } });
  });
  await page.goto('/nba');
  await expect(page.getByRole('heading', { name: 'NBA data is unavailable' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check for updates' })).toBeEnabled();
  await page.unroute('**/households/*/nba');
  await page.route('**/households/*/nba', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ json: { ...body, data: { ...body.data, games: [], highlights: [] } } });
  });
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await expect(page.getByRole('heading', { name: 'No games in this selection' })).toBeVisible();
});
