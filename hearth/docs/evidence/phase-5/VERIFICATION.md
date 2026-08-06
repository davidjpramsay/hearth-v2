# Phase 5 Home Assistant and Assist verification

Verified on 2026-08-03 in Australia/Perth with Node 25.9.0, pnpm 10.33.2 and
Playwright Chromium 1.62.1.

## Passed

- `pnpm install --frozen-lockfile` — all five workspace projects were already
  current under the pinned pnpm 10.33.2 lockfile.
- `pnpm verify` — passed formatting, lint, strict type checking, 45 unit tests,
  37 server/persistence integration tests, 6 migration tests, production builds
  and 83 Playwright tests.
- `pnpm test:a11y` — 16/16 passed with no axe-detectable serious or critical
  issues on the covered television, phone, Admin and confirmation surfaces.
- `pnpm test:visual` — 44/44 passed and refreshed the retained television,
  phone and degraded-state evidence.
- Direct source-boundary and credential scans — no import of server/demo code
  into the browser, application dependency on the old Hearth path, generated
  concept embedded in the app, private key, credential URL, bearer token or
  secret value. The sole old-path match is the deliberate read-only warning in
  the operations document.
- `view_image` — inspected both accepted concepts and the final 1920x1080,
  390x844, 844x390, confirmation and protected-playback counterparts.

Production build observation: the web entry is 419.41 kB JavaScript (122.89 kB
gzip) and 51.00 kB CSS (10.91 kB gzip); source maps total 2,025.00 kB.

## Coverage

- Browser-safe Home Assistant state, action, Assist-command, integration,
  audit and stable error schemas.
- Migration 6 for the deliberately narrow Home Assistant projection; raw Home
  Assistant state, entity IDs and media metadata are not persisted.
- Fake and unconfigured Home Assistant adapters, an allowlisted script map,
  service-identity authorization, explicit Goodnight confirmation, idempotency,
  auditing, fail-next recovery and protected-media power safety.
- Assist day-summary, exact and ambiguous chore matching, chore completion and
  list-item commands through authenticated typed HTTP contracts. Hearth has no
  microphone, wake-word, speech-to-text or text-to-speech implementation.
- D-pad-only Home navigation, confirmation/Back handling, focus restoration,
  failure/retry, phone interaction, reduced motion and responsive layouts.

## Corrected during verification

- The first targeted Playwright invocation used a nonexistent named project;
  rerunning against the repository's configured Chromium target passed.
- The first full verification gate found one type-only import lint issue; it
  was corrected before the final passing `pnpm verify` run.
- Full phone testing found the fixed bottom tabs could intercept the Goodnight
  confirmation button. The dialog stacking and phone safe-area spacing were
  corrected, then the complete browser suite passed.

## Retained evidence

- `screenshots/home-tv-4k.png` — 3840x2160
- `screenshots/home-tv-1080.png` — 1920x1080
- `screenshots/home-tv-1366.png` — 1366x768
- `screenshots/home-phone-portrait.png` — 390x844
- `screenshots/home-phone-landscape.png` — 844x390
- `screenshots/home-state-unavailable.png`
- `screenshots/home-state-protected-media.png`
- `screenshots/home-state-fail-next.png`
- `screenshots/home-state-confirmation.png`

The concept-to-render comparison and intentional responsive differences are
recorded in `README.md` beside this file.

## Files changed for Phase 5

### Contracts and core logic

- `packages/shared/src/schemas.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/schemas.test.ts`
- `packages/core/src/home.ts`
- `packages/core/src/home.test.ts`
- `packages/core/src/index.ts`

### Server and persistence

- `apps/server/src/integrations/home-assistant-provider.ts`
- `apps/server/src/home-repository.ts`
- `apps/server/src/home-repository.unit.test.ts`
- `apps/server/src/home-repository.integration.test.ts`
- `apps/server/src/migrations/0006_home_assistant_projection.sql`
- `apps/server/src/migrations/migration.migration.test.ts`
- `apps/server/src/app.ts`
- `apps/server/src/app.integration.test.ts`
- `apps/server/src/database.ts`
- `apps/server/src/index.ts`
- `apps/server/src/realtime.ts`
- `apps/server/src/planning-repository.ts`
- `apps/server/src/sqlite-hearth-repository.ts`
- `apps/server/src/demo/seed.ts`
- `apps/server/package.json`

### Web application and browser tests

- `apps/web/src/screens/HomeScreen.tsx`
- `apps/web/src/screens/ListsScreen.tsx`
- `apps/web/src/components/AppShell.tsx`
- `apps/web/src/components/AdminPage.tsx`
- `apps/web/src/components/Icon.tsx`
- `apps/web/src/api/client.ts`
- `apps/web/src/hooks/useHearthQueries.ts`
- `apps/web/src/hooks/useRealtimeInvalidation.ts`
- `apps/web/src/hooks/useScenario.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/styles/app.css`
- `tests/e2e/home.spec.ts`
- `tests/e2e/visual.spec.ts`
- `tests/e2e/accessibility.spec.ts`

### Documentation and design evidence

- `docs/design/phase-5/README.md`
- `docs/design/phase-5/concepts/home-tv-1080-concept.png`
- `docs/design/phase-5/concepts/home-phone-portrait-concept.png`
- `docs/evidence/phase-5/README.md`
- `docs/evidence/phase-5/VERIFICATION.md`
- `docs/evidence/phase-5/screenshots/*.png`
- `README.md`
- `.env.example`
- `apps/tv/README.md`
- `../docs/hearth-v2/README.md`
- `../docs/hearth-v2/PRODUCT_SPEC.md`
- `../docs/hearth-v2/UX_SPEC.md`
- `../docs/hearth-v2/ARCHITECTURE.md`
- `../docs/hearth-v2/DATA_MODEL.md`
- `../docs/hearth-v2/INTEGRATIONS.md`
- `../docs/hearth-v2/ROADMAP.md`
- `../docs/hearth-v2/ACCEPTANCE.md`
- `../docs/hearth-v2/DECISIONS.md`

## Not run or not applicable

- Live Home Assistant credentials, entity/script mappings, automations and
  household writes — intentionally excluded; only the injected fake adapter was
  exercised.
- Real presence timing, IR/network television control and protected-playback
  sensor behaviour — require owner-approved hardware configuration and testing.
- Android/Gradle build — reserved for Phase 6; the TV shell remains documented
  without making missing Android tooling a blocker.
- Live CalDAV credentials or writes, Synology deployment and production pairing
  — outside this phase.
- `git diff --check` — not available because this workspace has no Git metadata.
- Bargain-finder regression tests — not applicable in this intentionally
  Hearth-only workspace under superseded decision D-001.
