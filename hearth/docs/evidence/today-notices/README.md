# Today settings and notices evidence

The phone-first **Today & notices** screen keeps the six visibility switches and notice management
directly above one another. The retired TV/Phone simulation is no longer embedded in administration;
the real Today destination is the authoritative rendered result.

## Current evidence

- `today-notices-phone-portrait.png` — light phone administration without an embedded preview.
- `today-settings-dark-phone-portrait.png` — dark phone administration without horizontal overflow.
- `today-customised-tv-1080.png` — the resulting real television Today screen.
- `today-daily-verse-settings-phone-portrait.png` — optional verse control in administration.
- `today-daily-verse-tv-1080.png` and `today-daily-verse-dialog-tv-1080.png` — real television verse
  summary and Back-safe detail.

## Interaction proof

`tests/e2e/today-settings.spec.ts` loads Today & notices, confirms that no Preview heading or preview
component exists, changes visibility switches, publishes and removes notices, and verifies the
resulting television Today view. The same suite retains light/dark phone renders and runs
serious/critical axe checks.

The in-app Browser inspection also covered 390×844 and 1366×768. Both rendered all six switches,
showed no preview component or horizontal overflow, accepted a switch change and produced no console
warning or error.

## Verification

- `pnpm format:check` — passed.
- `pnpm lint` — passed with zero warnings.
- `pnpm typecheck` — passed across shared, core, server and web.
- `pnpm --filter @hearth/web test:unit` — 26 files and 78 tests passed.
- `pnpm exec playwright test tests/e2e/today-settings.spec.ts` — 5 tests passed.
- `pnpm build` — shared/core packages and production web/server builds passed.
