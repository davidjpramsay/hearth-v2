import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.use({ isMobile: true, hasTouch: true });

const profiles = [
  { name: 'narrow-phone', width: 320, height: 700 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'phone-landscape', width: 844, height: 390 },
  { name: 'tablet', width: 820, height: 1180 },
];
const surfaces = [
  { path: '/reminders', heading: 'Reminders', name: 'family', long: true },
  { path: '/admin/meals', heading: 'Meal planning', name: 'admin', long: true },
  { path: '/appearance', heading: 'Appearance', name: 'appearance', long: false },
];

test.beforeEach(async ({ request }) => {
  await request.post('http://127.0.0.1:4310/api/v1/demo/reset');
  // Real fictional records ensure scrolling is exercised even on a tall tablet.
  for (let index = 0; index < 24; index++) {
    const response = await request.post(
      'http://127.0.0.1:4310/api/v1/households/household_hearth_demo/reminders',
      {
        headers: { 'X-Hearth-Demo-Actor': 'member_maya' },
        data: {
          requestId: `request_navigation_fixture_${index}`,
          title: `Fictional scroll reminder ${index + 1}`,
          dueLocalDate: null,
          dueAt: null,
          hasDueTime: false,
        },
      },
    );
    expect(response.ok()).toBe(true);
  }
});

async function expectDockedNavigation(page: Page) {
  const tabs = page.locator('.phone-tabs');
  await expect(tabs).toBeVisible();
  const geometry = await tabs.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      position: style.position,
      bottom: rect.bottom,
      top: rect.top,
      height: rect.height,
      viewportBottom:
        (window.visualViewport?.offsetTop ?? 0) + (window.visualViewport?.height ?? innerHeight),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(geometry.position).toBe('fixed');
  expect(Math.abs(geometry.bottom - geometry.viewportBottom)).toBeLessThanOrEqual(1);
  expect(geometry.height).toBeGreaterThanOrEqual(72);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.overflow).toBe(false);
}

async function expectSingleBottomAnchor(page: Page) {
  // Assert the loaded stylesheet, not the source or a used pixel value: CSSOM's
  // getComputedStyle(top) resolves auto to pixels for positioned boxes too.
  const top = await page.locator('.phone-tabs').evaluate((element) => {
    let declaredTop = '';
    const visit = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSMediaRule && matchMedia(rule.conditionText).matches) {
          visit(rule.cssRules);
        } else if (rule instanceof CSSStyleRule && element.matches(rule.selectorText)) {
          const value = rule.style.getPropertyValue('top');
          if (value) declaredTop = value;
        }
      }
    };
    for (const sheet of document.styleSheets) visit(sheet.cssRules);
    return declaredTop;
  });
  expect(top).toBe('auto');
}

for (const profile of profiles) {
  for (const theme of ['light', 'dark'] as const) {
    test(`bottom menu stays docked through scroll and resize on ${profile.name} in ${theme}`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(90_000);
      const issues: string[] = [];
      page.on('pageerror', (error) => issues.push(error.message));
      page.on('console', (message) => {
        if (['error', 'warning'].includes(message.type())) issues.push(message.text());
      });
      await page.emulateMedia({ colorScheme: theme });
      await page.setViewportSize({ width: profile.width, height: profile.height });

      for (const surface of surfaces) {
        await page.goto(surface.path);
        await expect(page).toHaveURL(new URL(surface.path, 'http://127.0.0.1:4320').href);
        await expect(page).toHaveTitle(/Hearth/);
        await expect(
          page.getByRole('heading', { name: surface.heading, exact: true, level: 1 }),
        ).toBeVisible();
        await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0);
        await expect(page.locator('vite-error-overlay')).toHaveCount(0);
        await expectSingleBottomAnchor(page);
        if (surface.name === 'admin') {
          for (const details of await page.locator('.meal-night-editor__options > summary').all()) {
            if (
              !(await details.evaluate((element) => element.parentElement?.hasAttribute('open')))
            ) {
              await details.click();
            }
          }
          await expect(page.locator('.meal-night-editor__options[open]')).toHaveCount(7);
        }

        for (const height of [
          profile.height,
          profile.height - 96,
          profile.height + 76,
          profile.height,
        ]) {
          await page.setViewportSize({ width: profile.width, height });
          const maxScroll = await page.evaluate(
            () => document.documentElement.scrollHeight - innerHeight,
          );
          if (surface.long) expect(maxScroll).toBeGreaterThan(100);
          for (const fraction of [0, 0.5, 1, 0.25, 0]) {
            await page.evaluate(
              (offset) => window.scrollTo({ top: offset, behavior: 'instant' }),
              maxScroll * fraction,
            );
            await expectDockedNavigation(page);
          }
        }

        await page.evaluate(() =>
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
        );
        const contentBottom = await page
          .locator('#main-content > :last-child')
          .evaluate((element) => element.getBoundingClientRect().bottom);
        const menuTop = (await page.locator('.phone-tabs').boundingBox())!.y;
        expect(contentBottom).toBeLessThanOrEqual(menuTop);
        if (profile.name === 'phone') {
          const accessibility = await new AxeBuilder({ page }).analyze();
          expect(
            accessibility.violations.filter((violation) =>
              ['serious', 'critical'].includes(violation.impact ?? ''),
            ),
          ).toEqual([]);
          await page.screenshot({
            path: testInfo.outputPath(`${surface.name}-${theme}-scrolled.png`),
          });
        }
      }

      await page.locator('.phone-tabs').getByRole('link', { name: 'More', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'More', exact: true })).toBeVisible();
      await expectDockedNavigation(page);
      expect(issues).toEqual([]);
    });
  }
}

test('toolbar-sized changes keep the menu, editing hides it and dismissal restores the draft', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lists');
  const draft = page.getByPlaceholder('Add an item');
  await draft.fill('Fictional navigation draft');
  await expectDockedNavigation(page);

  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Object.defineProperty(viewport, 'height', { configurable: true, value: innerHeight - 70 });
    viewport.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('.phone-tabs')).toBeVisible();
  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Object.defineProperty(viewport, 'height', { configurable: true, value: 360 });
    viewport.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('.phone-tabs')).toBeHidden();
  await expect(draft).toHaveValue('Fictional navigation draft');

  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Reflect.deleteProperty(viewport, 'height');
    viewport.dispatchEvent(new Event('resize'));
  });
  await expectDockedNavigation(page);
  await expect(draft).toHaveValue('Fictional navigation draft');
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
});
