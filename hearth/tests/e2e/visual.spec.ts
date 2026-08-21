import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { captureEvidence } from './visualEvidence';

const evidence = resolve('docs/evidence/phase-1/screenshots');
const phaseThreeEvidence = resolve('docs/evidence/phase-3/screenshots');
const monthEvidence = resolve('docs/evidence/month-calendar');
const pocketMoneyEvidence = resolve('docs/evidence/pocket-money/screenshots');

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
  await mkdir(phaseThreeEvidence, { recursive: true });
  await mkdir(monthEvidence, { recursive: true });
  await mkdir(pocketMoneyEvidence, { recursive: true });
});

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
});

const viewports = [
  { name: 'tv-4k', width: 3840, height: 2160 },
  { name: 'tv-1080', width: 1920, height: 1080 },
  { name: 'tv-1366', width: 1366, height: 768 },
  { name: 'phone-portrait', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
] as const;

for (const viewport of viewports) {
  test(`@visual Today at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/today');
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    if (viewport.name !== 'phone-landscape') {
      await expect(
        page.getByAltText('Ezra and Maya set the breakfast table together.'),
      ).toBeVisible();
    }
    const photo = page.getByAltText('Ezra and Maya set the breakfast table together.');
    await expect(photo).toHaveCSS('object-fit', 'contain');
    await expect(page.locator('.today-photo__backdrop')).toHaveCount(0);
    await expect(page.locator('.today-photo')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    if (viewport.width > 900) {
      expect(
        await page.evaluate(() => {
          const appContent = document.querySelector('.app-content');
          const todayScreen = document.querySelector('.today-screen');
          return (
            document.documentElement.scrollHeight <= window.innerHeight + 1 &&
            (appContent === null || appContent.scrollHeight <= appContent.clientHeight + 1) &&
            (todayScreen === null || todayScreen.scrollHeight <= todayScreen.clientHeight + 1)
          );
        }),
      ).toBe(true);
    }
    await captureEvidence(page, {
      path: resolve(evidence, `today-${viewport.name}.png`),
      animations: 'disabled',
    });
  });
}

test('Today photo remains substantial and orientation-safe on TV and phone', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today');
  const tvFrame = page.locator('.today-photo');
  await expect(tvFrame).toBeVisible();
  const tvBox = await tvFrame.boundingBox();
  expect(tvBox?.width).toBeGreaterThan(450);
  expect(tvBox?.height).toBeGreaterThan(300);
  expect((tvBox?.width ?? 0) / (tvBox?.height ?? 1)).toBeCloseTo(1.5, 1);

  await page.setViewportSize({ width: 390, height: 844 });
  const phoneFrame = page.locator('.today-photo');
  await phoneFrame.scrollIntoViewIfNeeded();
  await expect(phoneFrame).toBeVisible();
  const phoneBox = await phoneFrame.boundingBox();
  expect(phoneBox?.width).toBeGreaterThan(330);
  expect(phoneBox?.height).toBeGreaterThan(220);
  expect((phoneBox?.width ?? 0) / (phoneBox?.height ?? 1)).toBeCloseTo(1.5, 1);

  await page.setViewportSize({ width: 844, height: 390 });
  await phoneFrame.scrollIntoViewIfNeeded();
  await expect(phoneFrame).toBeVisible();
  await expect(phoneFrame).not.toHaveCSS('display', 'none');
});

for (const viewport of viewports) {
  test(`@visual Month at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/month');
    await expect(page.getByRole('heading', { name: 'August', exact: true })).toBeVisible();
    await expect(page.locator('.month-grid .avatar')).toHaveCount(0);
    await expect(page.locator('.month-legend .avatar')).toHaveCount(2);
    if (viewport.name.startsWith('phone')) {
      await expect(page.locator('.month-day-details')).toContainText('School drop-off');
    } else {
      await expect(
        page.locator('.month-event-label').filter({ hasText: 'School drop-off' }).first(),
      ).toBeVisible();
    }
    await captureEvidence(page, {
      path: resolve(monthEvidence, `month-${viewport.name}.png`),
      animations: 'disabled',
    });
  });
}

test('@visual Month empty and stale states', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/month?scenario=empty');
  await expect(page.getByRole('status')).toContainText('Nothing planned this month');
  await captureEvidence(page, {
    path: resolve(monthEvidence, 'month-empty-tv-1080.png'),
    animations: 'disabled',
  });
  await page.goto('/month?scenario=stale');
  await expect(page.getByRole('status')).toContainText('Calendar last updated');
  await captureEvidence(page, {
    path: resolve(monthEvidence, 'month-stale-tv-1080.png'),
    animations: 'disabled',
  });
});

