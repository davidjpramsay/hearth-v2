# Hearth v2 acceptance and definition of done

## Combined release candidate — 2026-10-10

The owner approves committing/pushing the pending shared-screen isolation, phone dock, compact
People colours, responsive Appearance, Weather, photo-menu colour and explicit chore People-picker
changes. The latest combined `pnpm verify:code` passes 351 unit, 143 API/integration and 24 migration
tests plus formatting/lint/types/deployment checks and production builds. `pnpm verify:ci` inventories
1015 browser cases; the complete hosted workflow, including all browser shards, Android and immutable
image publication, must pass at the exact candidate before it becomes an installable release.

The owner chooses to install through their phone's **System health → Hearth update** after that
gate. Publishing is not deployment. Read-only preflight finds the old private release healthy, the
fixed release helper installed and the root-owned update agent running. No NAS activation, staging,
network/configuration change, credential reset or household write is performed while preparing this
candidate. The phone updater uses the existing commissioned protected configuration and automatic
backup/rollback/readiness path; no APK replacement is needed for this web/server-only update.
Actual installed version, phone/TCL rendering and physical remote acceptance remain separate
post-install evidence; earlier sections record the local preparation checks, not live completion.

## Explicit chore People selection — 2026-10-10

New chores start with no person selected, including households with only adults. Editing starts
with the saved assignee set. Every checkbox can be unticked, including the last one; focusing a
person never selects them. Creation and editing reject an empty selection locally with
**Choose at least one person.**, retain the draft, mark/link the invalid People controls for
assistive technology and bring the message/picker into view before focusing the first checkbox.
Choosing a person clears the error. There is no automatic first-child or adult fallback.

`pnpm verify:code` passes format, lint, workspace types, **351 unit tests** (35 shared, 35 core,
71 server, 210 web), **143 API/integration tests**, 24 migration tests, deployment checks and
production web/server builds. Seven new screen unit tests cover empty defaults, focus-only,
last-person deselection, blocked empty create/update, draft preservation, corrected exact selections,
cancel/reopen and adult-only fallback absence. The existing server/shared nonempty-assignee rule
is unchanged. `pnpm verify:ci` passes five policy checks and inventories all **1015 browser tests**;
it does not execute the full inventory. Scoped document Prettier and `git diff --check` pass.

The final built-browser command passes **19 cases in 1.2 minutes**:

```sh
pnpm test:e2e:built tests/e2e/chore-assignees.spec.ts tests/e2e/planning.spec.ts \
  tests/e2e/screen-admin-isolation.spec.ts tests/e2e/keyboard-layout.spec.ts \
  -g 'chore People picker|phone Family Planning|phone routines assign|one-off chore creation|@a11y /admin/routines|paired .* has no administration links|all admin routes|admin text fields retain|admin screens retain visible' \
  --max-failures=0 --output=/tmp/hearth-chore-people-GW6r6y/final-viewport --reporter=line
```

Eight new light/dark cases cover 320×700, 390×844, 844×390 and 1920×1080 adult browsers. They
exercise New chore → empty save (zero POST/PATCH) → keyboard selection/deselection → save one
explicit child → reload → clear the saved selection → empty save (zero additional command) →
save two explicitly chosen people → reload and typed API readback. All unrelated templates remain
identical to the baseline. Page identity, meaningful content, overlay absence, browser errors/warnings,
horizontal containment and serious/critical accessibility pass. Feedback is fully within the
viewport and outside fixed clock/dock bounds for both create/edit failures. Broader cases retain
multi-person TV expansion, ordering, one-off/failed-save retry, pocket-money planning, native input
keys/Tab, visible keyboard focus and paired-screen exclusion from all administration routes.

Screenshots stay outside Git under the command's output directory. `view_image` inspects phone
light validation, phone dark explicit selection and wide light validation. An earlier rendered
check catches wide-screen feedback above the visible area despite passing DOM visibility assertions;
centred picker scrolling and stricter viewport/clock/dock assertions repair that gap. Initial test
fixture, type and import issues are corrected before the final gates; no failure is waived.
Browser plugin not available; repository Playwright uses only the isolated fictional local demo at
`http://127.0.0.1:4320`, never the private household origin.

This fix is **local, uncommitted, unpushed and undeployed**. Actual iPhone Safari, physical TV/remote
and the full hosted release suite are not run. Shared screens still cannot open the adult editor.
No saved household assignments are repaired or removed automatically, and no production data,
API/schema, recurrence/history, credential, pairing, background work, APK or NAS/networking
configuration is changed. Earlier pending work remains intact.

## Consistent photo-management menu colour — 2026-10-10 (D-075 refinement)

**Manage photos** now uses the ordinary joined-row styling in More: neutral text/background and
the same green icon treatment as peer settings in both themes. The one-off purple variant is
removed, not replaced with another special accent. Gallery/management destinations, explicit title,
row order, inset focus and the shared-screen administration guard remain unchanged.

`pnpm verify:code` passes format, lint, workspace type checks, 344 unit tests, 143 API/integration
tests, 24 migration tests, deployment checks and production web/server builds. `pnpm verify:ci`
passes five policy tests and verifies the 1007-case browser inventory; this is not full execution.
Scoped document Prettier and `git diff --check` pass.

The final focused built-browser run passes **16 cases (49.7 seconds)**:

```sh
pnpm test:e2e:built tests/e2e/admin.spec.ts tests/e2e/screen-admin-isolation.spec.ts \
  tests/e2e/photos.spec.ts \
  -g 'Manage photos matches|phone admin keeps all five|phone More opens setup|Hearth settings groups|desktop admin uses|paired .* has no administration links|phone administration uploads and curates|photo curation remains calm' \
  --max-failures=0 --output=/tmp/hearth-photos-colour-wkicDU/final-verified --reporter=line
```

Six new cases compare row text/background and icon colours at 320×700, 390×844 and 1920×1080 in
light/dark. They check page identity/content, horizontal containment, console health, accessibility,
visible focus and Photos → Games → Manage photos D-pad/Select navigation, then return from photo
management. Existing cases retain phone docking/settings navigation, photo upload/curation and
the exclusion of administration from paired screens, including 4K. Screenshots are outside Git at
the command's output path; `view_image` inspects phone and wide light/dark captures. Browser plugin
unavailable; repository Playwright targets only the isolated fictional local demo.

The before-fix regression fails on the actual purple colour mismatch. The first post-fix run has
two test-selector failures because the wide layout also has a Photos rail link; scoping those
selectors to More fixes the harness before the final all-pass run. No product failure is waived.
This change is **local, uncommitted, unpushed and undeployed**. Actual iPhone Safari/physical TCL and
the full hosted release suite are not run. No photo, household data, API, credential, pairing,
networking, NAS configuration or APK is changed; earlier pending work is preserved.

## Weather graph clarity and responsive layout — 2026-10-10 (D-077 refinement)

Rain now has two aligned lanes in one active daily graph: a purple probability line with fixed
0–100% ticks, and blue millimetres-per-hour bars with a separate, labelled zero-based scale.
Labels, units, line/bar shape and the slider's text alternative are redundant with colour.
Both selected values remain visible on phone. Temperature/feels-like and wind/gusts retain their
comparison styles, with explicit units and exact readable ticks; wind starts at zero. Current
low/high labels, a visible Seven days heading, wide-row column labels and condition-aware weekly
icons improve the reading order. All seven temperature ranges still share one domain.

The fixed household-local midnight-to-midnight timeline, separate live/manual markers, shared
minute clock, gap-safe data and Now/Select restoration remain. A tap inspects the nearest hour
without pointer capture or drag ownership; buttons and D-pad remain alternatives. Tap mapping
accounts for 4K CSS zoom. Measuring on mode change prevents a transient old-height viewBox.
Compact and short-wide spacing remains one-screen. Saved/offline status now uses the normal
header freshness line, retaining visible saved age beside the hour controls, so a tall banner no
longer pushes the last day off a compact TV.

The final `pnpm verify:code` passes format, lint, workspace types, **344 unit tests** (35 shared,
35 core, 71 server, 203 web), **143 API/integration tests**, 24 migration tests, eight owner-tool
tests, deployment checks and production web/server builds. `pnpm verify:ci` passes five policy
checks and a complete, non-overlapping **1001-test browser inventory**, not full execution.
Scoped authoritative-document Prettier and `git diff --check` pass. An initial new-test type error
and format failure are repaired before repeating the full gate.

The final built-browser command below passes all **106 cases in 4.1 minutes**. This includes
Weather and the existing pending responsive/access-boundary regressions; it is not the full
1001-case hosted release suite.

```sh
pnpm test:e2e:built tests/e2e/weather.spec.ts tests/e2e/appearance.spec.ts \
  tests/e2e/shell-clock.spec.ts tests/e2e/phone-navigation.spec.ts \
  tests/e2e/keyboard-layout.spec.ts tests/e2e/screen-admin-isolation.spec.ts \
  tests/e2e/native-tv-viewport.spec.ts --max-failures=0 \
  --output=/tmp/hearth-weather-42womg/final-viewport --reporter=line
```

Weather's 23 cases include a 16-case light/dark matrix at 320×700, 390×844, 844×390, 820×1180,
1366×768, 1672×941, 1920×1080 and 3840×2160. They exercise all three modes, measured native-pixel
SVG dimensions, whole-day endpoints, distinct rain colours/lanes, visible secondary readings,
tap/step/Now, one-screen TV and horizontal containment. Additional cases cover keyboard/D-pad,
weekly wind/calmed/missing values, cached heavy rain, missing-hour gaps and compact offline/reconnect
behaviour. Page identity, meaningful content, overlay absence, browser errors/warnings and
serious/critical accessibility are checked. Broader cases retain the pending Appearance,
phone-dock and screen/admin boundary coverage. Browser plugin unavailable; repository Playwright
uses the built fictional demo at `http://127.0.0.1:4320`, never the private production origin.

Early rendered passes identify compact/short-wide overflow and a mode-height race; both are fixed,
not waived. A final native-size screenshot also catches a short-wide grid row growing beyond the
viewport: content-only overflow assertions passed while the outer shell scrolled its heading away.
The shell row is explicitly constrained and the matrix now asserts a fully visible heading/rail
clock and zero outer-shell scroll after inspection/Now, not just content dimensions.
An additional temporary Playwright wind/phone inspection discovers compact offline
overflow (830 versus 768 pixels); after the freshness change the readback is 768/768, with no
browser errors or warnings. Its interaction path is Wind → chart Left/Right → Select/Now → Rain,
then a compact offline check. Screenshots remain outside Git; the temporary runner is removed.

Visual design/fidelity ledger: the generated TV/phone concepts are preview-only at
`/Users/djpramsay@acc.edu.au/.codex/generated_images/01a03727-4977-7420-8e61-3c07dedae9e5/exec-be976ce2-1c7f-4987-bde8-0c66897e78d8.png`
and `exec-009d90b2-454c-4630-afe7-7c79486c8647.png` in the same directory. `view_image` compares
both with the latest rendered screenshots. The inspected points are the original warm Hearth
palette/shell, heading/current-condition hierarchy, typography, purple-line/blue-bar encoding,
explicit axes/units, restrained weekly rows, spacing and phone adaptation. The TV concept's
1672×941 native size is checked; phone uses the requested 390-pixel logical viewport rather than
the generated image's upscaled raster width. Intentional functional deviations retain Hearth's
established shell metrics and real previous/Now/next controls rather than invented hour buttons,
put lane labels above plots, and keep wind on a second phone row rather than reproducing an
over-wide table. Selected readings name the forecast hour, while the separate dot follows the
current minute; all forecast values/scales come from data, not the mockup. Above-the-fold copy
adds only the specified units/low/high/rain labels and existing state copy. No raster UI, filler,
new navigation or unresolved material visual mismatch is introduced. Final viewport screenshots
include `/tmp/hearth-weather-42womg/weather-rain-tv-viewport.png`,
`weather-rain-phone-viewport.png`, `weather-wind-tv.png` and `weather-compact-offline.png` in the
same directory; phone viewport captures keep the dock at the physical bottom rather than making
a full-page screenshot look like a mid-page floating menu.
The final post-grid-fix TV/native-size images are in `final-viewport/` below the same evidence
directory; full heading/clock visibility is confirmed in both themes after the hour/Now flow.

