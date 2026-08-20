import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { captureEvidence } from './visualEvidence';

const evidence = resolve('docs/evidence/phase-4/screenshots');

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
});

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
});

test('remote-only Lists check, undo, Meals navigation and Back restoration', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/lists');
  await expect(page.locator('.lists-manage-link')).toBeHidden();
  const milk = page.locator('[data-focus-id="list-item-list_item_milk"]');
  await expect(milk).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(milk).toContainText('Checked · Undo');
  await expect(milk).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(milk).toContainText('Check item');
  await expect(milk).toBeFocused();

  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-focus-id="list-choice-list_groceries"]')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-focus-id="nav-lists"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Meals' })).toBeVisible();
  await expect(page.locator('[data-focus-id="meal-day-2026-08-03"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Lists' })).toBeVisible();
  await expect(page.locator('[data-focus-id="nav-meals"]')).toBeFocused();
});

test('phone adds a list item and edits several dinners through the typed API', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lists');
  await expect(page.getByLabel('Choose a list')).toBeVisible();
  await expect(page.locator('.list-chooser')).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.getByPlaceholder('Add an item').fill('Oranges');
  await page.getByLabel('Quantity (optional)').fill('6');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check Oranges' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check Oranges' })).toContainText('6');
  await expect(page.getByRole('link', { name: 'Manage lists' })).toBeVisible();

  await page.goto('/meals');
  await page.getByRole('link', { name: 'Manage meals' }).click();
  await expect(page.getByRole('heading', { name: 'Meal planning' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Tue dinner', exact: true }).fill('Vegetable curry');
  await page.locator('summary[aria-label="Tue dinner details"]').click();
  await page.getByLabel('Tue dinner note').fill('Rice at 5:30');
  await page.getByRole('textbox', { name: 'Wed dinner', exact: true }).fill('Leftover curry');
  await page.getByRole('button', { name: 'Save week' }).click();
  await expect(page.getByRole('status')).toContainText('dinner plan was saved');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Tue dinner', exact: true })).toHaveValue(
    'Vegetable curry',
  );
  await expect(page.getByRole('textbox', { name: 'Wed dinner', exact: true })).toHaveValue(
    'Leftover curry',
  );
});

