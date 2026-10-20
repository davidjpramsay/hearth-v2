import { expect, type Page } from '@playwright/test';

/** Check visible siblings, not merely the page scroll height (which can hide overlaps). */
export async function expectTodayGeometry(page: Page, television = true) {
  await expect
    .poll(() =>
      page
        .locator('.today-photo__image')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  const problems = await page.locator('.today-dashboard').evaluate((dashboard, tv) => {
    const bounds = dashboard.getBoundingClientRect();
    // Focus scales a tile slightly; the 4K shell doubles those logical pixels.
    const tolerance = 6 * Number(getComputedStyle(document.querySelector('.app-shell')!).zoom || 1);
    const elements = [
      ...dashboard.querySelectorAll<HTMLElement>(
        '.today-section, .summary-band, .today-photo-action',
      ),
    ].filter((element) => element.getBoundingClientRect().width > 0);
    const issues: string[] = [];
    for (const [index, element] of elements.entries()) {
      const box = element.getBoundingClientRect();
      const label = element.className;
      if (box.width < 1 || box.height < 1) issues.push(`${label}: collapsed`);
      if (tv && element.matches('.summary-band') && box.height < 10 * tolerance - 1)
        issues.push(`${label}: too short for readable summary content`);
      if (
        box.left < bounds.left - tolerance ||
        box.right > bounds.right + tolerance ||
        (tv && (box.top < bounds.top - tolerance || box.bottom > bounds.bottom + tolerance))
      )
        issues.push(`${label}: outside dashboard`);
      for (const other of elements.slice(index + 1)) {
        const next = other.getBoundingClientRect();
        if (
          Math.min(box.right, next.right) - Math.max(box.left, next.left) > tolerance &&
          Math.min(box.bottom, next.bottom) - Math.max(box.top, next.top) > tolerance
        )
          issues.push(`${label} overlaps ${other.className}`);
      }
    }
    if (tv) {
      for (const row of dashboard.querySelectorAll('.event-row, .chore-row')) {
        const bounds = row.getBoundingClientRect();
        for (const part of row.querySelectorAll(
          '.event-row__body, .chore-row__copy, .avatar, .chore-row__action',
        )) {
          const box = part.getBoundingClientRect();
          if (box.top < bounds.top - 1 || box.bottom > bounds.bottom + 1)
            issues.push(`${part.className}: spills outside its row`);
        }
      }
    }
    const image = dashboard.querySelector<HTMLImageElement>('.today-photo__image');
    const slot = dashboard.querySelector('.today-photo-action')?.getBoundingClientRect();
    if (image && slot) {
      const imageBox = image.getBoundingClientRect();
      if (!image.complete || image.naturalWidth === 0) issues.push('Photo did not load');
      if (
        imageBox.left < slot.left - 1 ||
        imageBox.right > slot.right + 1 ||
        imageBox.top < slot.top - 1 ||
        imageBox.bottom > slot.bottom + 1
      )
        issues.push('Photo escaped its slot');
      // object-fit:contain preserves the intrinsic pixels even when the CSS image box differs.
      if (getComputedStyle(image).objectFit !== 'contain') issues.push('Photo can crop');
    }
    const summaries = dashboard.querySelector('.summary-details')?.getBoundingClientRect();
    if (tv && summaries && Math.abs(summaries.bottom - bounds.bottom) > 1)
      issues.push('Summaries do not use the remaining vertical space');
    const verse = dashboard.querySelector<HTMLElement>('.today-daily-verse');
    if (tv && verse) {
      const box = verse.getBoundingClientRect();
      const style = getComputedStyle(verse);
      const zoom = Number(getComputedStyle(document.querySelector('.app-shell')!).zoom || 1);
      const naturalContentHeight = Math.max(
        ...[...verse.children].map((child) => child.getBoundingClientRect().height),
      );
      const verticalInsets =
        parseFloat(style.paddingTop) +
        parseFloat(style.paddingBottom) +
        parseFloat(style.borderTopWidth) +
        parseFloat(style.borderBottomWidth);
      if (Math.abs(box.height - (naturalContentHeight + verticalInsets * zoom)) > 2 * zoom)
        issues.push('Verse grows beyond its displayed content height');
      if (Math.abs(box.bottom - bounds.bottom) > 1)
        issues.push('Verse is not anchored to the bottom of the dashboard');
      for (const other of dashboard.querySelectorAll('.summary-band:not(.today-daily-verse)')) {
        if (other.getBoundingClientRect().bottom > box.top - 4 * zoom)
          issues.push('Another summary is not above the verse footer');
      }
    }
    return issues;
  }, television);
  expect(problems).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
}
