# Phase 3 calendar verification

Verified on 2026-08-03 in Australia/Perth with Node 25.9.0, pnpm 10.33.2 and
Playwright Chromium 1.62.1.

## Passed

- `pnpm format` and authoritative-root-document Prettier check — passed.
- `pnpm install --frozen-lockfile` — lockfile current; all five workspace
  projects already installed.
- `pnpm verify` — passed after the CalDAV extension: formatting, lint, strict
  type checking, 34 unit tests, 31 server/persistence integration tests, 5
  migration tests, production builds and 67 Playwright tests.
- `pnpm test:visual` — 35/35 passed, including retained Phase 3 calendar
  captures at 3840×2160, 1920×1080, 1366×768, 390×844 and 844×390 plus cached
  provider outage.
- `pnpm test:a11y` — 15/15 passed with no axe-detectable serious or critical
  issues on the covered television, phone, Admin and pairing surfaces.
- Provider projection integration corpus — passed for multiple source owners,
  opaque IDs, bounded/full and cursor/incremental sync, all-day inclusive local
  dates, recurrence master/exception state, deletion tombstones, persisted
  cursor/cache, outage recovery and secret-safe error state.
- CalDAV adapter integration corpus — passed for HTTPS-only strict external
  configuration, exact non-empty calendar allowlisting, read-only capability,
  Perth query boundaries, bounded recurrence expansion, inclusive multi-day
  all-day events, recurrence exceptions, cancellations, stable cursors,
  event detail, authentication translation, malformed-data cache protection,
  credential non-enumerability and a complete persisted Today query.
- Core date corpus — passed for Perth-local ranges and imported Sydney DST
  boundaries.
- D-pad/keyboard remote flow — passed through Today → Week → Chores, complete,
  undo, Back to Week and Back to Today after the timeline change.
- Direct source scans — no old Hearth path, Skylight/bargain-finder application
  reference, private key, API-key, credential URL, private ICS URL, private LAN
  address or Synology remote hostname.
- Direct database readback after reset — migration 4, 3 calendars, 13 active
  cached events, 5 pending and 1 seed-completed chore, 0 receipts, 0 audits and
  0 pairing requests.
- `view_image` — inspected accepted Week/phone/state concepts and fresh TV,
  phone and outage counterparts at original detail.

Production build observation: the web entry is 412.89 kB JavaScript (121.32 kB
gzip) and 43.79 kB CSS (9.71 kB gzip). The server-only `tsdav` and `ical.js`
dependencies are absent from that browser bundle.

## Fixed during verification

- The first full Playwright run passed 39/40. The product was correct; one test
  selected a hidden desktop copy of `Maya` after switching to phone layout.
  Scoping the assertion to the visible phone agenda passed, followed by a clean
  40/40 complete run.
- Visual comparison exposed the legacy stacked Week columns as materially less
  faithful than the accepted time-axis concept. Week now uses a time-positioned
  open schedule, source avatars, weather/morning glance and concept-aligned
  Earlier/Later week controls.
- The first 1366 timeline capture clipped multi-word titles. Breakpoint-specific
  wrapping/type spacing now shows complete titles without changing 1080p/4K.
- The phone navigation background was made opaque so scrolled agenda content
  does not ghost through the stable tab bar.
- A first final E2E attempt overlapped a still-running yielded Playwright
  process and failed the shared-state pairing assertion at 64/65. After both
  spawned suites ended and demo state was reset, the isolated pre-evidence run
  passed 65/65; no product change was needed for that assertion. The final
  suite adds the Connections visual/accessibility cases and passes 67/67.
- The updated phone Connections explanation was inspected at 390×844. It fits
  without clipping and retains the fixed navigation. The inspection exposed a
  pre-existing `/favicon.ico` 404; `index.html` now points at the local Hearth
  mark and a repeat load has no missing-icon request.

## Not available / intentionally not run

- Browser/IAB verification — unavailable in the current toolset; installed
  Playwright Chromium was the approved fallback.
- `git diff --check` — unavailable because this workspace has no Git metadata;
  direct readback, formatting, tests, database queries and boundary scans were
  used instead.
- Credentialed iCloud/CalDAV read sync — intentionally not run because no
  external app-specific credential or exact live allowlist was supplied. The
  adapter and selected provider are implemented; this is a deployment
  validation/owner action rather than a missing code path.
- Live calendar writes/conflict handling — absent by design; no write scope has
  been approved.
- Synology deployment, production passkeys and Android/Gradle — not configured
  or run; they remain later roadmap work.
- Bargain-finder regression suite — not applicable under superseded D-001 in
  this intentionally Hearth-only workspace.