test('phone Meals shows the full week without a sideways card strip', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/meals');

  const week = page.locator('.meal-week');
  await expect(week.locator('.meal-day')).toHaveCount(7);
  await expect
    .poll(() => week.evaluate((element) => getComputedStyle(element).overflowX))
    .not.toBe('auto');
  await expect(page.getByRole('button', { name: 'Earlier week' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Later week' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);

  await page.setViewportSize({ width: 844, height: 390 });
  await expect
    .poll(() =>
      week
        .locator('.meal-day')
        .last()
        .evaluate((element) => element.getBoundingClientRect().right <= window.innerWidth),
    )
    .toBe(true);
});

test('phone adults search, create, edit, archive and restore saved meals and copy a week', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/planning');
  await page.getByRole('link', { name: /Meals/ }).click();
  await expect(page.getByRole('heading', { name: 'Meal planning' })).toBeVisible();

  await page.getByRole('button', { name: 'New meal' }).click();
  const create = page.locator('.saved-meal-create');
  await create.getByLabel('Meal name').fill('Sesame noodle bowls');
  await create.getByLabel('Preparation time').fill('25');
  await create.getByLabel('Notes').fill('Fast school-night meal');
  await create.getByRole('button', { name: 'Save meal' }).click();
  await expect(page.getByRole('status')).toContainText('Sesame noodle bowls was saved');

  await page.getByPlaceholder('Search saved meals').fill('sesame');
  await page
    .locator('.saved-meal-card')
    .filter({ hasText: 'Sesame noodle bowls' })
    .locator('summary')
    .click();
  const editor = page.locator('.saved-meal-card[open] .saved-meal-edit');
  await editor.getByLabel('Meal name').fill('Sesame noodles');
  await editor.getByLabel('Preparation time').fill('20');
  await editor.getByLabel('Family favourite').uncheck();
  await editor.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status')).toContainText('Sesame noodles was updated');

  await page.getByPlaceholder('Search saved meals').fill('sesame');
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByRole('button', { name: 'Archive Sesame noodles?' }).click();
  await expect(page.getByRole('status')).toContainText('can be restored');
  await page.locator('.archived-saved-meals > summary').click();
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('status')).toContainText('Sesame noodles is active again');

  await page.getByRole('button', { name: 'Later week' }).click();
  await page.getByRole('button', { name: 'Copy previous week' }).click();
  await page.getByRole('button', { name: 'Replace and copy' }).click();
  await expect(page.getByRole('status')).toContainText('previous week was copied');
  await expect(page.getByRole('textbox', { name: 'Mon dinner', exact: true })).toHaveValue(
    'Lemon chicken & roast vegetables',
  );
  await page.getByRole('button', { name: 'Clear this week' }).click();
  await page.getByRole('button', { name: 'Clear all dinners' }).click();
  await expect(page.getByRole('status')).toContainText('week was cleared');
  await expect(page.getByRole('textbox', { name: 'Mon dinner', exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Save week' }).click();
  await expect(page.getByRole('status')).toContainText('Confirm clearing the week');
  await expect(page.getByRole('group', { name: 'Confirm clearing week' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Family planning' })).toBeVisible();
});

test('meal administration reports a failed save and retries the same safe week command', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/meals?scenario=fail-next');
  await page.getByRole('textbox', { name: 'Tue dinner', exact: true }).fill('Tuesday soup');
  await page.getByRole('button', { name: 'Save week' }).click();
  await expect(page.getByRole('alert')).toContainText('That change did not save');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('status')).toContainText('dinner plan was saved');
  await expect(page.getByRole('textbox', { name: 'Tue dinner', exact: true })).toHaveValue(
    'Tuesday soup',
  );
});

test('phone adults create, edit, order, clear, archive and restore household lists', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/planning');
  await page.getByRole('link', { name: /Household lists/ }).click();
  await expect(page.getByRole('heading', { name: 'Household lists' })).toBeVisible();

  await page.getByRole('button', { name: 'New list' }).click();
  const createForm = page.locator('.list-settings-create');
  await createForm.getByLabel('List name').fill('School camp');
  await createForm.getByLabel('List type').selectOption('packing');
  await createForm.getByLabel('Use list colour #6d5b8f').check();
  await createForm.getByRole('button', { name: 'Create list' }).click();
  await expect(page.getByRole('status')).toContainText('School camp was created');

  await page.getByPlaceholder('Add an item').fill('Sleeping bag');
  await page.getByPlaceholder('Qty').fill('1');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByRole('status')).toContainText('Sleeping bag was added');
  await expect(page.getByLabel('Item name for Sleeping bag')).toBeVisible();

  const details = page.locator('.list-settings-details');
  await details.getByLabel('List name').fill('Year 8 camp');
  await details.getByLabel('Use list colour #1668b7').check();
  await details.getByRole('button', { name: 'Save list details' }).click();
  await expect(page.getByRole('status')).toContainText('Year 8 camp was updated');

  await page.getByRole('button', { name: /Groceries 6 waiting/ }).click();
  const milk = page.getByLabel('Item name for Milk').locator('xpath=ancestor::form');
  await milk.getByLabel('Item name for Milk').fill('Oat milk');
  await milk.getByLabel('Quantity for Milk').fill('2');
  await milk.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Oat milk was updated');
  await page.getByRole('button', { name: 'Move Oat milk down' }).click();
  await expect(page.getByRole('status')).toContainText('Oat milk was moved');

  const oats = page.getByLabel('Item name for Oats').locator('xpath=ancestor::form');
  await expect(oats).toHaveClass(/list-settings-item--checked/);
  await page.getByRole('button', { name: 'Clear checked' }).click();
  await page.getByRole('button', { name: 'Clear 1 checked item?' }).click();
  await expect(page.getByRole('status')).toContainText('Checked items were cleared');
  await expect(page.getByLabel('Item name for Oats')).toHaveCount(0);

  await page.getByRole('button', { name: /Year 8 camp 1 waiting/ }).click();
  await page.getByRole('button', { name: 'Archive list' }).click();
  await page.getByRole('button', { name: 'Archive Year 8 camp?' }).click();
  await expect(page.getByRole('status')).toContainText('can be restored');
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('status')).toContainText('Year 8 camp is active again');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Family planning' })).toBeVisible();
});

test('list administration reports a failed save and retries the same safe command', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/lists?scenario=fail-next');
  const details = page.locator('.list-settings-details');
  await details.getByLabel('List name').fill('Weekly groceries');
  await details.getByRole('button', { name: 'Save list details' }).click();
  await expect(page.getByRole('alert')).toContainText('That change did not save');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('status')).toContainText('Weekly groceries was updated');
});

