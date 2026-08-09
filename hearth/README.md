# Hearth v2

Hearth is an original television-first family command centre. Phases 0–5 provide
the deterministic Today/Week/Month/Chores television and iPhone product, remote
navigation, persistent recurring chore occurrences, completion/undo/skip,
idempotent audit-safe commands, live invalidation, a companion Admin area, and
a durable provider-neutral calendar projection with cached outage recovery and
an opt-in read-only CalDAV/iCloud adapter,
shared lists, dinner planning, recurring-routine administration and proportional
weekly pocket money, a curated Home Assistant screen and structured Assist
command endpoints. Home Assistant owns the microphone, wake word, recognition
and Piper speech; Hearth does not listen or speak. Separately, the household
deployment may later use Music Assistant to search Jellyfin music and cast it
to a named Google TV player. That source/queue/player/voice-intent path remains
outside this monorepo; Hearth receives only a generic protected-media boolean.
Phase 6 now includes a
minimal Kotlin Google TV shell with native pairing, encrypted device-credential
storage, an origin-restricted WebView bridge and branded recovery UI. The API 36
Google TV emulator run is retained; the selected-TCL lifecycle run remains
required before Phase 6 is complete. Phase 7 is in progress with an original
responsive Photos gallery, an injected path-safe photo-source contract, mixed
orientation demo derivatives, offline/cached/error states and an ambient
slideshow that exits on any remote key, plus a read-only Synology folder indexer
and Admin scan status. Live folder selection/mount and presence/quiet-hours
coordination remain unconfigured. Hearth also provides
per-display Light, Dark and Automatic themes plus independent evening dimming;
Automatic follows that device's system colour setting and does not invoke a
Home Assistant scene.

No real calendar, Home Assistant, Synology or household credential is required.
Admin, chore, list, meal, pocket-money and normalized fake-calendar state persist in
`data/hearth-demo.sqlite` through a migrated WAL-mode SQLite repository. Demo
reset/scenario routes remain deliberately isolated from non-demo mode.

## Requirements

- Node `>=22.12` (development was verified with Node 25.9.0)
- pnpm 10.33.2 through the pinned `packageManager`
- Playwright Chromium for rendered tests
- Java 17 or newer and Android SDK platform/build-tools 36 for `apps/tv`

The production Synology LTS Node image must be pinned before deployment.

## Run locally

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://127.0.0.1:4320/today`. On a phone viewport, **More** opens the
Admin area for household name/timezone, people/roles, televisions, connection
readiness and Family Planning. Recurring chore, meal and pocket-money editing is
phone-first; Lists and Meals remain readable and actionable on television.
`http://127.0.0.1:4320/home` opens the curated living-room status and three
fake-adapter Home Assistant actions. `http://127.0.0.1:4320/admin/connections/home-assistant`
opens the fictional connection and allowlist-mapping flow without contacting a live system.
`http://127.0.0.1:4320/photos` opens the demo gallery and ambient mode. The
phone More screen also links to Photos.
`http://127.0.0.1:4320/admin/appearance` opens the per-display theme and evening
comfort controls; the TV rail exposes the same page beneath Home.
`http://127.0.0.1:4320/pair` opens the television pairing surface.
The server listens on
`http://127.0.0.1:4310`; Vite proxies `/api` during development.

Use Arrow keys, Enter and Escape exactly as a television remote. Deterministic
states are available through query strings:

- `?scenario=loading`
- `?scenario=empty`
- `?scenario=stale`
- `?scenario=unavailable`
- `?scenario=offline`
- `?scenario=permission`
- `?scenario=fail-next`
- `?scenario=protected-media`

Demo control routes are disabled when the server is built with `demoMode:
false`.

## Optional private CalDAV read

Demo mode never contacts a calendar provider. For a separately approved private
read check, set `HEARTH_MODE=private` and point
`HEARTH_CALENDAR_CONFIG_PATH` to a JSON secret outside this repository. The
server must be able to create or replace that file with mode `0600`. An adult
then uses **More → Connections → Calendar** to test the account, choose exact
calendars and save. The setup page writes this shape; it can also be prepared
manually as a private deployment/bootstrap step (replace every placeholder only
in the external secret file):

