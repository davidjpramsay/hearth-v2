# Phase 4 household-planning verification

## 2026-08-09 meal-planning polish addendum

The Meals slice now has one real adult companion destination for compact whole-week dinner
planning and reusable meal management. All seven dinner fields remain visible together; saved-meal
and note details expand per night. The TV's two broad meal actions link to that route. Whole-week
save, confirmed copy/clear and saved-meal create/update/archive/restore commands are typed,
adult-authorised, receipt-idempotent, audited and persisted through the SQLite repository. Migration
0016 adds bounded preparation minutes and active/favourite ordering without rewriting prior plans.

Passed from `hearth/`:

- `pnpm install --frozen-lockfile` — the pnpm 10.33.2 lockfile was current across all five projects.
- `pnpm verify` — formatting, lint, strict type checks, 96 unit tests, 70 server integration tests,
  15 migration tests, web/server production builds and all 169 Playwright tests passed.
- The 169 browser cases include remote/Back restoration, multi-night save, same-request failure
  retry, adult/child authorization, invalid/empty/out-of-week input, copy conflict, confirmed clear,
  saved-meal search/favourite/edit/archive/restore, SQLite restart, all required TV/phone viewports,
  dark mode and axe accessibility checks.
- `git diff --check` — passed after final documentation formatting.

The production Meals Admin chunk is 14.18 kB JavaScript (4.29 kB gzip). The main entry is
460.75 kB JavaScript (134.02 kB gzip), and the stylesheet is 130.69 kB (23.69 kB gzip). The server
build copied all 16 forward migrations. The installed Playwright Chromium remained the rendering
fallback because no Browser/IAB controller was available.

The accepted Meals concept and fresh 4K, 1080p, 1366, phone portrait, phone landscape, light Admin
and dark Admin counterparts were inspected with `view_image`. That inspection found and fixed three
material polish issues: seven fully expanded three-field phone rows were collapsed to a compact
dinner-first editor; short phone landscape was tightened so the meal cards finish above the fixed
tabs; and the dark shared submit background was split from the light plum text token after axe
measured only 2.1:1 contrast. The settled dark action colour measures 7.87:1 against white. The
first combined browser gate also exposed an ambiguous non-exact Today test locator; making the page
heading exact removed the test defect, and the complete 169-case gate then passed.

## 2026-08-09 list-management polish addendum

The current Phase 4 list slice now includes phone-first adult administration:
create, rename, type, colour, order, archive and restore lists; add, edit,
order and remove items; confirmed clear-checked soft archive; and the existing
TV check/undo path. The original migration 0005 already contained the required
archive and ordering columns, so no redundant migration was added.

Passed from `hearth/`:

- `pnpm install --frozen-lockfile` — lockfile current across all five projects.
- `pnpm verify` — formatting, lint, strict type checks, 96 unit tests, 69 server
  integration tests, 14 migration tests, web/server production builds and 164
  Playwright tests all passed.
- `git diff --check` — passed.
- Playwright covered same-request retry, adult authorization, invalid order,
  final-list protection, create/edit/order/archive/restore/clear flows, Back,
  TV control isolation, quantity display and axe checks.

The production list-admin chunk is 14.18 kB JavaScript (4.07 kB gzip). The
main entry is 461.16 kB JavaScript (134.10 kB gzip), and the stylesheet is
121.91 kB (22.40 kB gzip). The installed Playwright Chromium remained the
rendering fallback because no Browser/IAB controller was available. Fresh 4K,
1080p, 1366, phone portrait, phone landscape, Admin and list-state evidence was
retained and inspected against the accepted Phase 4 concepts. The inspection
also found and fixed initial focus clipping the short phone-landscape header.

> Historical 2026-08-03 checkpoint. Its reward-ledger counts describe the then-current migration-5
> implementation, not the active product. D-027/D-035 and the pocket-money evidence supersede those
> runtime claims; the old tables remain only for forward-only database upgrades.

Verified on 2026-08-03 in Australia/Perth with Node 25.9.0, pnpm 10.33.2 and
Playwright Chromium 1.62.1.

## Passed

- `pnpm install --frozen-lockfile` — all five workspace projects current under
  the pinned pnpm 10.33.2 lockfile.
- `pnpm format:check`, authoritative root-document Prettier check and
  `pnpm lint` — passed without warnings.
- `pnpm verify` — passed: formatting, lint, strict type checking, 34 unit tests,
  31 server/persistence integration tests, 5 migration tests, production builds
  and 67 Playwright tests.
- `pnpm test:visual` — 35/35 passed and refreshed all retained Phase 1–4
  screenshots, including 16 Phase 4 PNGs.
- `pnpm test:a11y` — 15/15 passed with no axe-detectable serious or critical
  issues on the covered television, phone, Admin and pairing surfaces.
- Direct database readback after reset — migration 5, 3 lists, 10 list items,
  12 saved meals, 7 planned dinners, 2 reward definitions, 6 ledger entries,
  6 active chore templates, 13 active cached calendar events, and no command
  receipts or audit events left by verification.
- Direct source and built-web scans — no old Hearth implementation path,
  Skylight/bargain-finder application reference, private key, credential URL,
  private LAN URL or embedded credential value. The only environment file is
  the placeholder-only `.env.example`.
- `view_image` — inspected all four accepted concepts and fresh TV, phone,
  Admin, empty, offline, failure and compact-TV counterparts.

Production build observation: the web entry is 412.89 kB JavaScript (121.32 kB
gzip) and 43.79 kB CSS (9.71 kB gzip); the complete web distribution is 3.3 MB
including local Source Sans 3 subsets, maps and fictional image assets.

## Coverage

- Strict browser-safe list, meal, reward, recurring-chore and voice schemas.
- WAL/foreign-key migration 5 with list constraints and unique ledger reversals.
- SQLite list completion/undo, normalized duplicate rejection, meal persistence,
  saved meals, reward adjustments/reversals, chore star award/undo and recurring
  template history safety.
- Fastify route validation, permissions, voice idempotency, family-safe error
  codes and source-aware audits.
- Remote-only Lists check/undo → Meals → Back, focus retention, real offline
  cached data, fail-next rollback/retry, phone list/meal editing, recurring chore
  editing and reward reversal.
- Axe checks and retained renders at 3840×2160, 1920×1080, 1366×768, 390×844
  and 844×390.

## Verification findings

- The first targeted browser pass exposed the wrong seeded routine-open ID;
  correcting it made the primary routine immediately editable and focusable.
- Axe found one 13 px reward-history label at 4.4:1 rather than 4.5:1; the
  settled-copy colour was darkened and the rerun passed.
- The empty-to-offline visual test initially retained the intentionally cached
  empty query. Reloading healthy content before simulating offline now proves
  the actual cached-content contract.
- Concepts and fresh counterparts were inspected with `view_image`; the
  resulting adaptations are recorded in `FIDELITY.md`.

## Intentionally not configured

- A credentialed live CalDAV read and all calendar writes. The read-only
  CalDAV/iCloud adapter is implemented and remains inert without external
  owner-supplied configuration.
- Home Assistant or local voice hardware access. Native Google TV media apps are outside Hearth's integration boundary.
- Synology deployment, production passkeys or Android/Gradle tooling.
- `git diff --check`, because this workspace has no Git metadata.
- Bargain-finder tests, which are not applicable under superseded D-001.