test('phone Family Planning edits future routines and manages weekly pocket money', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin');
  await page.getByRole('link', { name: /Family planning/ }).click();
  await expect(page.getByRole('heading', { name: 'Family planning' })).toBeVisible();
  await page.getByRole('link', { name: /Routines and chores/ }).click();
  const schoolBag = page.locator('.routine-editor').filter({ hasText: 'Pack school bag' });
  await schoolBag.locator('summary').click();
  await expect(schoolBag.getByLabel('Time of day').locator('option')).toHaveText([
    'Morning',
    'After school',
    'Evening',
    'Bedtime',
    'Anytime',
  ]);
  await schoolBag.getByLabel('Time of day').selectOption('Morning');
  await schoolBag.getByLabel('Due by').fill('07:45');
  await schoolBag.getByRole('button', { name: 'Save future schedule' }).click();
  await expect(page.getByRole('status')).toContainText('updated from today forward');
  await page.reload();
  await schoolBag.locator('summary').click();
  await expect(schoolBag.getByLabel('Time of day')).toHaveValue('Morning');
  await expect(schoolBag.getByLabel('Due by')).toHaveValue('07:45');

  await page.getByRole('button', { name: 'New chore' }).click();
  const addChore = page.locator('.routine-add-form');
  await addChore.getByLabel('Chore', { exact: true }).fill('Bring bins in');
  await addChore.getByLabel('Repeat').selectOption('once');
  await addChore.getByLabel('Time of day').selectOption('Anytime');
  await addChore.getByLabel('Due date').fill('2026-08-03');
  await addChore.getByLabel('Due by').fill('17:30');
  await addChore.getByRole('button', { name: 'Add chore' }).click();
  await expect(page.getByRole('status')).toContainText('Bring bins in was scheduled');
  const oneOff = page.locator('.routine-editor').filter({ hasText: 'Bring bins in' });
  await expect(oneOff).toContainText('One-off · 3 Aug 2026');

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/chores');
  await expect(page.getByText('Bring bins in')).toBeVisible();
  await expect(page.getByText('Anytime · Due 5:30 pm')).toBeVisible();
  await captureEvidence(page, {
    path: resolve(evidence, 'chores-one-off-tv-1080.png'),
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/routines');
  const oneOffEditor = page.locator('.routine-editor').filter({ hasText: 'Bring bins in' });
  await oneOffEditor.locator('summary').click();
  await oneOffEditor.getByRole('button', { name: 'Archive', exact: true }).click();
  await oneOffEditor.getByRole('button', { name: 'Archive Bring bins in?' }).click();
  await expect(page.getByRole('status')).toContainText('Past chore history is unchanged');
  const archived = page.locator('.archived-routines');
  await archived.locator('summary').click();
  await expect(archived).toContainText('Bring bins in');
  await archived.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByRole('status')).toContainText('Bring bins in is active again from today');
  await captureEvidence(page, {
    path: resolve(evidence, 'routines-one-off-phone.png'),
    animations: 'disabled',
    fullPage: true,
  });

  await page.goto('/admin/pocket-money');
  await page.getByLabel('Ezra weekly amount').fill('15.00');
  await page.getByLabel('Ezra payday').selectOption('friday');
  await page.getByRole('button', { name: 'Save Ezra' }).click();
  await expect(page.getByRole('status')).toContainText('saved for every week');
  await page.reload();
  await expect(page.getByLabel('Ezra weekly amount')).toHaveValue('15.00');

  await page.goto('/chores');
  await page.locator('[data-focus-id="chore-primary"]').click();
  await expect(page.getByText('25% this week')).toBeVisible();
  await expect(page.getByText('$3.75 of $15.00')).toBeVisible();

  await page.goto('/admin/pocket-money');
  await page.getByLabel('Payment amount').fill('2.00');
  await page.getByLabel(/Note optional/).fill('Cash');
  await page.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByRole('status')).toContainText('$2.00 recorded');
  await expect(page.getByText('$1.75 still to pay')).toBeVisible();
  const history = page.getByRole('region', { name: 'Payment history' });
  await expect(history.getByText('Cash')).toBeVisible();
  await expect(history.getByText('$2.00')).toBeVisible();

  await page.getByLabel('Payment amount').fill('1.75');
  await page.getByRole('button', { name: 'Record payment' }).click();
  await expect(
    page.locator('.pocket-money-admin-card').getByText('Paid in full').first(),
  ).toBeVisible();

  const remainderPayment = history.locator('article').filter({ hasText: '$1.75' });
  await remainderPayment.getByRole('button', { name: 'Correct' }).click();
  await remainderPayment.getByLabel('Correction reason').fill('Recorded from wrong account');
  await remainderPayment.getByRole('button', { name: 'Void payment' }).click();
  await expect(history.getByText('Voided · Recorded from wrong account')).toBeVisible();
  await expect(page.getByText('$1.75 still to pay')).toBeVisible();

  const weekReview = page.getByLabel('Week to review');
  await expect(weekReview.locator('option[value="2026-08-10"]')).toHaveCount(0);
  await expect(weekReview.locator('option[value="2026-07-27"]')).toHaveText(
    'Last week · 27 Jul–2 Aug',
  );
  await weekReview.selectOption('2026-07-27');
  await expect(page).toHaveURL(/week=2026-07-27/);
  await expect(page.getByText('Reviewing 27 Jul–2 Aug')).toBeVisible();
  await expect(page.getByLabel('Ezra weekly amount')).toHaveValue('15.00');
  await expect(page.getByText('The settings above are your current standing rules.')).toBeVisible();
  await weekReview.selectOption('2026-08-03');
  await expect(page).not.toHaveURL(/week=/);
  await expect(page.getByLabel('Ezra weekly amount')).toHaveValue('15.00');
});

