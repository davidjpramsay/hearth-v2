import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
}

test.beforeEach(async ({ page, request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
  await page.setViewportSize({ width: 390, height: 844 });
});

test('connected calendar choices and assignments remain editable without calendar credentials', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto('/admin/connections/calendar');
  await page.getByLabel('Apple Account email or CalDAV username').fill('fictional@example.com');
  await page.getByLabel('App-specific password').fill('fictional-app-password');
  await page.getByRole('button', { name: 'Test connection' }).click();
  await page.getByRole('checkbox', { name: 'Maya' }).uncheck();
  await page.getByRole('button', { name: 'Save 2 calendars' }).click();

  await expect(page.getByText('Calendar name', { exact: true })).toBeVisible();
  await expect(page.getByText('Assigned person', { exact: true })).toBeVisible();
  await expect(page.getByText('Display colour', { exact: true })).toBeVisible();
  await expect(page.getByLabel('App-specific password')).toHaveCount(0);

  await page.getByRole('button', { name: 'Edit calendars' }).click();
  await expect(page.getByText('Calendars refreshed', { exact: true })).toBeVisible();
  await expect(page.getByLabel('App-specific password')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Family' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Ezra' })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Maya' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: 'Maya' }).check();
  await page.getByRole('button', { name: 'Save calendar choices' }).click();
  await expect(page.getByRole('status')).toContainText('Calendar choices saved');
  await expect(page.getByLabel('Assigned person for Maya')).toHaveValue('member_maya');

  const familyAssignment = page.getByLabel('Assigned person for Family');
  await familyAssignment.selectOption('member_maya');
  await expect(page.locator('.calendar-selected-row').first()).toContainText('#C97900');
  await page.getByRole('button', { name: 'Save calendar assignments' }).click();
  await expect(page.getByRole('status')).toContainText('Calendar assignments saved');

  await page.reload();
  await expect(page.getByLabel('Assigned person for Family')).toHaveValue('member_maya');
  await expect(page.getByLabel('App-specific password')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Replace connection' })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test('weather location supports search, advanced coordinates, test, save and reload', async ({
  page,
}) => {
  await page.goto('/admin/household');

  await expect(page.getByLabel('Timezone')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Weather location' })).toBeVisible();
  await page.getByLabel('Search suburb or postcode').fill('6171');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: /Baldivis, WA/ }).click();

  const candidate = page.locator('.weather-location-candidate');
  await candidate.getByText('Advanced').click();
  await expect(candidate).toContainText('Latitude -32.32800 · Longitude 115.82000');
  await candidate.getByRole('button', { name: 'Test weather' }).click();
  await expect(page.getByRole('status')).toContainText('Weather works forBaldivis, WA');
  await expect(page.getByRole('status')).toContainText('18° · Partly cloudy');
  await page.getByRole('button', { name: 'Save weather location' }).click();
  await expect(page.getByRole('status')).toContainText('Weather location saved');

  await page.reload();
  const saved = page.locator('.weather-saved-location');
  await expect(saved).toContainText('CurrentBaldivis, WA');
  await saved.getByText('Advanced').click();
  await expect(saved).toContainText('Latitude -32.32800 · Longitude 115.82000');
  await expect(page.getByText('No matching places found')).toHaveCount(0);
  await expectNoSeriousAccessibilityViolations(page);
});