```json
{
  "version": 1,
  "provider": "caldav",
  "serverUrl": "https://your-caldav-server.example",
  "username": "your-account-identifier",
  "appPassword": "your-revocable-app-specific-password",
  "householdTimezone": "Australia/Perth",
  "calendars": [{ "displayName": "Approved calendar name", "ownerMemberId": null }]
}
```

The allowlist is exact and non-empty. Ambiguous/missing names fail closed, all
reported capabilities are read-only, and the server exposes no calendar write
method. In demo mode the same page uses fictional discovery and never writes a
credential or contacts the entered server.
Never place this JSON in the workspace, `.env`, a browser `VITE_`
variable, image layer or shell command. Without the path, private mode reports
calendar as not configured and continues serving local Hearth data.

## Optional private Home Assistant connection

The live REST adapter is inert unless `HEARTH_MODE=private` and
`HEARTH_HOME_ASSISTANT_CONFIG_PATH` points to an access-restricted, writable file outside this
repository. After the private HTTPS/passkey setup is commissioned, an adult uses **More →
Connections → Home Assistant** to enter the private Home Assistant root address and a dedicated
long-lived access token. Testing returns only opaque candidate IDs and friendly labels; saving maps
four safety signals and exactly three scripts. Hearth atomically writes the URL, token and raw
entity IDs to the external file with mode `0600`, activates the adapter without restart and stores
only safe labels/status in SQLite. Demo mode always uses fictional discovery.

The adapter calls Home Assistant only for the four mapped state reads and `script.turn_on` for
Evening, Goodnight and Screen off. It has no generic service, dashboard, Jellyfin, Music Assistant
or Cast control surface. Live connection and hardware commissioning still requires an approved
Home Assistant backup/rollback check; no real token belongs in this workspace, `.env`, a Vite
variable, image layer or command line.

The demo Admin UI uses a fictional Maya adult session. This exercises real server-side capability
checks, including child rejection, but is not a login mechanism. Private mode implements named
adult passkey enrolment and revocable secure sessions; it remains inert until the stable private
HTTPS hostname and external one-time setup code are commissioned. No raw device credential or
passkey is stored in this workspace.

## Verification

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:migrations
pnpm build
pnpm test:e2e
pnpm test:visual
pnpm test:a11y
pnpm verify
pnpm verify:tv
```

`pnpm test:visual` writes retained screenshots to the phase evidence folders.
Browser code receives the demo household only through the API; it does not
import server fixtures.

## Workspace map

- `apps/server` — Fastify JSON/SSE transport, provider adapters and migrated SQLite repositories
- `apps/web` — React television and responsive companion product UI
- `apps/tv` — controlled Kotlin Android TV shell, pairing and recovery UI
- `packages/shared` — browser-safe Zod contracts
- `packages/core` — pure chore command, calendar-date and summary behaviour
- `docs/design/phase-1` — approved concepts, tokens and asset provenance
- `docs/evidence/phase-1` — rendered evidence and fidelity findings
- `docs/design/phase-2` — Admin and television-pairing source concepts
- `docs/evidence/phase-2` — setup/pairing rendered evidence and fidelity findings
- `docs/evidence/phase-3` — calendar projection, CalDAV contract and rendered evidence
- `docs/design/phase-4` — approved Lists, Meals and companion planning concepts
- `docs/evidence/phase-4` — Phase 4 rendered evidence and fidelity findings
- `docs/design/phase-5` — approved Home television and phone concepts
- `docs/evidence/phase-5` — Home/Assist rendered evidence and fidelity findings
- `docs/evidence/phase-6` — Android build, security and device-test evidence
- `docs/design/phase-7` — Photos concept and original demo-photo provenance
- `docs/evidence/phase-7` — Photos TV/phone/state renders and fidelity ledger