Physical TCL/remote, actual iPhone Safari, commit/push, hosted full-suite release verification and
private deployment are **not run**. No DTO, provider request, persistence, APK, NAS configuration,
network, household data, credential, pairing or background behaviour is changed. This Weather
refinement is part of the existing pending local UI/security update, not a live release.

## Full-screen Appearance presentation — 2026-10-10 (D-026 refinement)

Appearance previously always entered a 680-pixel companion shell, removing the TV rail and
presenting the phone dock even on a wide screen. A built compact-TV reproduction fails its rail
assertion and captures that narrow layout. Appearance now uses the normal responsive family
shell and ScreenHeader rather than AdminPage: wide displays retain their rail and single clock,
three large side-by-side theme cards and a readable evening-comfort control; narrow viewports
retain stacked choices and the bottom dock. Layout follows available width, never adult authority.
Preference storage, automatic theme, dimming, private access and the legacy alias are unchanged.

`pnpm verify:code` passes formatting, lint, workspace types, **334 unit tests**, **143
API/integration tests**, 24 migration tests, eight owner-tool tests, deployment checks and production
web/server builds. Final test changes also pass scoped ESLint and `pnpm format:check`.
`pnpm verify:ci` passes five policy tests and complete/non-overlapping **983-test inventory**, not
full browser execution. `git diff --check` passes.

The final built-browser command is
`pnpm test:e2e:built tests/e2e/appearance.spec.ts tests/e2e/shell-clock.spec.ts
tests/e2e/phone-navigation.spec.ts tests/e2e/keyboard-layout.spec.ts
tests/e2e/screen-admin-isolation.spec.ts tests/e2e/native-tv-viewport.spec.ts --max-failures=0`,
with output outside Git. Final execution passes all **83 cases in 2.6 minutes**. The initial
new-viewport run passes 12/14 cases and detects a real transient light-theme contrast failure:
Appearance backgrounds fade while text changes immediately. The scoped card/background transition
is removed before repeating the complete code/browser gates; focus and switch transitions remain.
No accessibility assertion is suppressed or waived.

Fourteen new layout/interaction cases cover 1366×768, 1920×1080, 3840×2160, 320×700, 390×844,
844×390 and 820×1180 in light/dark at the built fictional demo `http://127.0.0.1:4320`. They check
the real content width, three same-row TV choices, at least 32-pixel logical choice titles, no TV
page scrolling, one visible clock and no phone dock on TV. Phone/tablet choices remain stacked
without horizontal overflow. Dark selection, persistence/reload, Automatic, dimming, D-pad movement
and Back to More are exercised alongside existing Back/focus restoration. Keyboard reachability
and rail-clock coverage now explicitly include Appearance. The paired-display test retains zero
adult-auth requests and no admin requirement; shared-screen exclusion/legacy alias tests remain.
Page identity, meaningful content, framework-overlay absence, console health and serious/critical
accessibility pass. Browser plugin unavailable; repository Playwright is used. Final compact-TV,
1080p-TV and phone screenshots are visually inspected: the wide screen has its normal rail and
large full-width choices, while the phone keeps its compact stacked controls. Screenshots use
fictional data and remain outside Git.

Physical TCL/remote and actual iPhone Safari confirmation, commit/push, hosted full-suite release
checks and private activation are **not run**. No APK, NAS network/configuration, household data,
credentials, pairings or provider integration changes are made. This is included in the same pending
local update as the screen/admin, phone-navigation and compact People-colour changes.

## Compact People colour disclosures — 2026-10-10

Every existing person and Add someone starts with a collapsed, 52-pixel Colour row showing the
current named swatch. Native `details`/`summary` reveals the existing twelve named radio choices
only when opened. Each form owns its own disclosure and colour draft; closing preserves the
selected value for Save. The preview and radios share one draft value, refreshed defaults do not
overwrite an active edit, and native form reset restores the default value and its preview.
No server/API contract, member capability, persistent preference or avatar behavior changes.

`pnpm --filter @hearth/web exec vitest run src/components/MemberColourPicker.test.tsx` passes
all **eight** tests, including closed form submission, independent people, legacy normalization,
reset and refreshed-default/draft consistency. `pnpm verify:code` passes format, lint, workspace
types, **334 unit tests** (35 shared, 35 core, 71 server, 193 web), **143 API/integration tests**,
24 migration tests, eight owner-tool tests, deployment checks and production web/server builds.
Final test changes also pass scoped ESLint and `pnpm format:check`. `pnpm verify:ci` passes five
policy tests and complete/non-overlapping **968-test inventory**, not full browser execution.

The built-browser final command is
`pnpm test:e2e:built tests/e2e/admin.spec.ts tests/e2e/keyboard-layout.spec.ts
tests/e2e/phone-navigation.spec.ts tests/e2e/screen-admin-isolation.spec.ts --max-failures=0`,
with logs/screenshots outside Git. Final execution passes all **103 cases in 2.9 minutes**.
An earlier People-focused run passes 13 of 14 cases; its remaining test waits for PUT instead of
the existing PATCH member-update receipt. That observer is corrected before the final run, not
hidden or waived. The initial format failure is likewise corrected and the full code gate repeated.

New compact/disclosure checks cover 320×700, 390×844, 844×390 and 1280×720 in light/dark at the
built fictional demo `http://127.0.0.1:4320`. They confirm closed palettes expose no radio controls,
opening one exposes twelve and leaves the others closed, selection updates the named preview,
closing restores the compact height, and there is no horizontal overflow. Native keyboard Enter,
Tab, radio-arrow selection, close, Save/PATCH acceptance and reload prove retained values. Add
someone retains its colour and starts collapsed when reloaded. Page identity, meaningful content,
framework-overlay absence, console health and serious/critical phone accessibility pass in the
final cases. Browser plugin unavailable; repository Playwright is used. Final phone light/dark
previews are inspected outside Git using fictional members: the closed row is compact, its named
swatch is clear, and profile-photo controls stay intact. `git diff --check` and scoped authoritative
document Prettier checks pass.

Commit/push, hosted full-suite release checks, private NAS activation and actual iPhone Safari
confirmation are **not run**. This is part of the pending local update with the screen/admin and
phone-navigation fixes; live household data, people, passkeys, pairings and networking are unchanged.

## Phone navigation scroll correction — 2026-10-10 (D-095 refinement)

The owner reports the bottom phone menu intermittently rising into the middle of the page while
scrolling. Both family and companion shells specify fixed `bottom: 0`, a fixed safe-area-aware
height and a competing `top: calc(100dvh - var(--phone-tabs-height))`. Replace that top calculation
with `top: auto`, leaving the browser one bottom anchor. Keep safe-area padding, trailing content
space, native zoom and the existing editing/keyboard-only visibility rule. No React scroll handler,
polling, household API, authentication change or native APK is needed for this refinement.

The new built-browser regression initially fails against the previous loaded stylesheet with
expected `auto` / received `calc(100dvh - var(--phone-tabs-height))`. This proves the conflicting
anchor, not reproduction of physical Safari's intermittent scrolling behavior. Test-harness
failures from short-page fixtures, ambiguous page/list headings and toggling already-open meal
details are corrected without hiding a test or lowering the scroll threshold. Real fictional
reminder records and seven expanded meal-detail controls ensure substantial scrolling on long
pages; Appearance covers the short-page shell too.

`pnpm verify:code` passes format, lint, workspace types, **329 unit tests**, **143 API/integration
tests**, 24 migration tests, eight owner-tool tests, deployment checks and production web/server
builds. The final test is linted and formatted with that gate. `pnpm verify:ci` checks five policy
tests and complete/non-overlapping **960-test inventory**, not full browser execution.

The final built-browser command is
`pnpm test:e2e:built tests/e2e/phone-navigation.spec.ts tests/e2e/appearance.spec.ts
tests/e2e/photos.spec.ts tests/e2e/weather.spec.ts tests/e2e/remote.spec.ts
tests/e2e/keyboard-layout.spec.ts tests/e2e/native-tv-viewport.spec.ts
tests/e2e/screen-admin-isolation.spec.ts --max-failures=0`, with temporary logs/screenshots outside
Git. Final execution passes all **105 cases in 3.0 minutes**, including all nine new navigation
cases with explicit mobile/touch emulation. The earlier viewport-only focused run separately
passes nine cases; it is not physical-device evidence.

The new tests use Chromium mobile/touch emulation against the built fictional demo at
`http://127.0.0.1:4320`. Profiles are 320×700, 390×844, 844×390 and 820×1180, in light/dark. Each
checks family Reminders, adult Meal planning and local Appearance at four heights and five scroll
positions, including return to the top. The navigation stays at the viewport bottom, last content
can scroll above it, and keyboard Enter on More opens the hub. A separate injected visual-viewport
test keeps navigation for a toolbar-sized reduction, hides it for focused keyboard-sized editing
and restores it without losing the draft. Page identity, meaningful content, no framework overlay,
console health and serious/critical phone accessibility are checked. Browser plugin unavailable;
repository Playwright is used. Desktop emulation and injected geometry are not real Safari toolbar
or iOS keyboard evidence. Final scrolled family/admin screenshots in light/dark are visually
inspected: navigation is docked at the bottom, content stays contained and the trailing records
remain above the menu. `git diff --check` and scoped authoritative-document Prettier checks pass.

Actual iPhone Safari/installed-web-app confirmation, commit/push, hosted release checks and live
activation are **not run**. NAS networking, credentials, data and pairings are unchanged. The
separate locally verified shared-screen/admin boundary remains preserved; both changes await
explicit private release approval.

## Shared-screen administration isolation — 2026-10-10 (D-099)

This is a local security fix on `codex/shared-screen-admin-boundary`, not a live release. The
separate unfinished draft in the primary checkout is reference-only and remains untouched.

- An isolated reproduction of the original boundary returns 401 for a screen credential alone,
  200 for an adult controller cookie, and **200** for mixed screen/adult cookies or Bearer+cookie.
  The fixed boundary returns **403** for mixed display requests and preserves **200** for the
  independent adult controller. Cases cover reversed cookie order, case-varied Bearer, empty and
  malformed display proofs, TV hints and all six first-use/authentication/recovery endpoints.
- A real migrated fixture confirms that private screen contact revokes only a retained legacy
  adult session: removing the display cookie afterward cannot restore that old session (401).
  A second phone session stays valid. Pairing still admits valid scoped family reads/commands;
  existing phones, passkeys, device records and household content are not reset.
- Deferred real-service authentication across pairing returns 403 before new session issuance.
  Browser context bindings reject another browser without consuming the genuine ceremony. Bounds,
  expiry and idempotent cleanup have deterministic regressions. Recovery/first-use commit guards
  and existing verified browser/WebAuthn controls remain covered by the complete API gate.
- All known admin routes, case/encoded/query/hash variants, restored URLs, reload and history are
  excluded before admin chrome/children mount. Calendar Sources, Lists/Meals management, More/System,
  private pairing shortcuts and missing Weather setup links are absent on paired screens. Empty
  Agenda/Week/Month asks an adult to connect calendars from their phone. Device-local Appearance,
  its legacy alias, keyboard/remote theme changes and chore completion/undo remain available.
- Independent read-only review reproduces two additional UI-state gaps: another open admin
  document retaining its old runtime after pairing, and cancelled in-flight exchange still setting
  a device cookie without access refresh. Added browser regressions verify accepted normal/cancelled
  exchange clears both documents to Today, with no admin chrome or passkey/recovery controls.
  Runtime context also wins over stale adult status in signed-out generic-screen entry.