test('phone adults reason, skip, excuse and reassign today’s chores with visible history', async ({
  page,
  request,
}) => {
  const completion = await request.post(
    'http://127.0.0.1:4310/api/v1/households/household_hearth_demo/chore-occurrences/occurrence_dishes/completions',
    { data: { requestId: 'request_chore_management_seed_completion' } },
  );
  expect(completion.ok()).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/planning');
  await page.getByRole('link', { name: /Today’s chores/ }).click();
  await expect(page.getByRole('heading', { name: 'Today’s chores' })).toBeVisible();

  let schoolBag = page.locator('.chore-management-row').filter({ hasText: 'Pack school bag' });
  await schoolBag.locator('summary').click();
  await expect(schoolBag).toContainText('Pack the lunchbox, water bottle and homework folder.');
  await expect(schoolBag).toContainText('7:00–7:30 am');
  await schoolBag.getByLabel('Reason for the change').fill('Away at school camp');
  await schoolBag.getByRole('button', { name: 'Skip today' }).click();
  await expect(page.getByRole('status')).toContainText('still counts in this week’s pocket money');
  await expect(schoolBag.locator('.chore-management-state')).toHaveText('Skipped');
  await expect(schoolBag.getByRole('region', { name: /History/ })).toContainText(
    'Away at school camp',
  );
  await captureEvidence(page, {
    path: resolve(evidence, 'chore-exception-history-phone.png'),
    animations: 'disabled',
    fullPage: true,
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await captureEvidence(page, {
    path: resolve(evidence, 'chore-exception-history-phone-landscape.png'),
    animations: 'disabled',
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/chores');
  await expect(page.getByText('33% this week')).toBeVisible();
  await expect(page.getByText('$4.00 of $12.00')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pack school bag, skipped' })).toBeVisible();

  await page.goto('/admin/chore-day');
  schoolBag = page.locator('.chore-management-row').filter({ hasText: 'Pack school bag' });
  await schoolBag.locator('summary').click();
  await schoolBag.getByLabel('Reason for the change').fill('Excused for school camp');
  await schoolBag.getByRole('button', { name: 'Excuse this job' }).click();
  await expect(page.getByRole('status')).toContainText('no longer counts against pocket money');
  await expect(schoolBag.locator('.chore-management-state')).toHaveText('Excused');
  await expect(schoolBag.getByRole('region', { name: /History/ })).toContainText(
    'Excused for school camp',
  );

  await page.goto('/chores');
  await expect(page.getByText('50% this week')).toBeVisible();
  await expect(page.getByText('$6.00 of $12.00')).toBeVisible();

  await page.goto('/admin/chore-day');
  const pepper = page.locator('.chore-management-row').filter({ hasText: 'Feed Pepper' });
  await pepper.locator('summary').click();
  const adultName =
    (
      await pepper.getByLabel('Reassign to').locator('option[value="member_maya"]').textContent()
    )?.trim() ?? 'the adult';
  await pepper.getByLabel('Reason for the change').fill(`${adultName} is doing the morning jobs`);
  await pepper.getByLabel('Reassign to').selectOption('member_maya');
  await pepper.getByRole('button', { name: 'Reassign', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(`now belongs to ${adultName}`);
  await expect(pepper.getByRole('region', { name: /History/ })).toContainText(
    `Reassigned from Ezra to ${adultName}`,
  );

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/chores');
  await expect(page.getByText('100% this week')).toBeVisible();
  await expect(page.getByText('$12.00 of $12.00')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Complete Feed Pepper' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Complete Feed Pepper' })).toContainText(
    'Due 7:15 am',
  );
  await captureEvidence(page, {
    path: resolve(evidence, 'chores-due-times-reassigned-tv-1080.png'),
    animations: 'disabled',
  });
});

test('today’s chore exception reports a failed save and retries the same command', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/chore-day?scenario=fail-next');
  const laundry = page.locator('.chore-management-row').filter({ hasText: 'Start laundry' });
  await laundry.locator('summary').click();
  await laundry.getByLabel('Reason for the change').fill('Rain forecast all day');
  await laundry.getByRole('button', { name: 'Skip today' }).click();
  await expect(page.getByRole('alert')).toContainText('That chore change did not save');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('status')).toContainText('still counts in this week’s pocket money');
  await expect(laundry.locator('.chore-management-state')).toHaveText('Skipped');
});

test('@a11y today’s chore management has no serious violations on phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/chore-day');
  const schoolBag = page.locator('.chore-management-row').filter({ hasText: 'Pack school bag' });
  await schoolBag.locator('summary').click();
  await expect(schoolBag.getByLabel('Reason for the change')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
});

test('phone routines assign one schedule to several people and TV expands separate chores', async ({
  page,
  request,
}) => {
  const headers = { 'x-hearth-demo-actor': 'member_maya' };
  const memberResponse = await request.post(
    'http://127.0.0.1:4310/api/v1/households/household_hearth_demo/members',
    {
      headers,
      data: {
        requestId: 'request_multi_assignee_child',
        displayName: 'Alex',
        role: 'child',
        color: '#7a5b8f',
        administrator: false,
      },
    },
  );
  expect(memberResponse.ok()).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/routines');
  await page.getByRole('button', { name: 'New chore' }).click();
  const form = page.locator('.routine-add-form');
  const ezra = form.getByRole('checkbox', { name: /Ezra/ });
  const alex = form.getByRole('checkbox', { name: /Alex/ });
  await expect(ezra).toBeChecked();
  await expect(alex).not.toBeChecked();
  await alex.check();
  await form.getByLabel('Chore', { exact: true }).fill('Put sports gear away');
  await form.getByLabel('Time of day').selectOption('After school');
  await form.getByLabel('Available from').fill('15:45');
  await form.getByLabel('Due by').fill('16:15');
  await form.getByRole('button', { name: 'Add chore' }).click();
  await expect(page.getByRole('status')).toContainText('Put sports gear away was scheduled');
  const titles = page.locator('.routine-editor summary strong');
  const beforeOrder = await titles.allTextContents();
  const beforeIndex = beforeOrder.indexOf('Put sports gear away');
  const editorItem = page
    .locator('.routine-editor-item')
    .filter({ hasText: 'Put sports gear away' });
  await editorItem.getByRole('button', { name: 'Move Put sports gear away earlier' }).click();
  await expect(page.getByRole('status')).toContainText('Chore order was updated');
  expect((await titles.allTextContents()).indexOf('Put sports gear away')).toBe(beforeIndex - 1);
  await page.reload();
  await expect(
    page.locator('.routine-editor').filter({ hasText: 'Put sports gear away' }),
  ).toBeVisible();
  expect((await titles.allTextContents()).indexOf('Put sports gear away')).toBe(beforeIndex - 1);
  await editorItem.scrollIntoViewIfNeeded();
  await captureEvidence(page, {
    path: resolve(evidence, 'routines-order-phone.png'),
    animations: 'disabled',
  });
  const editor = page.locator('.routine-editor').filter({ hasText: 'Put sports gear away' });
  await expect(editor).toContainText('Ezra and Alex · After school · Weekdays · 3:45–4:15 pm');
  await editor.locator('summary').click();
  await expect(editor.getByRole('checkbox', { name: /Ezra/ })).toBeChecked();
  await expect(editor.getByRole('checkbox', { name: /Alex/ })).toBeChecked();
  await editor.locator('.routine-assignees').scrollIntoViewIfNeeded();
  await captureEvidence(page, {
    path: resolve(evidence, 'routines-multi-assignee-phone.png'),
    animations: 'disabled',
  });
  await editor.locator('.routine-time-window').scrollIntoViewIfNeeded();
  await captureEvidence(page, {
    path: resolve(evidence, 'routines-time-window-phone.png'),
    animations: 'disabled',
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/chores');
  const board = page.locator('.chore-groups');
  await expect(board).toHaveAttribute('data-column-count', '3');
  const ezraColumn = board.locator('.chore-group').filter({ hasText: /^Ezra/ });
  const alexColumn = board.locator('.chore-group').filter({ hasText: /^Alex/ });
  await expect(ezraColumn.getByText('Put sports gear away')).toBeVisible();
  await expect(alexColumn.getByText('Put sports gear away')).toBeVisible();
  await expect(ezraColumn.getByText('After school · 3:45–4:15 pm')).toBeVisible();
  await expect(alexColumn.getByText('After school · 3:45–4:15 pm')).toBeVisible();
  await alexColumn.getByRole('button', { name: 'Complete Put sports gear away' }).click();
  await expect(
    alexColumn.getByRole('button', { name: /Put sports gear away, done/ }),
  ).toBeVisible();
  await expect(
    ezraColumn.getByRole('button', { name: 'Complete Put sports gear away' }),
  ).toBeVisible();
  await captureEvidence(page, {
    path: resolve(evidence, 'chores-multi-assignee-tv-1080.png'),
    animations: 'disabled',
  });
});

test('one-off chore creation reports a failed save and retries the same safe command', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/routines?scenario=fail-next');
  await page.getByRole('button', { name: 'New chore' }).click();
  const addChore = page.locator('.routine-add-form');
  await addChore.getByLabel('Chore', { exact: true }).fill('Clean football boots');
  await addChore.getByLabel('Repeat').selectOption('once');
  await addChore.getByLabel('Time of day').selectOption('Anytime');
  await addChore.getByRole('button', { name: 'Add chore' }).click();
  await expect(page.getByRole('alert')).toContainText('That change did not save');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('status')).toContainText('Clean football boots was scheduled');
  await expect(
    page.locator('.routine-editor').filter({ hasText: 'Clean football boots' }),
  ).toHaveCount(1);
});

test('pocket-money setup names every child missing a weekly amount', async ({ page, request }) => {
  const response = await request.post(
    'http://127.0.0.1:4310/api/v1/households/household_hearth_demo/members',
    {
      headers: { 'x-hearth-demo-actor': 'member_maya' },
      data: {
        requestId: 'request_unconfigured_pocket_child',
        displayName: 'Alex',
        role: 'child',
        color: '#7a5b8f',
        administrator: false,
      },
    },
  );
  expect(response.ok()).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/pocket-money');
  await expect(page.getByRole('alert')).toContainText('Set pocket money and payday for Alex.');
  await expect(page.getByText('Nothing due yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Record payment' })).toHaveCount(0);
});

test('the former Rewards bookmark redirects without exposing the star system', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/rewards');
  await expect(page).toHaveURL(/\/admin\/pocket-money$/);
  await expect(page.getByRole('heading', { name: 'Pocket money' })).toBeVisible();
  await expect(page.getByText('Available stars')).toHaveCount(0);
  await expect(page.getByText('Family choices')).toHaveCount(0);
});

