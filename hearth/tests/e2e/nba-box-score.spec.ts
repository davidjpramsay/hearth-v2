import { join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const api = 'http://127.0.0.1:4310/api/v1';
const home = `${api}/households/household_hearth_demo`;
const adult = { 'X-Hearth-Demo-Actor': 'member_maya' };
test.beforeEach(async ({ request }) => {
  expect((await request.post(`${api}/demo/reset`)).ok()).toBe(true);
  expect(
    (
      await request.put(`${home}/modules/nba`, {
        headers: adult,
        data: { requestId: 'request_box_enable', enabled: true },
      })
    ).ok(),
  ).toBe(true);
});
for (const viewport of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'small-phone', width: 320, height: 740 },
  { name: 'tv', width: 1920, height: 1080 },
  { name: '4k', width: 3840, height: 2160 },
])
  for (const theme of ['light', 'dark'] as const) {
    test(`spoiler-free games and complete box scores fit ${viewport.name} ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme });
      const errors: string[] = [];
      const reads: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        if (request.url().includes('/nba/games/')) reads.push(request.url());
      });
      // Even unexpected provider status text must not smuggle scores into a card.
      await page.route('**/households/*/nba', async (route) => {
        const body = await (await route.fetch()).json();
        for (const game of body.data.games)
          if (game.status === 'final')
            game.detail = `Final ${game.homeScore}–${game.awayScore}; home won`;
        await route.fulfill({ json: body });
      });
      await page.goto('/nba');
      const cards = page.locator('.nba-game');
      await expect(cards).toHaveCount(6);
      expect(reads).toEqual([]);
      await expect(cards.locator('strong,[data-winner]')).toHaveCount(0);
      await expect(cards.first()).not.toContainText(/\b(108|114)\b/);
      await expect(cards.first()).toContainText('Scores hidden · Open game');
      await cards.first().focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Game box score' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
      await expect(dialog.locator('.nba-scoreboard')).toContainText('114');
      await expect(dialog.locator('.nba-scoreboard')).toContainText('108');
      await expect(dialog.getByRole('table')).toBeVisible();
      expect((await dialog.locator('thead th').allTextContents()).slice(0, 4)).toEqual([
        'Player',
        'Points',
        'Assists',
        'Rebounds',
      ]);
      await expect(dialog.locator('thead')).toContainText('Fouls');
      await expect(dialog.locator('tbody tr')).toHaveCount(8);
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
          true,
        );
      }
      await expect(dialog.locator('tfoot')).toContainText('Team totals');
      await dialog.getByRole('button', { name: 'Next players', exact: true }).click();
      await expect(dialog.locator('tbody tr')).toHaveCount(5);
      await expect(dialog.locator('tbody')).toContainText('Did not play');
      expect(await dialog.locator('tbody tr').last().locator('td').allTextContents()).toEqual(
        Array(9).fill('—'),
      );
      await dialog.getByRole('button', { name: 'Atlanta Hawks', exact: true }).click();
      await expect(dialog.locator('caption')).toContainText('Atlanta Hawks');
      await expect(dialog.locator('tbody tr')).toHaveCount(8);
      await dialog.getByRole('button', { name: 'Shooting & rebounds', exact: true }).click();
      await expect(dialog.locator('thead')).toContainText('Field goals');
      await expect(dialog.locator('tbody')).toContainText('%');
      expect((await dialog.locator('thead th').allTextContents()).slice(0, 4)).toEqual([
        'Player',
        'Points',
        'Assists',
        'Rebounds',
      ]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        await dialog
          .locator('.nba-detail-panel')
          .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      ).toBe(true);
      if (viewport.width >= 1920) {
        expect(
          await dialog
            .locator('.nba-detail-panel')
            .evaluate((element) => element.scrollHeight <= element.clientHeight + 2),
        ).toBe(true);
        await page.keyboard.press('ArrowLeft');
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(
          true,
        );
      }
      expect((await new AxeBuilder({ page }).include('.nba-detail').analyze()).violations).toEqual(
        [],
      );
      if (
        process.env.HEARTH_NBA_EVIDENCE_DIR &&
        (viewport.name === 'tv' || viewport.name === 'phone')
      ) {
        await page.screenshot({
          path: join(
            process.env.HEARTH_NBA_EVIDENCE_DIR,
            `nba-box-${viewport.name}-${theme}-shooting.png`,
          ),
        });
        await dialog.getByRole('button', { name: 'Player stats', exact: true }).click();
        await page.screenshot({
          path: join(
            process.env.HEARTH_NBA_EVIDENCE_DIR,
            `nba-box-${viewport.name}-${theme}-players.png`,
          ),
        });
      }
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(cards.first()).toBeFocused();
      await expect(cards.locator('strong,[data-winner]')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
test('saved box scores and shooting remain within the TV canvas', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route('**/nba/games/*', async (route) => {
    const body = await (await route.fetch()).json();
    await route.fulfill({ json: { ...body, status: 'stale' } });
  });
  await page.goto('/nba');
  await page.locator('.nba-game').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Saved box score', { exact: false })).toBeVisible();
  for (let i = 0; i < 2; i++) {
    expect(
      await dialog
        .locator('.nba-detail-panel')
        .evaluate((element) => element.scrollHeight <= element.clientHeight + 2),
    ).toBe(true);
    if (i === 0)
      await dialog.getByRole('button', { name: 'Shooting & rebounds', exact: true }).click();
  }
});
test('Back preserves the browse page and scheduled games do not invent statistics', async ({
  page,
}) => {
  await page.goto('/nba?view=next&page=2&teams=all');
  const card = page.locator('.nba-game').first();
  await card.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'This game has not started' })).toBeVisible();
  await expect(dialog.getByRole('table')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/view=next&page=2&teams=all/);
  await expect(card).toBeFocused();
});
test('loading, failed, stale and missing-player-stats states stay explicit and Back always works', async ({
  page,
}) => {
  let mode = 'loading';
  let release: (() => void) | undefined;
  await page.route('**/nba/games/*', async (route) => {
    const body = await (await route.fetch()).json();
    if (mode === 'loading')
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    await route.fulfill({
      json: {
        ...body,
        status: mode === 'stale' ? 'stale' : 'unavailable',
        teams: mode === 'stale' ? body.teams : null,
      },
    });
  });
  await page.goto('/nba');
  await page.locator('.nba-game').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Loading player stats…')).toBeVisible();
  await expect.poll(() => Boolean(release)).toBe(true);
  mode = 'failed';
  release!();
  await expect(dialog.getByRole('heading', { name: 'Player stats unavailable' })).toBeVisible();
  await expect(dialog.getByRole('table')).toHaveCount(0);
  mode = 'stale';
  await dialog.getByRole('button', { name: 'Check stats', exact: true }).click();
  await expect(dialog.getByText('Saved box score', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('table')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
test('disabling NBA while detail is open removes it without exposing an admin route', async ({
  page,
  request,
}) => {
  await page.goto('/nba');
  await page.locator('.nba-game').first().click();
  await expect(page.getByRole('dialog').getByRole('table')).toBeVisible();
  expect(
    (
      await request.put(`${home}/modules/nba`, {
        headers: adult,
        data: { requestId: 'request_box_disable', enabled: false },
      })
    ).ok(),
  ).toBe(true);
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await request.get(`${home}/nba/games/1000`)).status()).toBe(403);
});
