import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';

import { ChoreTemplateListSchema } from '../../packages/shared/src/schemas';

import { captureEvidence } from './visualEvidence';

const api = 'http://127.0.0.1:4310/api/v1';
const templatesUrl = `${api}/households/household_hearth_demo/chore-templates`;
const headers = { 'x-hearth-demo-actor': 'member_maya' };

test.beforeEach(async ({ request }) => {
  const reset = await request.post(`${api}/demo/reset`);
  expect(reset.ok()).toBe(true);
  const added = await request.post(`${api}/households/household_hearth_demo/members`, {
    headers,
    data: {
      requestId: 'request_chore_picker_child',
      displayName: 'Alex',
      role: 'child',
      color: '#7a5b8f',
      administrator: false,
    },
  });
  expect(added.ok()).toBe(true);
});

for (const viewport of [
  { name: 'narrow phone', width: 320, height: 700 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'landscape phone', width: 844, height: 390 },
  { name: 'short large browser', width: 1366, height: 768 },
  { name: 'wide adult browser', width: 1920, height: 1080 },
  { name: '4K adult browser', width: 3840, height: 2160 },
]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`chore People picker saves only explicit choices at ${viewport.name} in ${theme}`, async ({
      page,
      request,
    }, testInfo) => {
      const issues: string[] = [];
      const commands: Array<{ method: string; body: { assigneeIds: string[] } }> = [];
      page.on('pageerror', (error) => issues.push(error.message));
      page.on('console', (message) => {
        if (['warning', 'error'].includes(message.type())) issues.push(message.text());
      });
      page.on('request', (sent) => {
        if (sent.url().includes('/chore-templates') && ['POST', 'PATCH'].includes(sent.method())) {
          commands.push({ method: sent.method(), body: sent.postDataJSON() });
        }
      });
      const baseline = await request.get(templatesUrl, { headers });
      expect(baseline.ok()).toBe(true);
      const original = ChoreTemplateListSchema.parse(await baseline.json()).templates;
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme: theme });
      await page.goto('/admin/routines');
      await expect(page).toHaveURL(/\/admin\/routines$/);
      await expect(page).toHaveTitle('Hearth');
      await expect(
        page.getByRole('heading', { name: 'Routines and chores', exact: true }),
      ).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      await page.getByRole('button', { name: 'New chore', exact: true }).click();
      const form = page.locator('.routine-add-form');
      await expect(form.getByRole('heading', { name: 'Add a chore' })).toBeVisible();
      await expect(form.locator('input[name="assigneeIds"]:checked')).toHaveCount(0);
      await expectUniformPeopleCards(form);
      await captureEvidence(page, { path: testInfo.outputPath(`people-unselected-${theme}.png`) });
      const ezra = form.getByRole('checkbox', { name: /Ezra/ });
      const alex = form.getByRole('checkbox', { name: /Alex/ });
      const alexId = await alex.inputValue();
      await ezra.focus();
      await expect(ezra).not.toBeChecked();
      expect(commands).toHaveLength(0);
      await form.getByLabel('Chore', { exact: true }).fill('Selection test chore');
      await form.getByLabel('Helpful note').fill('Keep this draft');
      await form.getByLabel('Time of day').selectOption('Anytime');
      await form.getByRole('button', { name: 'Add chore', exact: true }).click();
      await expect(form.getByRole('alert')).toHaveText('Choose at least one person.');
      await expectVisiblePeopleError(form.getByRole('alert'));
      await expectUniformPeopleCards(form);
      await expect(form.locator('input[name="assigneeIds"]').first()).toBeFocused();
      await expect(ezra).toHaveAttribute('aria-invalid', 'true');
      await expect(ezra).toHaveAccessibleDescription(/Choose at least one person/);
      await expect(form.getByLabel('Helpful note')).toHaveValue('Keep this draft');
      expect(commands).toHaveLength(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await captureEvidence(page, { path: testInfo.outputPath(`people-error-${theme}.png`) });
      const axe = await new AxeBuilder({ page }).analyze();
      expect(
        axe.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? '')),
      ).toEqual([]);

      await ezra.focus();
      await page.keyboard.press('Space');
      await expect(ezra).toBeChecked();
      await expect(form.getByRole('alert')).toHaveCount(0);
      await page.keyboard.press('Space');
      await expect(ezra).not.toBeChecked();
      await alex.focus();
      await page.keyboard.press('Space');
      await expect(alex).toBeChecked();
      await expectUniformPeopleCards(form);
      await form.getByRole('button', { name: 'Add chore', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('status')).toContainText('Selection test chore was scheduled');
      expect(commands).toHaveLength(1);
      expect(commands[0]).toMatchObject({ method: 'POST', body: { assigneeIds: [alexId] } });

      await page.reload();
      const editor = page.locator('.routine-editor').filter({ hasText: 'Selection test chore' });
      await editor.locator('summary').click();
      const savedEzra = editor.getByRole('checkbox', { name: /Ezra/ });
      const savedAlex = editor.getByRole('checkbox', { name: /Alex/ });
      await expect(savedEzra).not.toBeChecked();
      await expect(savedAlex).toBeChecked();
      await expectUniformPeopleCards(editor);
      await expect(editor.getByLabel('Helpful note')).toHaveValue('Keep this draft');
      await savedAlex.uncheck();
      await expect(savedAlex).not.toBeChecked();
      await editor.getByRole('button', { name: 'Save future schedule' }).click();
      await expect(editor.getByRole('alert')).toHaveText('Choose at least one person.');
      await expectVisiblePeopleError(editor.getByRole('alert'));
      expect(commands).toHaveLength(1);
      await savedEzra.check();
      await savedAlex.check();
      await expect(editor.getByRole('alert')).toHaveCount(0);
      await expectUniformPeopleCards(editor);
      await editor.locator('.routine-assignees').scrollIntoViewIfNeeded();
      await captureEvidence(page, { path: testInfo.outputPath(`people-selected-${theme}.png`) });
      await editor.getByRole('button', { name: 'Save future schedule' }).click();
      await expect(page.getByRole('status')).toContainText('Selection test chore was updated');
      expect(commands).toHaveLength(2);
      expect(commands[1]).toMatchObject({
        method: 'PATCH',
        body: { assigneeIds: ['member_ezra', alexId] },
      });
      await page.reload();
      await editor.locator('summary').click();
      await expect(savedEzra).toBeChecked();
      await expect(savedAlex).toBeChecked();
      const readback = await request.get(templatesUrl, { headers });
      expect(readback.ok()).toBe(true);
      const stored = ChoreTemplateListSchema.parse(await readback.json()).templates;
      expect(
        stored
          .find((item) => item.title === 'Selection test chore')
          ?.assignees.map((person) => person.id),
      ).toEqual(['member_ezra', alexId]);
      expect(stored.filter((item) => item.title !== 'Selection test chore')).toEqual(original);
      expect(issues).toEqual([]);
    });
  }
}