for (const route of ['week', 'chores'] as const) {
  test(`@visual ${route} at 1080p`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/${route}`);
    await expect(
      page.getByRole('heading', { name: route === 'week' ? 'Week' : 'Chores' }),
    ).toBeVisible();
    if (route === 'week') {
      const firstEvent = page.locator('.week-event').first();
      await expect(firstEvent.locator('.week-event__meta .avatar')).toBeVisible();
      await expect(firstEvent.locator('.week-event__meta time')).toContainText('8:15 am');
      await expect(firstEvent).not.toContainText('Ezra');
      await expect(firstEvent.locator('.week-event__source')).toHaveCount(0);
      expect((await firstEvent.boundingBox())?.height).toBeLessThan(90);
    }
    await captureEvidence(page, {
      path: resolve(evidence, `${route}-tv-1080.png`),
      animations: 'disabled',
    });
  });
}

test('@visual Chores dynamic three-column board at television and phone sizes', async ({
  page,
  request,
}) => {
  const headers = { 'x-hearth-demo-actor': 'member_maya' };
  const memberResponse = await request.post(
    'http://127.0.0.1:4310/api/v1/households/household_hearth_demo/members',
    {
      headers,
      data: {
        requestId: 'request_visual_third_chore_member',
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
        requestId: 'request_visual_third_chore_template',
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

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/chores');
  await expect(page.locator('.chore-groups')).toHaveAttribute('data-column-count', '3');
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
  ).toBe(true);
  await captureEvidence(page, {
    path: resolve(evidence, 'chores-three-columns-tv-1080.png'),
    animations: 'disabled',
  });

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.reload();
  await expect(page.locator('.chore-groups')).toHaveAttribute('data-column-count', '3');
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
  ).toBe(true);
  await captureEvidence(page, {
    path: resolve(evidence, 'chores-three-columns-tv-1366.png'),
    animations: 'disabled',
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('.chore-groups')).toHaveCSS('display', 'block');
  await captureEvidence(page, {
    path: resolve(evidence, 'chores-three-columns-phone-portrait.png'),
    animations: 'disabled',
  });
});

test('@visual pocket-money progress and administration at required viewports', async ({
  page,
  request,
}) => {
  const headers = { 'x-hearth-demo-actor': 'member_maya' };
  const memberResponse = await request.post(
    'http://127.0.0.1:4310/api/v1/households/household_hearth_demo/members',
    {
      headers,
      data: {
        requestId: 'request_visual_pocket_money_child',
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
        requestId: 'request_visual_pocket_money_chore',
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
  const completion = await request.post(
    'http://127.0.0.1:4310/api/v1/households/household_hearth_demo/chore-occurrences/occurrence_school_bag/completions',
    { data: { requestId: 'request_visual_pocket_money_completion' } },
  );
  expect(completion.ok()).toBe(true);
  const payment = await request.post(
    'http://127.0.0.1:4310/api/v1/households/household_hearth_demo/pocket-money-payments',
    {
      data: {
        requestId: 'request_visual_pocket_money_partial',
        memberId: 'member_ezra',
        weekStart: '2026-08-03',
        asOfDate: '2026-08-03',
        amountCents: 150,
        note: 'Cash',
      },
      headers,
    },
  );
  expect(payment.ok()).toBe(true);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/chores');
    await expect(page.getByText('33% this week')).toBeVisible();
    await expect(page.getByText('$4.00 of $12.00')).toBeVisible();
    await captureEvidence(page, {
      path: resolve(pocketMoneyEvidence, `chores-pocket-money-${viewport.name}.png`),
      animations: 'disabled',
    });
  }

  for (const viewport of viewports.filter((candidate) => candidate.name.startsWith('phone'))) {
    await page.setViewportSize(viewport);
    await page.goto('/admin/pocket-money');
    await expect(page.getByRole('heading', { name: 'Pocket money' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('Alex');
    await expect(page.getByText('$2.50 still to pay')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Payment history' })).toContainText('Cash');
    await captureEvidence(page, {
      path: resolve(pocketMoneyEvidence, `admin-pocket-money-${viewport.name}.png`),
      animations: 'disabled',
      fullPage: true,
    });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/pocket-money');
  const paymentHistory = page.getByRole('region', { name: 'Payment history' });
  await paymentHistory.getByRole('button', { name: 'Correct' }).click();
  await expect(paymentHistory.getByLabel('Correction reason')).toBeVisible();
  await paymentHistory.getByRole('button', { name: 'Void payment' }).evaluate((button) => {
    button.scrollIntoView({ block: 'center' });
  });
  await captureEvidence(page, {
    path: resolve(pocketMoneyEvidence, 'admin-pocket-money-correction-phone-portrait.png'),
    animations: 'disabled',
  });
  await paymentHistory.getByLabel('Correction reason').fill('Recorded from wrong account');
  await paymentHistory.getByRole('button', { name: 'Void payment' }).click();
  await expect(paymentHistory.getByText('Voided · Recorded from wrong account')).toBeVisible();
  await captureEvidence(page, {
    path: resolve(pocketMoneyEvidence, 'admin-pocket-money-voided-phone-portrait.png'),
    animations: 'disabled',
    fullPage: true,
  });
});

const states = [
  { name: 'loading', path: '/today?scenario=loading', marker: 'Gathering today’s plans…' },
  { name: 'empty', path: '/today?scenario=empty', marker: 'Nothing is planned yet' },
  { name: 'stale', path: '/today?scenario=stale', marker: 'Calendar last updated at 6:45' },
  {
    name: 'unavailable',
    path: '/today?scenario=unavailable',
    marker: 'Calendar is unavailable',
  },
  { name: 'offline', path: '/today?scenario=offline', marker: 'Showing saved plans' },
  { name: 'permission', path: '/today?scenario=permission', marker: 'Ask an adult' },
] as const;

for (const state of states) {
  test(`@visual ${state.name} state`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(state.path);
    await expect(page.getByText(state.marker, { exact: false }).first()).toBeVisible();
    await captureEvidence(page, {
      path: resolve(evidence, `state-${state.name}.png`),
      animations: 'disabled',
    });
  });
}

test('@visual mutation failure state', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today?scenario=fail-next');
  await page.locator('[data-focus-id="today-chore-occurrence_school_bag"]').press('Enter');
  await expect(page.getByRole('alert')).toContainText('Couldn’t mark this done.');
  await captureEvidence(page, {
    path: resolve(evidence, 'state-mutation-failure.png'),
    animations: 'disabled',
  });
});

test('@visual skipped chore state', async ({ page, request }) => {
  const response = await request.post(
    'http://127.0.0.1:4310/api/v1/households/household_hearth_demo/chore-occurrences/occurrence_laundry/skips',
    {
      headers: { 'x-hearth-demo-actor': 'member_maya' },
      data: { requestId: 'request_visual_skip_laundry', reason: 'Waiting for dry weather' },
    },
  );
  expect(response.ok()).toBe(true);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/chores');
  await expect(page.getByRole('button', { name: 'Start laundry, skipped' })).toBeVisible();
  await captureEvidence(page, {
    path: resolve(evidence, 'state-skipped-chore.png'),
    animations: 'disabled',
  });
});

test('@visual Phase 3 calendar projection at TV and phone viewports', async ({ page }) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.goto('/week');
  await expect(page.getByRole('button', { name: /School drop-off, Ezra$/ }).first()).toBeVisible();
  await captureEvidence(page, {
    path: resolve(phaseThreeEvidence, 'week-tv-4k.png'),
    animations: 'disabled',
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.reload();
  await expect(page.getByRole('button', { name: /School drop-off, Ezra$/ }).first()).toBeVisible();
  await expect(page.locator('.week-agenda')).toBeHidden();
  await captureEvidence(page, {
    path: resolve(phaseThreeEvidence, 'week-tv-1080.png'),
    animations: 'disabled',
  });

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.reload();
  await expect(page.getByRole('button', { name: /School drop-off, Ezra$/ }).first()).toBeVisible();
  await expect(page.locator('.week-agenda')).toBeHidden();
  await captureEvidence(page, {
    path: resolve(phaseThreeEvidence, 'week-tv-1366.png'),
    animations: 'disabled',
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('.week-agenda')).toBeVisible();
  await captureEvidence(page, {
    path: resolve(phaseThreeEvidence, 'week-phone-portrait.png'),
    animations: 'disabled',
  });

  await page.setViewportSize({ width: 844, height: 390 });
  await page.reload();
  await expect(page.locator('.week-agenda')).toBeVisible();
  await captureEvidence(page, {
    path: resolve(phaseThreeEvidence, 'week-phone-landscape.png'),
    animations: 'disabled',
  });
});

test('@visual Phase 3 cached provider-outage state', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/today?scenario=unavailable');
  await expect(page.getByRole('status')).toContainText('Showing saved plans');
  await expect(page.getByText('School drop-off')).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByAltText('Ezra and Maya set the breakfast table together.')
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await captureEvidence(page, {
    path: resolve(phaseThreeEvidence, 'today-provider-outage-tv-1080.png'),
    animations: 'disabled',
  });
});

test('@visual Phase 3 CalDAV connection boundary on phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin/connections');
  await expect(page.getByRole('link', { name: /Calendar/ })).toBeVisible();
  await expect(page.getByText(/Connection secrets stay on the Hearth server/)).toBeVisible();
  await expect(page.getByRole('link', { name: /Home Assistant/ })).toContainText(
    'four household states and three approved Home actions',
  );
  await expect(page.getByText('Jellyfin', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Music Assistant', { exact: true })).toHaveCount(0);
  await captureEvidence(page, {
    path: resolve(phaseThreeEvidence, 'connections-phone-portrait.png'),
    animations: 'disabled',
  });
});