test('list failure restores the item and retries with focus preserved', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/lists?scenario=fail-next');
  const milk = page.locator('[data-focus-id="list-item-list_item_milk"]');
  await expect(milk).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('That change did not save');
  await expect(milk).toContainText('Check item');
  await expect(milk).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(milk).toContainText('Checked · Undo');
  await expect(milk).toBeFocused();
});

test('a permission rejection remains family-readable and leaves the list unchanged', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/lists?scenario=permission');
  const milk = page.locator('[data-focus-id="list-item-list_item_milk"]');
  await milk.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Ask an adult');
  await expect(milk).toContainText('Check item');
  await expect(milk).toBeFocused();
});

test('cached lists stay visible through a real browser offline event', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/lists');
  await expect(page.getByText('Milk')).toBeVisible();
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByRole('status')).toContainText('Saved lists remain available');
  await expect(page.getByText('Milk')).toBeVisible();
  await context.setOffline(false);
});

for (const path of [
  '/lists',
  '/meals',
  '/admin/planning',
  '/admin/lists',
  '/admin/meals',
  '/admin/routines',
  '/admin/pocket-money',
]) {
  test(`@a11y ${path} has no serious accessibility violations`, async ({ page }) => {
    await page.setViewportSize({
      width: path.startsWith('/admin') ? 390 : 1920,
      height: path.startsWith('/admin') ? 844 : 1080,
    });
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    if (path === '/admin/routines') {
      await page.getByRole('button', { name: 'New chore' }).click();
      const createForm = page.locator('.routine-add-form');
      await createForm.getByLabel('Repeat').selectOption('once');
      await expect(createForm.getByLabel('Due date')).toBeVisible();
    }
    const results = await new AxeBuilder({ page }).analyze();
    expect(
      results.violations.filter((violation) =>
        ['serious', 'critical'].includes(violation.impact ?? ''),
      ),
    ).toEqual([]);
  });
}