async function expectUniformPeopleCards(form: Locator) {
  const grid = await form.locator('.routine-assignees__options').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      columns: style.gridTemplateColumns.split(' ').length,
      rowGap: Number.parseFloat(style.rowGap),
      columnGap: Number.parseFloat(style.columnGap),
      cards: Array.from(element.querySelectorAll('label'), (card) => {
        const bounds = card.getBoundingClientRect();
        const cardStyle = getComputedStyle(card);
        return {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          marginTop: cardStyle.marginTop,
          marginBottom: cardStyle.marginBottom,
        };
      }),
    };
  });
  expect(grid.cards).toHaveLength(3);
  const first = grid.cards[0]!;
  for (const [index, card] of grid.cards.entries()) {
    expect(card.marginTop).toBe('0px');
    expect(card.marginBottom).toBe('0px');
    expect(Math.abs(card.width - first.width)).toBeLessThan(1);
    expect(Math.abs(card.height - first.height)).toBeLessThan(1);
    if (index % grid.columns !== 0) {
      const previous = grid.cards[index - 1]!;
      expect(Math.abs(card.y - previous.y)).toBeLessThan(1);
      expect(Math.abs(card.x - previous.x - previous.width - grid.columnGap)).toBeLessThan(1);
    }
    if (index >= grid.columns) {
      const above = grid.cards[index - grid.columns]!;
      expect(Math.abs(card.y - above.y - above.height - grid.rowGap)).toBeLessThan(1);
    }
  }
}

async function expectVisiblePeopleError(alert: Locator) {
  await expect(alert).toBeInViewport({ ratio: 1 });
  await expect
    .poll(() =>
      alert.evaluate((element) => {
        const error = element.getBoundingClientRect();
        const clock = document
          .querySelector('.household-date-time--companion')
          ?.getBoundingClientRect();
        const dock = document.querySelector('.phone-tabs')?.getBoundingClientRect();
        return (
          error.top >= (clock?.bottom ?? 0) &&
          error.bottom <= (dock !== undefined && dock.height > 0 ? dock.top : innerHeight)
        );
      }),
    )
    .toBe(true);
}
