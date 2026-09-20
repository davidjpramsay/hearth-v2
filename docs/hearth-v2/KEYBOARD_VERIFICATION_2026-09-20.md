# Keyboard navigation verification — 20 September 2026

## Changes

- Reminders enters on Open; Open/All sits above the list, below the creation form.
- Filters share one loaded projection, preserving focus and working without another request.
- Spatial navigation prefers neighbouring content over the fixed phone menu or distant rail.
- Edge-to-edge distance and substantial cross-axis overlap prevent small header actions from
  stealing focus from aligned rows. Controls above a wide chart do not intercept horizontal exit.
- Native text/date editing, modal containment and authenticated command boundaries are unchanged.
- Older navigation tests now follow rendered positions, including stacked phone dialog actions,
  header overflow links, calendar selector entry and responsive Today summaries.

## Verification

The frontend-testing-debugging skill guided rendered inspection and keyboard regression checks.
The browser-plugin skill was unavailable; the repository's Playwright Chromium production-preview
suite was used against isolated demo data, not the NAS.

Passed:

- `pnpm verify:code`: formatting, lint, types, 208 unit tests, 116 integration tests,
  24 migration tests, deployment configuration checks and production builds.
- `pnpm verify:ci`: workflow policy and complete, non-overlapping 867-test shard coverage.
- Final affected-screen/layout batch: 517 browser tests, including all 384 Today compositions,
  Reminders empty/offline/light/dark scenarios, Photos, planning, calendar, Appearance and Weather.
- Complementary browser coverage: 350 tests passed in the preceding broader run. That run also
  exposed the Weather horizontal-exit regression; it was fixed, unit-tested and passed in the
  final 517-test batch. This is coverage across runs, not a claim of one all-green final full run.
- TV and phone screenshots inspected; focus visible and no horizontal overflow on Reminders.
- `git diff --check`.

Earlier failing assertions and genuine spatial-navigation regressions were resolved, not skipped.
The 350 complementary cases were not rerun after the final narrow chart-exit guard.
Physical Google TV remote, live NAS, suspend/resume and hosted release/image publication remain
separate gates. No production data, containers, firewall, DNS or passkeys were changed.