`pnpm verify:code` passes format, lint, workspace types, **329 unit tests** (35 shared, 35 core,
71 server, 188 web), **143 API/integration tests**, 24 migration tests, eight owner-tool tests,
deployment checks and production builds. The focused API command
`pnpm --filter @hearth/server exec vitest run src/companion-auth.integration.test.ts
src/app.integration.test.ts src/companion-auth.browser.integration.test.ts
src/browser-access.unit.test.ts src/calendar-projection.integration.test.ts` passes **84** tests.
`pnpm verify:ci` passes five policy tests and complete/non-overlapping **951-test inventory**;
that is not execution of the full browser suite. `git diff --check` and authoritative-document
Prettier checks pass. No relevant test is hidden, skipped or waived in a passing final gate.

The built-browser final command is
`pnpm test:e2e:built tests/e2e/screen-admin-isolation.spec.ts tests/e2e/device-connection.spec.ts
tests/e2e/runtime.spec.ts tests/e2e/planning.spec.ts tests/e2e/calendar.spec.ts
tests/e2e/weather.spec.ts tests/e2e/remote.spec.ts tests/e2e/keyboard-layout.spec.ts
tests/e2e/appearance.spec.ts tests/e2e/photos.spec.ts tests/e2e/admin.spec.ts --max-failures=0`,
with temporary output outside Git. Final execution passes all **233 tests** in **5.6 minutes**,
including all 11 isolation cases. Earlier broad failures from ambiguous status
selectors and a stale Appearance fixture/extra status read are corrected and are not counted as
passing final evidence. Type/Node-storage fixture failures are likewise corrected before repeating
the full code gate.

Browser plugin unavailable; repository Playwright is used against the built fictional demo at
`127.0.0.1:4320`, with separate real-service API/WebAuthn fixtures. Screen profiles include 390×844,
820×1180, 1920×1080 and 3840×2160. Loaded family surfaces, no admin links, meaningful content,
correct Hearth identity, no framework overlay, console health, serious/critical accessibility and
keyboard interactions are checked. Loading placeholders are not screenshot proof. Final loaded
More screenshots are inspected at TV and narrow-tablet sizes outside Git; they show only Family
and device-local Appearance destinations. Empty-calendar screenshots and assertions prove the
adult-phone guidance and removed Sources shortcut, not unrelated Month overflow/layout acceptance.
None contains private household data.

Physical TCL/iPhone Safari proof, commit/push, hosted full-suite/image publication and live
activation are **not run** for this change. The NAS and its private networking/data/secrets are
unchanged. Release requires explicit approval and the existing exact-commit verified-image path.
Generic unpaired browsers are not permanently hardware-attested: adult access still requires
verified personal passkeys and server capabilities. Television hints can only restrict authority.

## Approved combined display release — 2026-10-09

The owner explicitly approved commit, push and private deployment of D-098 and the D-077 weather
refinement. Application release `5fffd5eca9e868bfacc8d06fba717782dee68513` is pushed to `main` and
`codex/tv-fit-wordmark` and activated on the existing private Synology. The following evidence
supersedes the release-not-run status of the earlier local checkpoints below, not their open
physical-device acceptance gates.

