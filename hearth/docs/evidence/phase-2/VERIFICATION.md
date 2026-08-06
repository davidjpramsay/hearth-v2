# Phase 2 household-core verification

Verified on 2026-08-03 in Australia/Perth with Node 25.9.0, pnpm 10.33.2
and Playwright Chromium 1.62.1.

## Passed

- `pnpm install --frozen-lockfile` — lockfile current; all five workspace
  projects already installed.
- `pnpm verify` — passed after formatting the final evidence and test edits.
  This ran formatting, lint, strict type checking, 22 unit tests, 12
  server/persistence integration tests, 3 migration tests, production builds
  and 37 Playwright tests.
- `pnpm test:visual` — 18/18 passed; retained the Phase 1 viewport/state set,
  an intentional skipped-chore capture, and the Phase 2 phone portrait, phone
  landscape and 1080p pairing captures.
- `pnpm test:a11y` — 9/9 passed with no axe-detectable serious or critical
  issues on Today/Week/Chores, phone Today, four Admin routes and television
  pairing.
- SQLite restart and closed-file backup/restore — passed for Admin and completed
  chore state. Historical occurrence snapshots, lazy recurrence generation,
  receipt replay and TV/adult/child/voice/automation audits also passed.
- Server-Sent Events invalidation — passed through a two-page Playwright flow:
  a command on Chores updated an already-open Today screen without polling.
- D-pad/keyboard pairing focus and Escape/Back — passed in Playwright.
- Direct Hearth source and built-bundle credential-pattern scans — no private
  key, common token, Google API key, `webcal://` URL or credential query-string
  match.
- Old-source/brand scan — no old Hearth source path or Skylight reference in
  application code.
- `view_image` — inspected both generated concepts and the final 390×844,
  844×390 and 1920×1080 counterparts at original detail.

Production build observation: the web entry is 378.93 kB JavaScript
(113.96 kB gzip) and 29.17 kB CSS (7.06 kB gzip). The SQLite demo was reset and
checkpointed after browser testing at migration 3 with five pending and one
seed-completed occurrence, zero command receipts and zero audits.

## Fixed during verification

- The first complete Playwright run passed 33/34 tests and identified one
  connected-status contrast ratio of 4.41:1. The colour was darkened and the
  focused Admin suite then passed 10/10; final `pnpm verify` passed 35/35.
- The first final `pnpm verify` stopped at `format:check` on two newly edited
  files. Prettier was run and the complete gate then passed.
- Visual inspection found the phone bottom navigation partially overlapping
  the Pair action. Mobile spacing was tightened and the final retained capture
  shows the complete action above the tabs.
- The first SQLite-rendered Today check ordered equal-time seed rows by opaque
  identifier, which moved the primary school-bag chore outside the first three
  cards. Stable template creation order now controls occurrence presentation;
  the focused remote flow and final captures confirm the approved order.
- The skipped domain state initially inherited the pending command treatment.
  It now renders as a calm, non-actionable state and has unit plus retained
  visual coverage.

## Not available / not applicable

- `git diff --check` — not available because this workspace has no Git
  metadata; direct readback, Prettier, boundary searches and test/build outputs
  were used instead.
- Bargain-finder regression suite — not applicable under superseded D-001;
  this is intentionally a Hearth-only workspace.
- Android/Gradle checks — not run because `apps/tv` remains a documented shell
  reservation.
- Real calendar, Home Assistant, Synology deployment and production passkey
  credentials — not configured or tested. They remain Phase 3+ work.

## Workspace scan note

A workspace-wide scan also found pre-existing root `.playwright-cli` browser
console logs containing Google Maps browser-script key query strings from
unrelated browsing. They are outside Hearth source/build artefacts and were not
modified. No such value occurs in Hearth source, docs, retained evidence or
production bundles.
