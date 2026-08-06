# Phase 0–1 verification record

Date: 2026-08-03 (Australia/Perth)

## Environment

- Node `v25.9.0`
- pnpm `10.33.2`
- Playwright `1.62.1`, Chromium fallback
- no Git metadata
- no bargain-finder/Python system in this intentionally Hearth-only workspace

## Final gates

| Command                          | Result                                                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Passed; lockfile current, all five workspace projects resolved.                                           |
| `pnpm format:check`              | Passed; all matched files use Prettier style.                                                             |
| `pnpm lint`                      | Passed with zero warnings.                                                                                |
| `pnpm typecheck`                 | Passed for production and test TypeScript configs in shared, core, web and server.                        |
| `pnpm test:unit`                 | Passed: 17 tests across shared (3), core (3), web (9) and server (2).                                     |
| `pnpm test:integration`          | Passed: 4 Fastify contract/error/idempotency/redaction tests.                                             |
| `pnpm test:migrations`           | Passed: 1 SQLite WAL/foreign-key/uniqueness migration smoke test.                                         |
| `pnpm build`                     | Passed: all packages/server and the Vite production client. Main client JS 357.66 kB raw, 109.08 kB gzip. |
| `pnpm test:e2e`                  | Passed: 24 Playwright tests (4 axe checks, 6 remote/phone/recovery flows, 14 retained visual cases).      |
| `pnpm verify`                    | Passed end to end.                                                                                        |
| `git diff --check`               | Not available: the workspace is not a Git repository (exit 129).                                          |

Direct readback found no conflict markers or source trailing whitespace. Targeted
source/browser-bundle scans found no private domain, calendar URL, private key,
credential-shaped Vite variable, test bearer secret or personal account marker.
Production TypeScript output contains no emitted test artefacts.

## Applicable acceptance evidence

- All Today/Week/Chores routes are reachable through Arrow keys and Enter; two
  Escape presses unwind Chores → Week → Today and restore remembered focus.
- One Enter completes Pack school bag; focus remains on inline Undo; a second
  Enter reverses through the typed server command and audited result.
- Duplicate request IDs replay the command receipt rather than creating another
  completion.
- Permission and fail-next scenarios return stable family-readable errors; the
  optimistic pending view rolls back and retries in place.
- Current, loading, empty, stale, unavailable, real browser offline-after-load,
  permission and failure presentations are deterministic.
- Axe reports no serious or critical automated violations on TV Today, Week,
  Chores or phone Today.
- Focus remains visible with outline, halo, elevation and geometry; reduced
  motion removes the transform.
- Browser code receives the household only through `/api/v1`; no server fixture
  or provider credential is bundled.

Target-device launch/resume, Android launcher/manifest, real provider behaviour,
Synology restart/backup restore and Google TV three-metre testing are correctly
deferred; Phase 1 reserves their contracts without claiming release acceptance.

## Subsequent status

Phase 2 later completed the SQLite repository, household/member role and pairing
flows, occurrence generation/history, live invalidation and isolated
backup/restore demonstration. See the Phase 2 verification record. Calendar
provider selection remains pending for Phase 3; no live credentials or
calendar writes were introduced.