- [Verify Hearth run 37938465472](https://github.com/davidjpramsay/hearth-v2/actions/runs/37938465472)
  succeeds for that exact commit: dependency audit has no known vulnerabilities; format, lint,
  workspace types, 321 unit tests, 140 API/integration tests, 24 migration tests, eight owner-tool
  tests, deployment checks and production builds pass. Five CI policy tests and complete inventory
  coverage pass. All four built-browser shards pass 235 tests each: **940 passed**, no failing,
  flaky or unrun tests. Android TV test/lint/build, both image builds, eight isolated privileged
  release-safety tests and verified image publication also pass.
- The local `pnpm verify` run completes its code and CI gates. Its duplicate full browser execution
  is deliberately interrupted after the exact hosted suite succeeds: 368 passed, one interrupted,
  571 not run, exit 130. It is **not** counted as a passing local full-suite execution. The prior
  final-build 83 focused checks remain separate local evidence.
- `sh /tmp/hearth-stage-preserving-runtime-20261009.sh
5fffd5eca9e868bfacc8d06fba717782dee68513` stages the exact archive with the complete commissioned
  runtime excluded. `ssh -o BatchMode=yes hearth-synology 'sudo -n
/usr/local/sbin/hearth-v2-activate-staged'` exits zero after verified image pull, protected
  stopped-database recovery snapshot, replacement, bridge/DNS verification and readiness.
  Commissioned runtime Compose and environment SHA-256 values are identical before and after.
  Root-owned Compose/network configuration, external household data/photos/secrets, credentials
  and pairings are not replaced or reset. No installer, public exposure or APK rebuild is needed.
- External `/api/v1/readiness`, `/api/v1/runtime` and `/api/v1/health` return HTTP 200 in private
  mode. Health reports the exact application commit and SQLite readiness. Unauthenticated runtime
  correctly withholds household data and reports `requiresSetup: false`. A transient HTTP 502
  observed during container replacement clears; the final private origin is healthy.
- Downloading this run's `browser-build` artifact with `gh run download 37938465472 --name
browser-build` and comparing it with the served files using `cmp` confirms byte-identical HTML,
  entry JavaScript/CSS, Photos JavaScript/CSS and Weather JavaScript/CSS. This checks the actual
  deployed frontend rather than only server version or image availability.
- Playwright CLI reloads the live private `/admin` page at 390×844: Hearth title, meaningful sign-in
  content, no framework overlay, zero console warnings/errors, visible Tab movement from adult
  sign-in to shared-screen connection, and a visually inspected contained screenshot pass. No
  authentication ceremony or pairing request is initiated. Browser plugin unavailable; CLI is used.

Actual TCL display/remote and actual iPhone Safari acceptance of these new layouts remain **not
run**. `adb connect` to the previously approved TV endpoint returns `No route to host`; no network
configuration is changed to bypass it. The existing shell receives the web release through its
normal release detection/reload path. The owner should open Weather and fullscreen Photos on the
TV, and refresh Hearth on the phone, to confirm the physical rendering. This evidence-only follow-up
does not change application code or require another container activation.

## Rail focus and compact ambient clock — 2026-10-09 (D-098)

- Side-menu keyboard/D-pad focus uses an inset outline and stays inside the row without a clipped
  outer glow or focus-induced enlargement. Other screen controls keep their existing focus treatment.
- Fullscreen photos retain native-ratio `contain` display without a viewport-wide focus frame.
  The content-width clock/date/Back control is the single keyboard and screen-reader exit target;
  the transparent full-image click target has no outline and is outside Tab/accessibility order.
- Any remote key, Back, the visible return control or a photo-area click exits immediately and
  restores Start ambient focus. The return control exposes the shared time/date as its accessible
  description. Phone portrait/landscape and television layouts keep the control contained.

The local `pnpm verify:code` gate passes format, lint, workspace types, 321 unit tests, 140
API/integration tests, 24 migration tests, eight owner-tool tests, deployment checks and production
builds, retaining the pending fixed-day weather changes. `pnpm verify:ci` passes five policy tests
and unchanged complete/non-overlapping 940-test inventory coverage, not the complete execution.
`pnpm test:e2e:built tests/e2e/photos.spec.ts tests/e2e/shell-clock.spec.ts tests/e2e/appearance.spec.ts
tests/e2e/weather.spec.ts tests/e2e/keyboard-layout.spec.ts tests/e2e/remote.spec.ts --max-failures=0`
passes all 83 checks (2.5 minutes). Coverage includes inset rail focus across household routes,
ambient entry/exit and restored focus, pointer dismissal, bounded clock backgrounds on five
viewports, TV/phone ambient accessibility, light/dark, reduced motion, cached/corrupt photos and
the pending weather graph regressions. No native APK change is needed for these web styles.

CLI inspection at `127.0.0.1:4326` follows keyboard-only Weather rail focus → Photos → ambient
entry. Rail focus is fully contained, stationary and inset. The clock control measures about
323 logical pixels on TV and 212 on phone, rather than spanning the viewport; 4K retains uniform
application scaling. Six viewports (320×700, 390×844, 844×390, 1366×768, 1920×1080 and 3840×2160)
keep the caption and text contained with no full-image outline/shadow. Correct page identity,
meaningful content, no framework overlay and zero console warnings/errors pass. TV menu, TV ambient
and phone ambient screenshots are visually inspected outside Git.

Owner-supplied HEIC references are inspected through temporary JPEG copies outside the repository;
the Photos library originals are unchanged and never uploaded into Hearth. All rendered automated
checks use fictional local demo assets, not private household photos. Browser plugin unavailable;
repository Playwright and CLI are used. At this local checkpoint physical TCL/iPhone verification,
full hosted release, commit/push and live deployment were **not run**; private NAS, networking,
content and pairings were unchanged. See the approved release evidence above for subsequent status.

## Fixed weather day and proportional graph — 2026-10-09 (D-077 refinement)

- The day axis always runs from household-local midnight through the following midnight, not from
  the current hour. The server returns at most 25 points within the unchanged shared schema.
- A filled dot follows the existing shared minute clock on the forecast curve. Deliberate hour
  inspection has a separate hollow marker and survives clock ticks/reads. **Now** or remote Select
  returns to following; a fresh day resets even an inspection of the old midnight endpoint.
- Missing samples remain gaps; an old cached day is marked stale and receives no live dot.
- Plot geometry uses measured logical width and height, observes the HTML canvas, and falls back
  to window resize when ResizeObserver is absent. Phone controls do not cover the graph; the whole
  day is visible without horizontal scrolling. Existing uniform 4K application scaling is retained.

`pnpm verify:code` passes format, lint, workspace types, 321 unit tests (34 shared, 35 core, 67 server,
185 web), 140 API/integration tests, 24 migration tests, eight owner-tool tests, deployment checks
and production builds. The new regressions cover day bounds at midnight/noon/late evening,
timezone conversion, clock progression, inspection, rollover, observer ownership and missing hours.
Initial test-harness failures (cleanup, hidden desktop controls and types) are corrected and the
entire gate is repeated; those failed runs are not passing evidence. `pnpm verify:ci` passes five
policy tests and the unchanged complete/non-overlapping 940-test inventory, not its execution.

Built-browser verification uses `pnpm test:e2e:built tests/e2e/weather.spec.ts
tests/e2e/calendar-weather-settings.spec.ts tests/e2e/remote.spec.ts tests/e2e/shell-clock.spec.ts
tests/e2e/keyboard-layout.spec.ts --max-failures=0` passes all 45 checks on the final build (1.3
minutes), including remote Select/Now, modes, boundaries, stale weather and accessibility.
Local CLI rendering at `127.0.0.1:4326/weather`
uses only fictional demo data: 320×700, 390×844, 844×390, 820×1180, 1180×820, 1366×768, 1920×1080
and 3840×2160 are contained. The dot remains 12×12 logical pixels, uniformly 24×24 on 4K, and
television content remains one-screen. An initial 4K geometry assertion incorrectly compares
physical transformed bounds with logical SVG coordinates; the corrected check compares client
dimensions and independently checks equal dot dimensions. Final phone, TV and compact dark TV
screenshots are visually inspected outside Git. Page identity, meaningful content, absence of an
error overlay and zero console warnings/errors pass; phone hour inspection and Now restoration
retain the separate live dot. Browser plugin unavailable; repository Playwright and CLI are used.

At this local checkpoint no private household, authentication, calendar, TV pairing, NAS configuration
or network state was changed. Full 940-test execution, hosted images, commit/push, live deployment,
physical iPhone Safari and physical TCL weather acceptance were **not run**. See the approved release
evidence above for subsequent status; actual Safari/TCL acceptance remains open.

## Compact phone setup and NAS-owner repair (D-097) — 2026-10-09

- Compact named adults and connected screens replace recovery warnings and technical key inventories.
  Key/recovery controls remain under Advanced. A protected final key has a visible explanation,
  not an inert Remove button.
- Explicit setup verifies the new key and current administrator authority, preserves permissions,
  atomically replaces only the initiating browser session and clears its old private caches.
  Omitted/false intent retains legacy behavior; tokens remain cookie-only.
- Local owner recovery requires OS administrator authority, existing database access, a checked
  private online backup and an exact active adult. Grants are 128-bit, digest-only, 15-minute and
  one-time. Issuance touches no key/session; public recovery still requires a verified new passkey.
  No public owner bypass, household reset or networking change is permitted.
- Obsolete-screen cleanup preserves the chosen TV, history and system audit. Invalid/foreign/retained
  targets reject atomically and repeats are inert.

Eight operator tests pass locally and on DSM Python 3.8. Live cleanup creates a checked private
online backup, revokes exactly three owner-confirmed old browser connections and reads back one
active native Google TV paired 2026-10-08, with three system audits. Adult keys/sessions/permissions,
content and networking are unchanged. New UI release and David/Rachael's independent physical
sign-ins are not proved by this metadata-only checkpoint.

Local release checks: `pnpm verify:code` passes formatting, lint, types, 302 unit tests, 140
API/integration tests, 24 migration tests, eight owner-tool tests, deployment checks and production
builds. The operator-issued fixture is consumed through normal verified recovery, cannot replay,
and leaves the other adult's session active. The optional phone-setup path passes session-isolation,
cookie-only transport, legacy behavior and revoked/demoted/archived commit-time rejection tests.
`pnpm verify:ci` passes five policy tests and complete non-overlapping 940-test inventory coverage;
`pnpm audit:dependencies` reports no known vulnerabilities. `git diff --check` passes.

`pnpm test:e2e:built tests/e2e/device-connection.spec.ts tests/e2e/admin.spec.ts tests/e2e/runtime.spec.ts`
passes all 75 browser checks (2.4 minutes), including phone/TV/4K light/dark layouts, accessibility,
private entry, confirmation/cancel, lost-reply retry, history and keyboard/D-pad. Earlier runs stop
on obsolete text selectors and a clipboard action now intentionally hidden under address help;
they are failed runs, not release evidence. The repeated run opens that help and checks its actual
fallback, without weakening the assertion. The CLI captures fictional two-adult/one-TV renders at
393×852, 844×390 and 1920×1080, verifies page identity, containment and zero console warnings/errors,
and exercises named-adult setup selection plus keyboard movement. Screenshots stay outside Git.
Browser plugin unavailable; repository Playwright and its CLI are used. Hosted verification,
publication, exact live activation and actual iPhone Safari sign-ins remain separate gates.

Live release checkpoint: canonical application commit `7a20a2ef65e723053353b042641fdc9ba6452968`
passes hosted Verify Hearth run `37894968640`, including all 940 browser tests, Android, containers
and verified image publication. Exact server/web images are activated on the private NAS; external
readiness/health return ready/private with the expected version and migration 27. A premature
activation is rejected before restarting anything because staging is unfinished; staging subsequently
completes and the guarded retry succeeds. A transient 502 during the deliberate container replacement
is recorded, not treated as a persistent outage. Commissioned runtime Compose and the installed
release/firewall/update-hook hashes remain unchanged. One active native Google TV remains.

The owner then explicitly requests **reset all passkey sign-ins** after reporting that no saved key
is recognised. A separately tested, exact-household NAS-owner transaction takes a checked private
backup, revokes one remaining active passkey, one phone session and one unused recovery code, and
atomically issues a fresh digest-only recovery grant for David. It retains all credential/audit
history, both adult accounts, household content and the chosen TV. Readback proves zero active
passkeys, zero phone sessions, two adult accounts and one active screen; health remains ready.
The reset fixture passes locally and on DSM, including changed-key rejection/rollback, unrelated
household isolation, retained TV/content, recovery and system audit. This is a data-maintenance
operation, not another application deployment or authentication disablement. New Face ID/passkey
enrolment and independent sign-in for David and Rachael remain **not run**. A prepared private code
handoff requires the owner to open it; native Finder/TextEdit automation fails and Terminal control
is unavailable, so code visibility is not claimed. No recovery code or credential is put in chat.

## Adult controllers and shared-screen clarity (D-096) — 2026-10-09

`pnpm verify:code` passes formatting, lint, type checks, 301 unit tests (including ten new controller
access tests), 137 API/integration tests, 24 migration tests, deployment scaffolding and production
builds. `pnpm verify:ci` passes five policy tests and preserves all 940 browser tests in four
non-overlapping shards. `pnpm audit:dependencies` reports no known vulnerabilities; authoritative
document formatting and `git diff --check` pass.

The initial broader 265-test browser run stops after one connection-flow failure: after connecting
and then disconnecting a screen, both old and new success messages remain. It records 256 passes
and eight unrun tests, not a passing gate. Clear completed approval feedback after disconnection,
clear completed disconnection feedback before a new approval, and clear the accepted code; retain
immutable command identities for unanswered requests. The repeated command
`pnpm test:e2e:built tests/e2e/device-connection.spec.ts tests/e2e/admin.spec.ts tests/e2e/runtime.spec.ts`
passes all 75 tests, including the failed flow, role guidance, history, confirmation/cancel, expired
codes, exact lost-reply retries, private access boundaries and keyboard/D-pad checks.

Local fictional-data rendering at 393×852, 844×390 and 1920×1080 shows readable entry/hub/access
screens. The browser suite also covers 320×700, 390×844, 820×1180 and 3840×2160, light/dark modes and
accessibility. CLI inspection verifies page identity, meaningful content, no framework overlay,
horizontal containment and zero console errors/warnings. Manage adult sign-in → Adult access →
Back, confirmed demo-screen disconnection, collapsed/expanded inert history and Enter to collapse
are exercised. Browser plugin unavailable; repository Playwright and its installed CLI are used.
Screenshots contain fictional data only, remain outside Git and do not prove iPhone Safari.

Live cleanup is blocked on authenticated UI access while the owner's Mac is locked. No live screen,
passkey, session, permission, household record, networking or NAS configuration is changed.
David's and Rachael's physical passkey enrolment/sign-in and controller permissions remain open;
identify exact obsolete active-screen targets before revoking them. Publication/deployment and
full hosted verification of this new revision remain separate release gates.

## Phone fit and bottom navigation (D-095)

- Long phone dates and event titles remain inside the viewport, including narrow and zoomed layouts.
- Last content can scroll above the full navigation/home-indicator area. Browser-toolbar resizing
  retains accessible navigation; focused editing with a keyboard-sized visual-viewport reduction
  hides the bar and dismissal restores it without changing the draft or zoom.
- Physical iPhone acceptance covers Safari toolbar expansion/collapse, keyboard dismissal, native
  date controls and an installed home-screen web app. Desktop emulation cannot close these gates.

Local checkpoint on 2026-10-09: web type checking, scoped ESLint, production build and
`git diff --check` pass. Chromium mobile
rendering at 393×852, 393×650, 320×700 and 844×390 shows no horizontal document overflow; a long sample
date/title remains contained and the bar follows viewport height. Today → More → Reminders opens
the form. Injecting a 360-pixel visual viewport while its text input is focused hides navigation;
restoring the actual viewport restores it. This is simulated geometry, not an iOS keyboard run.
The built preview also renders at 1920×1080 with the TV rail visible and phone tabs hidden. At the
end of the 393×852 page, the photo bottom is 740 and navigation top 780, leaving content accessible.
Inspected screenshots show the intended layouts; page identity, meaningful content and console
checks pass with no framework overlay or errors. Screenshots and CLI artifacts stay outside Git.
Browser plugin unavailable; the installed Playwright CLI is used with fictional local demo data.
Unit/browser suites, physical Safari and live NAS deployment were unrun at this initial checkpoint.

## Foreground TV display retention (D-094)

- While Hearth is resumed, its window requests screen retention; pausing releases that request.
- Normal system screensaver settings, manual standby and independent media playback are preserved.

Physical TCL checkpoint on 2026-10-09: `assembleDebug` succeeds and the APK signing certificate
matches the prior installed package. `adb install -r` succeeds without re-pairing; installed/local
APK SHA-256 matches `91999a1994ce543dd8de1ea3ab2af3a44a31679d799b2be1c2ed70bd83790fd2`.
The paired Today screen is visually inspected. Window readback shows `KEEP_SCREEN_ON` while Hearth
is foregrounded, no flag after Home, and the flag restored after returning to Hearth. Jellyfin's
existing process remains active and playing with its three-item queue. The ten-minute system
timeout and enabled screensaver remain unchanged. `git diff --check` passes. Unit/browser suites,
an unattended full idle interval and overnight/manual-standby acceptance are not run for this change.
Screenshots remain temporary private evidence, outside Git. At this initial checkpoint the TV APK
is installed, source is local, and no NAS/web release or network change is made.

## Reviewed TV/phone release preparation — 2026-10-09

Review retains the prepared foreground window flag and responsive phone changes. It adds 21
deterministic keyboard-hook tests covering editing focus, textarea/content-editable controls,
non-keyboard inputs, toolbar-sized changes, the 150-pixel threshold, zoom, layout-height changes,
companion breakpoints, unavailable VisualViewport, event coalescing and subscription/frame cleanup.
An initial jsdom run exposes an undefined content-editable predicate; requiring an explicit `true`
keeps the result boolean and the repeated hook suite passes. No draft value is read by the hook.
The older roadmap and overnight-static-display assertion are aligned with the explicitly approved
foreground choice rather than silently contradicting D-094.

`pnpm verify` passes format, lint, types, 291 unit, 137 API/integration and 24 migration tests,
deployment checks, production builds, five CI-policy tests, complete non-overlapping browser shard
coverage, and all 940 built-browser tests (20.2 minutes). `pnpm audit:dependencies` reports no known
vulnerabilities. `pnpm verify:tv` passes 14 JVM tests, Debug/Release lint and both APK builds.
The rebuilt debug APK still has the exact previously physically verified SHA-256 above, so no
reinstallation is needed. `git diff --check` and scoped authoritative-document formatting pass.

An isolated built preview at `127.0.0.1:4324`, using its own fictional demo API/database at port
4314, passes rendered inspection at 393×852, 393×650, 320×700, 844×390 and 1920×1080. A deliberately
long visible date wraps to two lines at 320 pixels and a long event title remains inside its card.
Today → More → Reminders, simulated keyboard hide/dismissal and draft retention pass, with no page
or console errors. After scrolling, the final reminder ends at 723.22 pixels above navigation at
780 pixels. The TV layout remains one-screen with its rail visible and phone tabs hidden. Browser
plugin unavailable; Playwright CLI and repository tests are used. Temporary screenshots contain
fictional data only and are not committed.

Hosted container verification/publication and private Synology activation remain separate steps;
local success does not authorize an unverified image or replacement of commissioned networking.
Physical iPhone Safari toolbar, real keyboard/date controls and home-screen-web-app checks remain
unverified, as do a full unattended TV idle interval and overnight/manual-standby recovery.

## Family Games acceptance

- Validate the owner's complete supplied archive without copying it into source, fixtures or images.
- Sixteen tiles form four groups; allow four misses, report three-of-four, and do not penalize an
  identical repeated guess. Correct groups lock; terminal states reveal results and allow replay.
- Shuffle preserves selections/identity. Archive number/date search, pages and earlier/later work.
- Progress survives reload and puzzle switching on the same device; malformed/blocked storage
  remains playable. Another household or changed board cannot inherit that progress.
- The requested v1-only reset starts at #1 without changing unrelated storage. Persisted completions
  appear in ascending Archive, survive replay/attempt eviction, and resume the earliest uncompleted
  puzzle on a later visit. A win stays visible until **Next puzzle** or replay is chosen.
- Private reads require the existing household passkey/display authority; failed imports expose no
  source paths and cannot slow startup, reveal household data or take down other modules.
- Test mobile, tablet, 1080p/4K, light/dark, keyboard/D-pad/Back, focus restoration and accessibility.
- Live NAS data installation, signing/physical-device checks and automatic daily archive updates
  are not established by local browser tests.

Games evidence as of 2026-10-06: `pnpm verify:code` passes format, lint, types, 267 unit,
137 integration/API and 24 migration tests, deployment validation and production builds.
`pnpm verify:tv` passes unit tests, Debug/Release lint and both APK builds. `pnpm verify:ci`
proves complete, non-overlapping coverage of the 933-test inventory; it does not run those tests.
`pnpm test:e2e:built tests/e2e/games.spec.ts tests/e2e/games-remote.spec.ts tests/e2e/remote.spec.ts tests/e2e/appearance.spec.ts tests/e2e/keyboard-layout.spec.ts --max-failures=0`
passes 73 tests. This covers light/dark phone portrait/landscape, tablet, short TV, 1080p/4K,
page/console health, serious/critical accessibility, a fully remote-only solve/Back flow,
archive pagination/search, focus, storage failures, loaded-board offline play, guesses and reloads.
The Desktop archive independently passes the production parser for all 1,213 puzzles; an isolated
local browser also checks the actual newest/oldest boards and a correct imported group.
Only original demo content is used in screenshots and committed tests. The Browser plugin is not
available; the repository Playwright workflow is used. `git diff --check` passes. The full 933-test
suite, container image rebuild and physical hardware are not run for this addition. No puzzle data
is committed/published or installed on the live NAS, and this feature is not pushed or deployed.

Progression/reset refinement on 2026-10-06: `pnpm verify:code` passes format, lint, types,
270 unit, 137 integration/API and 24 migration tests, deployment validation and production builds.
`pnpm verify:ci` proves the updated 935-test inventory is completely and uniquely sharded; the
full inventory is not executed for this refinement. The built browser command
`pnpm test:e2e:built tests/e2e/games.spec.ts tests/e2e/games-remote.spec.ts tests/e2e/games-progression.spec.ts tests/e2e/appearance.spec.ts --max-failures=0`
passes 40 tests, including the scoped legacy reset, completion/replay/resume, phone archive
containment and remote-only solve/Back. Phone completion badges are visually inspected using
original demo content. The supplied 1,213-puzzle archive also passes an isolated browser check of
the first-puzzle default, newest archive selection, actual puzzle completion and next-puzzle resume,
with no page errors. That standalone check initially read a previous board before navigation had
settled; waiting for the selected number and expected tile count fixes the test synchronization.
Physical devices and live NAS deployment are not run for this refinement.

Owner-approved release preparation on 2026-10-08: the current preserved Games work passes
`pnpm verify:code` (270 unit, 137 API/integration and 24 migration tests plus format, lint, types,
deployment validation and production builds), `pnpm verify:tv`, and `pnpm verify:ci` (935 distinct
browser tests in four non-overlapping shards). The built browser command covering Games,
Games remote/progression, Appearance, production bootstrap, Remote and keyboard layout passes
79 tests in 2.3 minutes. TV light and phone dark demo screenshots are visually inspected; the
1,213-puzzle private archive independently passes first-puzzle, archive selection, completion and
next-puzzle checks. Today's dependency audit initially rejects sharp 0.35.4; the narrow 0.35.5
patch passes the repeated code gate and `pnpm audit:dependencies` reports no known vulnerabilities.
Hosted verification, image publication, private archive installation and physical TCL acceptance
remain pending at this source checkpoint. The archive is excluded from Git and public images.

The first hosted Games candidate is correctly blocked by the existing rail-clock geometry test:
the scrollable navigation's negative top margin extends four pixels into the clock box. This is
reproduced locally, corrected by keeping only horizontal/bottom negative margins, and the same
clock check now includes Weather, Reminders and Games. The rebuilt focused Games, remote,
production-bootstrap and shell-clock suite passes 26 tests in 44.9 seconds. Failed candidate
`ae3c1e5` publishes no images and the on-host verification guard starts no live installation.

Owner-approved live release checkpoint on 2026-10-08: hosted run `37755078289` passes all jobs,
including all 935 browser tests and publication of the exact `7cfd04d` images. The protected Synology
helper activates that release; external readiness/health pass in private mode. The owner's archive
is installed only in private data. Authenticated readback from the paired physical TCL returns
`ready`, `household-archive` and 1,213 puzzles with no-store caching. The stopped-database recovery
guard passes; the effective network identity, existing DNS/firewall helper and unrelated containers
are unchanged. Installer preflight mistakes stop before replacing the running release and are
corrected/tested; these stopped attempts are not successful deployments.

TV-shell repair checkpoint on 2026-10-08 (D-093): `pnpm verify:tv` passes 14 JVM tests, both lint
variants (zero errors) and Debug/minified Release builds. `pnpm build`, `pnpm format:check`,
`pnpm lint`, `pnpm verify:ci` and `git diff --check` pass; CI inventory covers 940 tests, not a full
940-test execution. The focused built-browser command for `native-tv-viewport`,
`production-bootstrap`, `games-remote` and `shell-clock` passes 13 tests. Its four new behavior cases exercise
the exact Kotlin script under strict CSP, with the server sizing script disabled, at density-two
1080p/4K, plus missing-meta/idempotent fallback and subframe exclusion; another check asserts
the 320×180 banner, 160×160 icon PNGs and manifest mapping. Browser plugin unavailable;
repository Playwright used. Phone shell-clock and normal-browser startup remain covered.

The repaired matching debug APK is installed with `adb install -r` on the physical Android 12 TCL
without re-pairing. New-process launch and fresh reload report 1920×1080, DPR 2, scale 0.5 and the
native marker. Today/Games are contained, the TV rail is visible, phone tabs absent, and a reload
reports zero page/console/log errors. Actual D-pad events reach Games from Today, select/deselect
tiles, and close Archive with Back to its opener; no guess or household mutation is submitted.
Screenshots are inspected locally and kept out of Git because they contain private household or
supplied archive content. Both installed icon/banner resources resolve to the new bounded
wordmarks, and the isolated banner render is inspected. Final launcher-cache display confirmation
is pending while the household uses other TV apps. Overnight standby, forced network loss, APK
release signing/distribution and complete physical-TV commissioning remain not run.

Launcher identity correction on 2026-10-08 retains the original transparent Hearth fern to the
left of the wordmark in both bounded resources. Native composition tints it cream; the original
mark and web branding remain unchanged. `node apps/tv/design/render-launcher.mjs --check` verifies
both committed PNGs against their native source composition. The same focused browser command
passes 13 tests, now also asserting visible fern pixels, both source references and exact
source/raster agreement; an initial assertion incorrectly compared scaled icon area with width,
then passes after correction to an area-proportional threshold. `pnpm verify:tv` passes the 14
JVM tests, Debug/Release lint and both builds; format, lint and `git diff --check` pass. Both
isolated renders are visually inspected. `adb install -r` succeeds without changing pairing;
APK resource readback confirms the xhdpi icon and banner mapping. A read-only physical screenshot
still shows the old launcher artwork while its settings panel is open. Launcher display refresh
is not proved, and no launcher settings, data or foreground navigation are changed to force it.

## Per-change definition of done

A change is complete only when:

- behaviour and out-of-scope boundaries are clear
- contracts and migrations are documented
- relevant automated tests pass
- typecheck, lint and production build pass
- changed UI is rendered and inspected at relevant viewports
- D-pad/keyboard-only navigation is exercised for changed television surfaces
- loading, empty, stale, offline and error behaviour is considered
- no secrets or private provider payloads appear in source, bundle or logs
- authoritative documents are updated when a contract or decision changed
- the handoff names exact passed, failed, blocked and not-run checks

## Product acceptance scenarios

### Launch and navigation

- The native TV shell retains its 1920×1080 logical canvas at density two after cold launch,
  reload and route restoration even when the server sizing script is unavailable. Phone tabs stay
  absent, the TV rail remains accessible, and the script never marks/resizes subframes.
- The physical launcher displays a legible Hearth wordmark in a correctly proportioned tile;
  installing a repair preserves pairing and local preferences.
- Cold launch reaches useful cached/current Today content within the product performance target.
- Resume after overnight television standby restores Hearth without manual process recovery.
- Every primary screen is reachable with D-pad and Back.
- Focus never disappears, becomes trapped or lands behind an overlay.
- Every current household and admin route remains horizontally contained at television, tablet and
  phone sizes across both themes; household television routes retain a visible D-pad focus target
  and admin forms retain ordinary keyboard focus.
- At desktop widths, administration presents a persistent settings rail and a wider content canvas;
  at phone widths the rail is absent and the existing bottom navigation remains available.
- At 820×1180 and 1180×820, household routes use companion navigation instead of the television rail;
  portrait Admin keeps the compact flow and landscape Admin uses the persistent settings rail.
- Resuming Hearth after normal Google TV app switching restores the previous Hearth screen or a documented safe default.
- Demo/test dates are deterministic, while private mode derives today, Monday
  week start and current month from the configured household timezone.
- A new private database contains no fictional household or planning records,
  exposes an explicit setup-required launch state and does not enable demo
  reset/scenario commands.

### Calendar

- Events from multiple enabled calendars retain correct owner/source cues.
- Month fits one television viewport, shows readable colour-coded event titles plus deterministic overflow inside date cells, and identifies each colour through a separate avatar/label key. On phone, focusing or selecting a date exposes every title in a companion agenda beneath the compact grid.
- Month is reachable below Week with D-pad navigation; Back restores Week and the prior rail focus, while the phone exposes a Week/Month switch.
- Calendar opens Agenda by default, with Agenda, Week and Month tabs in that order on TV and phone.
- Week, Month and Agenda are views beneath one Calendar primary destination on
  television and phone. Every view is reachable with D-pad/keyboard-only input;
  legacy Week/Month links redirect without losing scenario/date query state.
- Agenda shows exactly four household-local dates—today plus the next three days—with no past,
  fifth-day-or-later content or period navigation.
- Earlier, current-period and later controls issue the requested week/month
  query, and Calendar source setup is directly discoverable without searching
  the general settings list.
- Empty weeks retain date navigation on television and phone. Multi-day cards have unique
  per-date focus targets, and the last card can move down to week navigation.
- Selecting an Agenda/Week event exposes its available time, source/person and
  location in a family-readable detail surface; Back closes it and restores the
  exact event focus.
- All-day events appear on the correct Perth local dates.
- Week keeps all-day cards in an aligned band above the hourly timeline. Simultaneous timed cards,
  including collisions created by their minimum readable height, render in separate deterministic
  lanes and remain individually selectable with D-pad/keyboard input, directly or through `+N more`.
- Week expands its shared clock axis for off-hours plans without painting cards outside the grid.
  It caps all-day rows and simultaneous timed lanes at two, and overflow opens the full day list.
  The list retains all events offline, traps Tab focus, and restores the exact row/opener on Back.
- Overnight plans use household-local daily segments and continuation labels. Midnight-exclusive
  endings do not repeat on the following day, and details show both dates/times where needed.
- Events created in a daylight-saving region display at the correct Perth time.
- Recurrence exceptions and cancellations do not resurrect.
- An unavailable provider leaves cached events visible and clearly marked stale.
- Today, Week and Month fetch on entry, refresh every five visible minutes and
  refresh immediately after browser reconnect or calendar settings changes.
  A failed refresh retains the last successful event data while showing the
  provider's stale/unavailable state.
- A write conflict is explained and never silently overwrites the provider.
- An adult can test a private HTTPS CalDAV account, select exact calendars,
  assign optional people, save, reload and remove the connection from the phone
  companion. Passwords and raw collection URLs never appear in responses,
  SQLite, screenshots or logs; child and unauthenticated setup are rejected.
- Every connected source permanently shows calendar name, assigned person and
  display colour. Reassigning a source updates Week/Month owner identity and
  member-derived colour without reconnecting or re-entering the CalDAV password;
  Whole family uses the family presentation.
- An adult can add or remove selected calendars from an existing connection by
  using **Edit calendars**. Hearth rediscovers the account with the server-side
  credential and never returns or requests that credential in the browser; the
  revised exact allowlist survives reload and restart.
- An adult can search a suburb/postcode or use the phone's one-time location,
  inspect the resolved label and advanced coordinates, test current conditions,
  and save the location separately from timezone. The saved location survives
  restart and takes precedence over environment fallback coordinates.
- With a tested weather location configured, Today shows current local conditions and
  Week shows normalized daily forecasts without provider branding on household-facing dashboards.
  Provider attribution remains visible in adult Weather settings. Coordinates never enter
  TV/forecast responses or logs. A provider outage retains the last safe forecast and a first-load
  failure leaves calendar and household content usable with an unavailable weather cue.

### Weather

- Weather appears immediately after Calendar in television and phone navigation.
- Current conditions include temperature, apparent temperature, today's low/high, condition, rain
  likelihood and wind. The forecast response exposes a family-readable location but no coordinates.
- The 24-hour graph switches between Temperature, Rain and Wind. D-pad Left/Right changes the
  selected hour and Up/Down changes mode; the same modes and hour controls are touch-operable on a
  phone.
- Temperature distinguishes actual and apparent values, Rain combines probability with the selected
  hour's expected millimetres, and Wind distinguishes sustained speed and gusts with direction.
- Seven daily rows use one common temperature scale and Today marks the current temperature.
  Each row shows daily maximum wind speed in km/h and prevailing direction, with calm and missing
  data distinguished. Wind remains readable on a phone without horizontal overflow.
  Calendar Week shows compact icon/rain/low-high summaries without temperature bars or empty-day
  dashes. Calendar event surfaces remain opaque in both themes.
- A failed refresh retains the last successful forecast with a quiet stale cue. With no configured
  or cached forecast, Weather offers the household settings path without breaking Today or Calendar.
- The Weather screen has no page-level horizontal overflow at 1920x1080 or 390x844, passes serious
  and critical automated accessibility checks, and is inspected in both colour schemes.

Phase 3 evidence as of 2026-08-03: the first five read/degraded-mode scenarios
are automated against the fake adapter, SQLite cache and rendered Today/Week/Month
surfaces. The selected CalDAV/iCloud adapter additionally has contract coverage
for exact allowlisting, HTTPS-only configuration, bounded recurrence expansion,
all-day projection, authentication failure, malformed payload recovery and the
persisted Today query. A credentialed iCloud read remains intentionally not run
until the owner supplies an external app-specific credential and calendar
allowlist. Write-conflict behaviour remains intentionally untested because no
write scope or write implementation has been approved.

Calendar-setup evidence as of 2026-08-08 adds shared-schema, Fastify,
SQLite-restart/idempotency, migration, permission, secret-scan, responsive
Playwright and accessibility coverage using the fake verifier. It does not
constitute live iCloud validation.

Calendar-navigation evidence as of 2026-08-09 adds 1366×768 and 1920×1080
television, 390×844 and 844×390 phone, D-pad/Back, route compatibility,
date-navigation, event-detail focus restoration and automated accessibility
coverage. Browser-plugin control was unavailable, so the installed Playwright
Chromium fallback produced the retained evidence.

### Hearth reminders

- Reminders are household-owned and require no Apple account, companion app, EventKit permission or
  external reminder source.
- A household member can create a reminder with a title and optional date, edit it, complete it,
  reopen it and remove it after confirmation.
- Retrying a create, update, completion or deletion request does not duplicate the mutation and
  returns the original typed result.
- Every accepted mutation records a safe audit event; rejected or unauthenticated writes change
  neither reminder state nor receipts.
- **Open** is the default view and **All** may reveal completed reminders. Date-only reminders do
  not display a fabricated time.
- Open/All is reachable from the reminder list and navigation using arrows without Tab or touch,
  including an empty list. Switching filters retains visible focus and works from loaded data
  offline; text and date fields keep their native editing keys.
- Today reports the total open count, previews overdue items before due-today, undated and future
  items, links to Reminders and shows **No open reminders** only when the count is zero.
- The dedicated page and Today module pass typed integration, television/mobile rendering,
  accessibility and D-pad/Back checks.
- The former Apple pairing/snapshot endpoints are absent. Migration `0027_native_reminders.sql`
  removes the old source, device, projection and receipt tables including credential hashes.
- The retired proof remains only under `hearth/archive/apple-reminders-bridge/` and does not enter
  active builds or deployment images.

### Household people

- An adult administrator can choose either a portrait or landscape profile photo, position its
  square crop, save it, replace it and restore the original member avatar.
- The normalized profile photo survives server restart, remains below the size limit and is served
  from a same-origin opaque URL without exposing a source path or original image.
- Child/guest mutation is rejected; retrying the same command is idempotent; audit summaries and
  logs do not include base64 image data.
- The phone-sized crop dialog supports direct drag plus two-finger pinch zoom without visible
  position sliders. The crop surface remains keyboard-accessible with arrow, plus/minus and reset
  controls, and failures stay family-readable and inline.

### Chores and pocket money

- One remote Select completes one pending occurrence and offers undo.
- A retried voice/automation request does not create a second completion.
- Editing a recurring chore does not rewrite past completions.
- An adult can select one or more people on a chore schedule. A multi-person schedule is returned as
  one grouped template but generates one distinct occurrence per selected person; completing one
  occurrence leaves every other person's copy pending and preserves independent pocket-money totals.
- An adult can create a one-off chore for a household-local date, archive any active chore only
  after confirmation and restore it from today. Archiving withdraws unfinished occurrences already
  due today while completed occurrences remain visible. Command retries replay safely, same-day
  restore returns withdrawn copies to pending and the archived interval produces no retroactive jobs.
- An adult can add an optional available-from time, due time or valid two-ended window to future
  schedules. Reversed windows are rejected with a stable validation error.
- An adult can move active schedules earlier or later from the phone. The saved order includes every
  active template exactly once, appends newly created schedules and survives restart/retry.
- Generated occurrences retain their snapshotted window and order after a later template edit or
  reorder; future ungenerated days use the new values.
- An adult can then reasonedly skip, excuse or
  reassign a pending occurrence from the phone. The occurrence detail shows its snapshotted
  description, time window and newest-first immutable history after restart.
- Skip remains incomplete and eligible for pocket money, excuse is excluded, and reassignment moves
  responsibility. Retrying the same request cannot apply the change or create history twice.
- The television renders compact available/due metadata in the saved order but keeps
  completion/undo as the only ordinary chore actions; ordering, exception and history controls
  remain phone-first.
- An adult can reverse an accidental completion with an audit trail.
- In phone administration, an adult can mark a pending occurrence from an earlier day in the
  current Monday–Sunday week complete, or undo its completion. The correction updates pocket money
  through the existing typed, idempotent and audited chore command.
- The earlier-chore correction list shows only the current week and is empty each Monday. Older
  occurrences and their audit history remain durable and are not deleted at the week boundary.
- A child cannot modify another person's history or household rules without permission.
- Every participating child has a required weekly amount and payday in phone administration. The setting persists across weeks and server restarts, repeats until an adult changes it and is visibly described as set-and-forget.
- Chores shows each child's completed/total count for the complete Monday–Sunday schedule,
  percentage and proportional amount due without requiring scroll on the primary television
  layout. A Monday completion cannot report 100% while that child still has chores scheduled later
  in the week.
- On a day with no due occurrence, each child remains visible with weekly pocket-money progress and explicit unscheduled-day wording; private households never expose a demo-bootstrap action.
- Completing and undoing a chore updates that running total through the same typed chore contract.
- Excused and cancelled occurrences do not reduce the percentage; skipped occurrences remain incomplete.
- Pocket-money administration defaults to the current Monday–Sunday week and uses one labelled selector for current and past-week review. Standing amount/payday settings remain separate from the selected review week, and no future-week control is shown.
- A payment snapshots the counts, percentage and amount, supports an optional note and is idempotent on retry. Multiple partial disbursements are allowed, but their non-voided total cannot exceed the amount due.
- Paid, partially paid and unpaid/building states are explicit. A missing weekly amount/payday produces a named setup warning for each affected child.
- An adult can correct a mistaken payment only by recording a reasoned, audited void. The original payment and void remain visible after restart, and retrying the same void request does not create another correction.
- Before payday, the payment control clearly warns that early recording is allowed.
- Star balances, per-chore points, reward choices and redemptions are absent from the active UI and API.

### Lists and meals

- Items can be checked with one obvious action.
- Voice addition handles exact duplicates and ambiguous list names safely.
- An authenticated adult can create, rename, type, colour, order, archive and
  restore a list from the phone, while the final active list is protected.
- An authenticated adult can edit an item's text and quantity, reorder or
  remove it, and clear checked items only through an explicit confirmation.
  These commands are idempotent, audited and survive restart.
- The television list surface does not expose dense administration controls.
- Today's meal is visible without entering the Meals module.
- The TV's meal actions reach real companion management destinations while keeping dense editing
  out of the television path.
- An authenticated adult can edit multiple dinners and optional notes in one phone-friendly weekly
  form; one save updates the displayed week atomically and survives restart.
- An adult can copy the previous week or clear the current week only through an explicit
  confirmation. Retrying the same request ID replays the original result without duplicate entries
  or audit events.
- Saved family meals can be created, searched, favourited, updated, archived and restored with
  optional preparation time and notes. Archived meals remain understandable in historical plans.
- Permission, invalid-week, copy-conflict and fail-next/retry paths return stable family-readable
  errors and leave the plan consistent.
- Long-form editing is comfortable from the phone companion; the primary seven dinner fields stay
  visible together while saved-meal and note controls expand only when needed.
- A remote meal update preserves dirty dates, refreshes untouched dates and blocks Save for actual
  dirty-date conflicts until the adult explicitly keeps their edits or takes the latest dinners.
- Meals follows Sunday-to-Monday rollover automatically unless intentionally browsing another week;
  This week resumes following and a browsed date is never misleadingly labelled Tonight.
- Losing a reply after an accepted reminder, payment or list addition retries the original intent
  without duplicate records; failed additions retain entered values and success preserves newer typing.
- Retrying an unanswered household, pocket-money settings or meal-week save preserves newer edits;
  a confirmed earlier dinner save rebases retained drafts without inventing a remote-edit conflict.
- Concurrent chore/list commands track each pending record. One failure restores only that record
  and cannot undo another optimistic or successful command.
- A stream reconnect while the browser remains online catches up changes missed during the gap.
- A hanging initial runtime request becomes a recoverable error within ten seconds; Retry respects
  the runtime/authentication boundary and does not leak family queries before it succeeds.
- Registered drafts survive cancelled menu, remote Back and browser-history navigation; accepted
  discard permits navigation. Admin initial errors preserve heading/Back and a keyboard-operable Retry.
- Admin loading keeps Back available without pre-empting the loaded screen's default D-pad entry.
- Keyboard Retry restores meaningful focus; explicit loading-screen Back focus survives replacement.
  Delayed Calendar routes preserve a short directional burst without automatically opening an event.
- Pending chore/list rows retain remote focus and ignore repeated activation; completion never steals
  focus back after the user deliberately moves to another control.
- Today returns saved verse content while an optional provider is pending; same-day provider recovery
  is not blocked by a previously memoised failure. Weather distinguishes saved-location outage from setup.

### Notices and Today composition

- An authenticated adult can publish, edit and remove a notice with Standard or
  Important priority and a valid start/expiry window.
- Duplicate command request IDs replay the original result and do not create a
  second notice; each accepted write has an audit record.
- The server, not the browser, selects the eligible Important/most-recent notice
  shown on Today, and expiry/removal reveals the next eligible notice.
- Dinner, List summary, Notice, Daily Bible verse and Family photo can be independently shown or
  hidden from the companion without hiding plans or chores or creating a layout
  editor.
- The TV summary rebalances cleanly for one, two, three or four bands, with or without
  a photo; phone administration remains accessible and usable at 390×844.
- At 1920×1080 and 1366×768, every supported Today combination remains inside one television
  viewport with no page or content-panel scrolling. Portrait photos use the right-side composition,
  landscape/square photos use the wide composition, no-photo summaries reclaim the available width,
  and each source remains fully visible at its native pixel ratio without distortion, crop or a
  persistent photo frame.
- Automated layout coverage exercises all 32 Dinner/List/Notice/Daily verse/Reminders subsets
  against six representative photo shapes (including no photo) at both television viewports.
  All 384 combinations remain independently runnable; representative sparse and dense compositions
  are retained for visual inspection.
- Upcoming and due chores use equal-width columns with matching heading and first-row rails. Portrait
  photos share the core upper rail; landscape/square photos share the optional-summary lower rail,
  and hidden optional modules leave no reserved track or unexplained bottom anchoring.
- With multiple approved photos, Today advances the preview after five visible minutes and recomposes
  for the next photo's stored orientation. Photos Pause/Resume also governs Today for that display
  session; reduced motion and hidden documents prevent automatic advancement.
- When Daily Bible verse is enabled, demo mode shows fictional copy and private mode shows an
  attributed ESV passage only when its server secret is configured. Select opens a Back-safe full
  reading; a missing key or provider outage cannot take down Today, and cached text is marked stale.
- Today & notices presents the six visibility switches and notice administration without embedding
  a duplicate simulated dashboard. Two rapid changes cannot overwrite one another, and the actual
  Today destination remains the authoritative rendered result.
- At 390×844, all six Today visibility controls render as full-width joined rows with readable copy,
  an unobstructed trailing switch and a complete inset focus treatment. No control depends on the
  earlier two-column desktop card geometry.
- Today displays three to five event and chore rows on television according to photo orientation
  and available height, keeps the full dashboard inside one viewport, and exposes the exact hidden
  count through focusable links to Calendar Agenda and Chores. A landscape photo permits four only
  at full television height; its compact-height counterpart and the phone remain capped at three.
  No returned item is silently concealed.
- A visible event opens family-readable details, Dinner/List/Photo open their
  real modules, an active Notice opens its full text, and Back restores the exact
  originating control using only remote-equivalent input.

Status as of 2026-08-09: fake/in-memory and durable SQLite command paths,
idempotency, permission/validation rejection, reset isolation, restart state,
realtime invalidation, accessibility and retained 390×844/1920×1080 renders are
implemented. Real household wording and expiry preferences remain pilot tuning,
not a deployment blocker.

Extension evidence as of 2026-08-10: overflow counts, event and notice details,
summary destinations, deterministic focus/Back restoration, TV and phone
responsive renders, automated accessibility checks and console-clean remote
flows are covered by `tests/e2e/today-polish.spec.ts`.

The same date's companion extension adds serialised optimistic visibility changes.
`tests/e2e/today-settings.spec.ts` covers the rapid-toggle race, the absence of the retired embedded
preview, responsive settings renders and automated accessibility checks.

### Home Assistant and voice

- Voice Preview Edition and an iPhone can trigger the same typed Hearth actions.
- The configured chore-completion sentence updates the correct person/date/chore and returns confirmation for Home Assistant/Piper to speak.
- Ambiguous commands ask for clarification rather than guessing.
- Unlisted Home Assistant entities/services cannot be invoked through Hearth.
- A Home Assistant outage does not prevent reading local Hearth data.
- An adult can test, map, replace and remove one Home Assistant connection without returning its
  token, root URL or raw entity IDs to the browser, SQLite, receipts, audits or logs.
- The connection maps exactly four safety states and Evening, Goodnight and Screen off; the runtime
  reads only those states and invokes only the selected scripts through `script.turn_on`.

Local status as of 2026-08-10: fake and REST adapter contracts, external mode-`0600` secret writes,
safe SQLite metadata, adult/idempotency/audit enforcement, malformed/authentication/network errors,
managed activation/removal, responsive phone mapping, keyboard Back and serious/critical
accessibility checks pass. No real token was created and no live Home Assistant, Assist/Piper,
presence, television or IR test was run. Those live/hardware bullets therefore remain incomplete
until the approved commissioning and backup check.

### Native television coexistence

- Jellyfin music and video remain available through the independent native Google TV client without a Hearth credential, connection card or launch command.
- Home Assistant does not auto-power-off the television during protected native-app playback.
- Hearth remains resumable after ordinary Google TV app switching without knowing which media app was used.

### External voice-music commissioning

- Music Assistant is installed beside Home Assistant, not inside Hearth, and
  connects to Jellyfin with a dedicated credential that never enters the
  Hearth workspace or bundles.
- “Play Dreams by Fleetwood Mac” from the living-room voice unit resolves to the
  mapped `Hearth TV` Google Cast player when no destination is spoken.
- Naming a different configured room/player overrides that mapping.
- The requested track plays through Cast with available metadata; acceptance
  does not require opening or automating the native Jellyfin app.
- Pause, resume, next, previous, stop and volume operate reliably, while
  ambiguous search results fail safely or request clarification.
- Cast playback sets the same generic protected-media guard used for native
  playback and prevents a presence-driven screen shutdown.
- Music Assistant/Jellyfin/voice failure remains external to Hearth and does
  not prevent the family dashboard from operating.
- The selected TCL television/video Cast player is explicitly enabled in Music
  Assistant, remains discoverable on the same local network and survives a
  restart/re-discovery test.
- Jellyfin music search, playlist import, refresh and sustained playback are
  reliable enough for the household; otherwise the documented read-only
  Synology music-share fallback is used only after approval.

Status as of 2026-08-04: not run. Music Assistant, the community voice-support
intents, Jellyfin source, player mapping and physical-TCL Cast behaviour remain
live-system commissioning tasks requiring owner approval.

### Presence and power

- Presence during allowed hours can wake/show Hearth.
- No-presence timeout turns the panel off only when Hearth is foreground and no protected media session exists.
- A seated household member does not experience repeated false shutdowns after final presence tuning.
- Quiet hours prevent unwanted wakeups.
- Network wake failure falls back to the approved IR mechanism without hard-cutting mains power.

### Photos and ambient mode

- Approved photos rotate without visible distortion, incorrect orientation or filesystem exposure.
- Automatic collage rotation can be paused and resumed using only the remote or touch, does not
  advance while the document is hidden, and remains still when reduced motion is requested.
- The normal gallery shows each visible photo once and chooses a stable composition from every
  visible photo's stored pixel dimensions. The selected image remains a substantial full-height
  anchor and up to four supports form ratio-derived columns. Every leaf renders at its exact native
  ratio without crop, stretch, persistent frame, shadow or backing card; natural page background may
  remain as negative space. Rotation occurs every
  45 seconds, exposes subtle visible progress to the next composition and remains static under
  reduced motion. The television page has no horizontal or vertical overflow; phone portrait uses
  orientation-aware spans and phone landscape shows three substantial rotating occupants rather
  than five compressed strips.
- Remote/voice input exits ambient mode immediately.
- Normal overnight standby remains available. The owner's explicit foreground-display choice
  (D-094) requests screen retention only while Hearth is resumed and releases it on pause; it does
  not disable manual or Home Assistant standby.
- Missing/corrupt photos fail gracefully.
- An authenticated adult can choose multiple supported phone photos without first configuring a
  shared folder. Each image is capped at 25 MB, decoded server-side, orientation-corrected and
  stored with opaque paths; duplicate content is reported without creating another asset. A child,
  television credential, invalid format and duplicate request ID cannot create an unintended write.
- A batch may partially succeed and reports added, duplicate and failed counts. Client filenames,
  original bytes and private paths do not enter browser-safe responses, receipts, audits or logs.
- An authenticated adult can favourite, unfavourite, hide and restore an indexed photo using touch
  or D-pad only. Commands are validated, idempotent and audited; a hidden photo disappears from
  Today, the gallery and ambient mode without deleting its index or original.
- Favourite and hidden state survives optional incremental Synology folder checks. A missing import
  folder does not disable managed phone uploads or remove their assets. Hidden photos remain available
  in adult administration with a safe derivative preview, while private filesystem paths never
  reach any response or log. Synology metadata and recycle directories such as `@eaDir` and
  `#recycle` are ignored rather than making the approved-folder check fail.
- Adult administration identifies managed uploads and optional-folder imports, supports bulk
  selection for hide/restore and permanently deletes one or more managed uploads only after an
  explicit confirmation. The managed master, display and thumbnail files disappear, the command is
  idempotent and one path-free audit event remains. Imported originals cannot be deleted through
  Hearth and the UI explains the source-folder plus **Check folder** workflow.
- Phone More exposes **Photos** at `/photos` and a separately labelled, visually prominent
  **Manage photos** action at `/admin/photos`. The latter opens the phone upload/curation surface,
  including **Add photos**, and its Back control returns to More. Hearth settings also
  places Manage photos first under Family content rather than hiding it behind a generic household row.
- More and the Hearth settings root use compact title-only navigation rows with slightly squared joined
  group corners. Repeated row subtitles are absent; destination screens retain the explanatory copy
  needed to complete their tasks.

Status as of 2026-08-21: the local browser/server slice passes a unique-image,
content-dependent orientation-aware collage with bounded tile geometry, uncropped portrait rails,
wide landscape bands, visible 45-second occupant
rotation and a reduced-motion pause, mixed landscape and portrait rendering, path-safe typed
responses, D-pad gallery selection,
immediate keyboard/Back-equivalent ambient exit, real offline cached content,
empty/unavailable/failure-retry states and a corrupt-derivative fallback at TV
and phone viewports. Managed upload tests cover portrait normalization, content deduplication,
decoded-format rejection, adult role enforcement, command replay, path-free audit creation and
persistence across service restart. The optional folder adapter additionally passes local mixed-orientation,
unsupported/corrupt/symlink, incremental-change, opaque-route and cached-unavailable tests, with an
adult-only audited manual scan contract. Adult favourite, unfavourite, hide and restore commands
additionally pass role rejection, validation, duplicate-request replay, audit projection, rescan
persistence, hidden-photo projection and D-pad/focus-restoration checks. Live managed upload,
encrypted data-directory restore, optional Synology folder check, voice exit and physical-TCL rendering
and Home Assistant presence/quiet-hours coordination are not run, so this
acceptance section and Phase 7 remain incomplete.

### Appearance and evening comfort

- Light, Dark and Automatic are selectable without touch and remembered separately on each display.
- A paired display or signed-in household viewer can open Appearance and change this device without
  an administrator passkey; all household-mutating Admin routes remain protected.
- Automatic responds when that device's operating-system/browser colour scheme changes.
- Dark preserves readable household/member colours, semantic states and a visible D-pad focus ring
  across Today, Week, Month, Chores, Lists, Meals, Photos, Home and Admin.
- Evening dimming is independently selectable, persists, includes photos/ambient mode and does not
  invoke the Home Assistant Evening scene.
- Back returns from Appearance to the prior screen and restores its previous focused control.

Status as of 2026-08-05: browser automation passes persistence, automatic
system-theme changes, independent dimming, remote-only entry/selection/Back,
serious/critical accessibility checks and dark renders at 3840×2160, 1920×1080,
1366×768, 390×844 and 844×390. The selected TCL's real room comfort and system
theme reporting remain untested until the physical-TV pilot.

### Security and privacy

- Television pairing can be revoked.
- Adult-controller clarity (D-096): Phones & screens identifies the signed-in adult, distinguishes
  existing controller permissions from passkey enrolment and puts phone guidance before TV code
  approval. No phone is claimed ready until its owner signs in with their own passkey. Disconnected
  screens are retained in collapsed history, not mixed into authorized screens; contact timestamps
  do not imply online status. Confirmed screen revocation restores focus and leaves adult passkeys
  unchanged. Local regression and rendered checks are recorded separately from live cleanup.
  David's and Rachael's actual phone sign-ins and exact stale-screen cleanup remain unverified
  until authenticated on-device evidence is obtained. No live records are removed by this change.
- A private non-Android television browser can replace unsupported passkey sign-in with a
  short-code pairing approved by an authenticated adult. The raw device secret is absent from the
  URL, rendered UI, local/session storage, response bodies and logs; after exchange it exists only
  in a `Secure`, `HttpOnly`, `SameSite=Strict` device cookie and grants television rather than Admin
  scope.
- Server-side secrets are absent from built JS and APK artefacts.
- Child/guest roles cannot access admin configuration.
- In private mode, an adult can create the first household only with the external one-time setup
  code and a user-verified passkey; Admin then requires a valid revocable `HttpOnly` companion
  session. The database stores public-key material and session hashes, never the setup code or raw
  session token.
- A signed-in administrator can enrol additional independently named passkeys for any active adult
  and revoke a lost credential. Hearth blocks removal of an adult's final passkey until recovery is
  configured. Recovery-code creation re-verifies the current passkey, displays a 128-bit code once,
  stores only its digest and expires it after 180 days. Successful one-time recovery creates a
  replacement passkey, consumes the code and revokes that adult's earlier credentials and sessions.
- After private first use, an unauthenticated browser cannot discover the household identifier or
  name through runtime bootstrap and receives `UNAUTHENTICATED` from household JSON, photo and
  event-stream routes. A same-household companion with `household.view` and a paired television
  with `household.read` can load the same routes; cross-household credentials fail closed.
- Television pairing still creates unique schema-valid six-character codes after more than 99
  retained requests. Passkey authentication options enforce per-client and global pending limits,
  and expired attempts are pruned so unauthenticated requests cannot grow memory without bound.
- Signed-out personal-device sign-in and shared-screen connection are separate, explicit choices.
  More, desktop settings and Android pairing use the same **Phones & screens** menu name. No code
  is created before a user selects the shared-screen action, and no private household data is
  requested before access is accepted. Expired codes are hidden; Cancel/Back stops polling and
  rejects late creation/approval results, restores focus, and allows another explicit attempt.
  The signed-out flow supports D-pad arrows; the pairing modal traps Tab without touching the
  background. Phone approval tolerates grouped pasted codes but never approves automatically.
  Disconnecting requires confirmation and a lost command reply retains its original request ID.
  Production settings never offer the demo-only pairing preview. Adult settings remain protected
  by the existing server-authenticated passkey session, not by a display code.
  First-use setup remains available on a wide passkey-capable desktop computer; only actual TV
  browsers or unavailable passkey contexts direct the user to a companion device.
- Mutation audit records include actor, channel, target, time and result.
- A household administrator can review the latest family, planning, connection and system changes
  in a family-readable Recent activity screen. A child receives `FORBIDDEN`; the screen does not
  render opaque audit/request/target identifiers or provider secrets, and its filter, Back/focus
  restoration, empty, unavailable, phone landscape/portrait and dark presentations work without
  touch.
- Logs do not include tokens or full sensitive calendar content by default; calendar and Home
  Assistant connection tests explicitly redact their credential fields.
- Public internet exposure is absent unless separately reviewed and approved.

Adult-access evidence as of 2026-08-15: shared-schema, Fastify route, SQLite repository, migration
backfill, idempotent revocation and virtual-WebAuthn browser tests cover additional named-adult
passkeys, current-passkey confirmation, digest-only code rotation, one-time recovery and previous
session/credential revocation. The responsive Admin and signed-out recovery surfaces pass focused
390×844 and 844×390 renders, serious/critical accessibility checks and the complete 206-test
Playwright suite. Stable-hostname enrolment and recovery on the actual adult phones remain a live
commissioning acceptance gate.

Connection-flow evidence as of 2026-10-06: `pnpm verify:code` passes format, lint, types, 249 unit,
135 integration/API and 24 migration tests, deployment validation and production builds;
`pnpm verify:tv` passes native unit tests, Debug/Release lint and both APK builds. `pnpm verify:ci`
checks the complete non-overlapping 914-test inventory. The focused production-build command
`pnpm test:e2e:built tests/e2e/device-connection.spec.ts tests/e2e/runtime.spec.ts tests/e2e/admin.spec.ts tests/e2e/keyboard-layout.spec.ts --max-failures=0`
passes 96 tests, followed by 18 passes from
`pnpm test:e2e:built tests/e2e/appliance-readiness.spec.ts --grep '/admin/televisions|/admin/access|/more' --max-failures=0`.
Evidence covers 320×700, 390×844, 844×390, 820×1180, 1920×1080 and 3840×2160 in light/dark,
private choice/first-use gates, code visibility without scrolling, actual demo approval, immutable
lost-reply replay, confirmed disconnection, expiry/cancel/focus/Tab behavior, empty/clipboard
fallbacks, serious/critical accessibility checks and console/overlay health. Screenshots are local
temporary evidence, not household data. The full 914-test browser suite and real-device passkey/TV
commissioning were not rerun for this targeted workflow change; no live device was paired, and no
commit, push, deployment or network change occurred. `git diff --check` passes.

Phase 6 source/build evidence as of 2026-08-04: the release manifest requires
Leanback, marks touch optional, declares only network access plus the protected
AndroidX receiver permission, disables backup and cleartext, and contains no
configured server URL or integration secret. Pairing/revocation integration
tests, eight native unit tests, Android lint and debug/minified-release assembly
pass. The API 36 Google TV emulator also passes short-code pairing, D-pad
completion/undo, Back/exit, app switching, process recreation, sleep/wake,
server recovery and revocation with retained screenshots. The selected-TCL run
is still required, including its visible launcher tile, actual network
disconnect, overnight resume and native-app coexistence; therefore Phase 6 is
not yet complete.

### Operations and recovery

- Untrusted peers cannot change resolved client IP, host or protocol with forged forwarded headers.
  Explicit proxy IP/CIDR configuration permits only the commissioned chain; blank is fail-closed.

- Hearth server restarts automatically after Synology restart.
- Only an authenticated household administrator can read appliance-update state. Starting an update
  requires a passkey-authenticated companion session created within the previous five minutes;
  television, child, expired, revoked and cross-household credentials fail closed.
- The browser can request only the exact full commit returned by the fixed successful-release
  provider. It cannot send a repository, image, Compose file or shell command, and neither
  application container receives Docker/root access.
- Before activation Hearth creates and checks an online backup. The root-owned agent then preserves
  a stopped-database rollback copy, verifies readiness and restores the previous database plus image
  tags if activation fails. Start and terminal result appear in Recent activity.
- Development hides the update card. A platform without its separately commissioned fixed agent
  reports unsupported rather than pretending an update can run.
- Completed updates show no progress bar and do not block a subsequent release. Cancelled
  passkeys and rejected commands remain retryable; lost command responses reconnect and retain
  the request ID when retrying the same release.
- A configured Synology with a missing agent/status file shows the exact one-time setup action and
  no inert install button. The root hook considers the agent ready only when both its process and
  non-empty status file exist, and an externally activated release restarts a missing agent before
  reporting success.
- A normal verified release pulls immutable full-commit server and web images before recreating the
  project; it does not install dependencies or compile native code on the Synology.
- A browser or television WebView already left open detects the replacement release when realtime
  reconnects, within one visible minute, when it returns to the foreground or when the network
  returns, then reloads once without clearing its route, passkey session or television pairing.
- Unsaved registered drafts defer release reloads until a safe subsequent check; the new release
  remains detectable rather than being marked consumed while editing.
- Private image pulls use a separately revocable read-only registry credential that is absent from
  source, Compose, workflow logs and application containers.
- Home Assistant recovers after Pi restart.
- TV, Pi, NAS and router restarts are each tested.
- A current Hearth backup is restored into a clean test location successfully.
- A Home Assistant backup to Synology is restored successfully.
- The application has visible but calm health reporting for adults.

Local deployment evidence as of 2026-08-09: the production server/web images build and become
healthy together in private mode on native ARM64 and emulated DS920+ `linux/amd64`; the same-origin
readiness route, 20-migration database startup, unseeded first-use runtime, non-root/read-only
security settings and clean `SIGTERM` shutdown pass. These checks validate the scaffold only. The
online backup service now also creates mode-restricted, integrity-checked SQLite copies with
bounded retention; an automated clean-location restore reads the household successfully, and a
phone System Health surface reports concise database/backup/update state without exposing paths or
a full commit. Automatic recovery is explained beside updates; the uncommon extra-copy action is
collapsed under Advanced recovery. The five
operations bullets above still require the actual Synology, Pi, TV, router and live restore drill,
so production acceptance remains incomplete.

Pull-only deployment evidence as of 2026-08-21: production/fallback Compose validation, immutable
full-commit image references, pinned Buildx publishing configuration and the stage/activation shell
syntax are locally verified. The first hosted package publication, one-time NAS registry sign-in and
live pull/recreate timing remain not run until the change is approved for commit/push and the
private credential is commissioned.

## Release evidence

Local follow-up evidence as of 2026-10-06: `pnpm verify:code` passes formatting, lint, types,
244 unit tests, 135 API/integration tests, 24 migration tests, deployment validation and production
builds. `pnpm verify:ci` validates all five CI-policy checks and the complete four-shard partition;
`pnpm test:e2e:built --max-failures=0` passes all 897 browser tests, including keyboard/D-pad,
responsive, accessibility and strict-production-CSP startup cases. An additional rendered pass
checks 93 route/viewport combinations with no failures. `pnpm verify:tv` passes Android unit tests,
Debug/Release lint and builds. Both final `linux/amd64` production images build; isolated container
checks pass nginx CSP/cache/bootstrap/API routing, read-only/non-privileged configuration and clean
shutdown. The root updater safety toolbox passes eight fixtures. Registry dependency audit is clear
after the source-map-js override; `git diff --check` passes. These are local checks, not publication
or deployment, and no real physical device was available.

Approved live recovery evidence on 2026-10-06 applies to the unchanged installed Ramsay NAS release
`f2dea867ef5ffb3cf875354122ff0cae13b1939c`, not D-089/D-090 deployment. A 1,794,048-byte online snapshot
passes integrity and schema version 27 verification, restores into a network-isolated disposable
container, and matches the logical 800-row fingerprint. Only the two existing Hearth containers
restart; readiness and the original version recover. The original HTTPS hostname subsequently
returns readiness 200 with successful certificate validation. A temporary 502 during the deliberate
restart is recorded, not mistaken for a persistent failure. Disposable copies/containers are removed;
no household commands, deployment, DNS/firewall/VPN changes or other app restarts are performed.

The initial live snapshot attempt correctly stopped before restart when DSM's inherited ACL made
its disposable file report mode 777 despite a 0600 creation request. That exact test copy was removed;
the successful retry used private container tmpfs plus a protected temporary volume directory.
Unix mode alone does not establish effective DSM ACL access. Existing household-folder ACLs are
not changed by this drill. Read-only ACL inspection permits the administrators group and the
`hearth-svc` account, not a general everyone/users grant. The new strict POSIX helper still needs
an approved ACL-compatible commissioning review before installing its protected control-mount
boundary. Physical TV/phone/iPad, standby/network-loss,
live provider-outage and Home Assistant restore checks remain unverified.

D-089 additionally requires regression evidence for revoked/consumed in-flight authority, singleton
first use, bounded pairing/reminder state, legacy date recovery, extreme calendar spans, stream and
sign-out revocation, provider transport budgets, pinned photo bytes and protected update recovery.
Linux root-fixture success is not proof that a live NAS helper was migrated. Verify the installed
Python/SQLite capability, protected paths, control mount and exact activated release only during an
approved deployment. Real-device passkey, standby and television-network checks remain distinct.

- CI verifies that four browser shards cover the complete test inventory exactly once, including
  all 384 Today compositions. Each shard runs one worker against its own disposable demo database
  and the production build from the same workflow run; it cannot reuse a live development server.
- Publication requires successful code/API, all browser shards, Android and container-build gates.
  Failure, timeout or cancellation must leave the candidate unavailable to the appliance updater.
  Local checks never substitute for the hosted successful-release requirement.

Before calling the first household release complete, retain:

- exact test/build command output
- rendered screenshots for 4K/1080 and iPhone states
- Android TV emulator or device test notes
- integration test results and intentionally untested items
- backup/restore evidence
- current deployment versions and rollback procedure