test('@a11y partial-payment history and correction form have no serious violations', async ({
  page,
  request,
}) => {
  const completion = await request.post(
    'http://127.0.0.1:4310/api/v1/households/household_hearth_demo/chore-occurrences/occurrence_school_bag/completions',
    { data: { requestId: 'request_a11y_pocket_completion' } },
  );
  expect(completion.ok()).toBe(true);
  const payment = await request.post(
    'http://127.0.0.1:4310/api/v1/households/household_hearth_demo/pocket-money-payments',
    {
      headers: { 'x-hearth-demo-actor': 'member_maya' },
      data: {
        requestId: 'request_a11y_pocket_payment',
        memberId: 'member_ezra',
        weekStart: '2026-08-03',
        asOfDate: '2026-08-03',
        amountCents: 150,
        note: 'Cash',
      },
    },
  );
  expect(payment.ok()).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/pocket-money');
  await page
    .getByRole('region', { name: 'Payment history' })
    .getByRole('button', { name: 'Correct' })
    .click();
  await expect(page.getByLabel('Correction reason')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
});

test('@visual @a11y dark meal administration remains readable on phone', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'hearth.appearance.v1',
      JSON.stringify({ theme: 'dark', eveningDimming: false }),
    );
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/meals');
  await expect(page.getByRole('heading', { name: 'Meal planning' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
  await captureEvidence(page, {
    path: resolve(evidence, 'admin-meals-dark-phone-portrait.png'),
    animations: 'disabled',
    fullPage: true,
  });
});

const planningViewports = [
  { name: 'tv-4k', width: 3840, height: 2160 },
  { name: 'tv-1080', width: 1920, height: 1080 },
  { name: 'tv-1366', width: 1366, height: 768 },
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
] as const;

for (const viewport of planningViewports) {
  for (const route of ['lists', 'meals'] as const) {
    test(`@visual ${route} at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`/${route}`);
      await expect(
        page.getByRole('heading', { name: route === 'lists' ? 'Lists' : 'Meals' }),
      ).toBeVisible();
      await captureEvidence(page, {
        path: resolve(evidence, `${route}-${viewport.name}.png`),
        animations: 'disabled',
      });
    });
  }
}

for (const route of [
  'planning',
  'lists',
  'meals',
  'routines',
  'chore-day',
  'pocket-money',
] as const) {
  test(`@visual ${route} phone administration`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/admin/${route}`);
    await expect(page.locator('.admin-page, .admin-home')).toBeVisible();
    await captureEvidence(page, {
      path: resolve(evidence, `admin-${route}-phone-portrait.png`),
      animations: 'disabled',
      fullPage: true,
    });
  });
}

test('@visual Phase 4 empty, offline and mutation-failure states', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/lists?scenario=empty');
  await expect(page.getByText('Nothing is planned yet')).toBeVisible();
  await captureEvidence(page, {
    path: resolve(evidence, 'lists-state-empty.png'),
    animations: 'disabled',
  });

  await page.goto('/lists');
  await expect(page.getByText('Milk')).toBeVisible();
  await page.goto('/lists?scenario=offline');
  await expect(page.getByRole('status')).toContainText('Saved lists remain available');
  await captureEvidence(page, {
    path: resolve(evidence, 'lists-state-offline.png'),
    animations: 'disabled',
  });

  await page.goto('/lists?scenario=fail-next');
  await page.locator('[data-focus-id="list-item-list_item_milk"]').press('Enter');
  await expect(page.getByRole('alert')).toContainText('That change did not save');
  await captureEvidence(page, {
    path: resolve(evidence, 'lists-state-failure.png'),
    animations: 'disabled',
  });
});
