# Hearth v2 architecture

## System topology

```text
Google TV
  Hearth Android TV shell -> Hearth web UI
  Native Jellyfin app -> Synology Jellyfin server (manual browsing, independent of Hearth)
  Built-in Google Cast receiver <- Music Assistant voice-requested audio
  Normal streaming apps
  HDMI eARC -> optional Sonos Beam

Raspberry Pi 5 / Home Assistant OS
  Home Assistant
  Music Assistant app + official Home Assistant integration
  Piper + Speech-to-Phrase/Whisper + optional openWakeWord
  ESPHome integrations

Synology DS920+
  Existing Jellyfin service and media
  Hearth server/web containers
  Hearth SQLite data volume
  Hearth and Home Assistant backups

Input and automation
  Home Assistant Voice Preview Edition
  iPhone Companion apps
  Existing PIR/IR through ESPHome
  Optional Zigbee/Thread and mmWave devices
```

The Pi is never in the television's HDMI path. Google TV runs Hearth and
Jellyfin as independent native apps; the Jellyfin client connects directly to
the Synology server. For a voice music request, Music Assistant may run on the
Pi, search the same Jellyfin library and send an audio stream over the LAN to
the television's built-in Google Cast receiver. That external path does not
pass through Hearth or the native Jellyfin app.

## Application package boundaries

### `apps/server`

Owns HTTP/Server-Sent Events transport, authentication, persistence adapters, background synchronisation and connections to external systems. Fastify is the preferred server framework.

Suggested modules:

- `auth`
- `households`
- `members`
- `calendar`
- `chores`
- `pocket-money`
- `lists`
- `meals`
- `photos`
- `announcements`
- `home-assistant`
- `devices`
- `audit`
- `health`

### `apps/web`

Owns the television and responsive companion presentation. It consumes only the Hearth API/client and browser-safe configuration. It does not connect directly to calendar providers, Home Assistant, Jellyfin, Music Assistant or the filesystem.

### `apps/tv`

A minimal Kotlin Android TV application that provides:

- TV launcher category, banner and icon
- full-screen exact-origin controlled WebView
- TV-only 1920-pixel logical viewport across Android display densities
- application identity, network-status and exit-only native message bridge
- predictive/remote Back callback forwarded to the React history handler
- one-time pairing and AES-GCM device-credential storage backed by Android Keystore
- last-route restoration plus native server, network, revocation and WebView recovery

Business logic remains in server/core. Do not create a second chore/calendar implementation in Kotlin.

### `packages/shared`

Zod schemas, API request/response contracts, event envelopes, identifiers and generated/inferred TypeScript types. It must remain browser-safe.

### `packages/core`

Pure household-domain behaviour: recurrence expansion, completion rules, proportional pocket-money calculation, permission decisions and deterministic summaries. No Fastify, SQL, browser or Home Assistant imports.

## Data flow

```text
Calendar provider -> calendar adapter -> Hearth cache/projection -> Hearth API -> TV/web
TV/web command -> Hearth API -> domain validation -> DB/audit -> optional provider command
Voice -> Home Assistant Assist -> allowlisted HA script -> Hearth command API
Hearth UI -> Hearth API -> HA adapter -> allowlisted HA service/script
Synology Jellyfin server -> native Google TV Jellyfin app (outside Hearth)
Voice music -> Assist custom intent -> Music Assistant -> Jellyfin music source -> named Google Cast player (outside Hearth)
```

## API style

- JSON HTTP API for queries and commands.
- Server-Sent Events for one-way household-state invalidation.
- Version routes at `/api/v1` from the start.
- Use opaque string identifiers rather than database row numbers at boundaries.
- All time-bearing responses include ISO 8601 timestamps and explicit zone/offset where applicable.
- Commands that may be retried accept a request/idempotency identifier.
- Errors return stable codes plus family-safe messages; raw provider errors stay in restricted logs.

An eventual MCP endpoint, if built, is a thin authenticated adapter over the same application services. It is not a second business-logic path.

### Phase 1–5 implemented contract

The first slice implements browser-safe Zod contracts for `TodaySummary`,
`WeekSchedule`, `MonthSchedule`, `ChoreList`, integration freshness, command results, audit
summaries and stable family-safe API errors. The implemented routes are:

- `GET /api/v1/households/:id/today?date=`
- `GET /api/v1/households/:id/week?start=`
- `GET /api/v1/households/:id/month?month=`
- `GET /api/v1/households/:id/chore-occurrences?date=`
- adult-only `GET /api/v1/households/:id/chore-occurrences/:occurrenceId` for the occurrence
  description and family-readable immutable command history
- `POST .../:occurrenceId/completions` with `{ requestId }`
- `POST .../:occurrenceId/completion-reversals` with `{ requestId, completionId }`
- adult-only `POST .../:occurrenceId/skips` with `{ requestId, reason }`
- adult-only `POST .../:occurrenceId/excuses` with `{ requestId, reason }`
- adult-only `POST .../:occurrenceId/reassignments` with
  `{ requestId, reason, assigneeId }`
- `GET /api/v1/households/:id/events` as a same-origin Server-Sent Events invalidation stream
- `GET /api/v1/households/:id/admin` and typed household/member setup commands
- `GET /api/v1/households/:id/members/:memberId/avatar` for the same-origin normalized profile derivative
- `PUT /api/v1/households/:id/members/:memberId/avatar` with `{ requestId, mimeType: "image/jpeg", dataBase64 }`
- `POST /api/v1/households/:id/members/:memberId/avatar-resets` with `{ requestId }`
- one-time pairing request, approval/status and paired-device revocation commands
- `GET /api/v1/households/:id/lists` plus typed item add, complete and reversal commands
- adult-only `GET /api/v1/households/:id/list-settings` plus idempotent list
  create/update/archive/restore/order and item update/archive/order/clear-checked commands
- `POST /api/v1/households/:id/assist/list-items`, which resolves a named list without guessing and rejects active duplicates
- `GET /api/v1/households/:id/meal-plan?start=` for the family-readable week and active saved-meal
  summaries
- adult-only `GET /api/v1/households/:id/saved-meal-library` plus idempotent saved-meal
  create/update/archive/restore commands
- adult-only `PUT /api/v1/households/:id/meal-plan-weeks` and confirmed week clear/copy commands;
  each whole-week mutation is one transaction, receipt and audit event
- `GET /api/v1/households/:id/pocket-money?weekStart=&asOf=` for child weekly progress and amounts due
- `PUT /api/v1/households/:id/members/:memberId/pocket-money-settings` for adult-only required weekly amount and payday changes
- `POST /api/v1/households/:id/pocket-money-payments` for an adult-only, idempotent full or partial weekly payment snapshot with an optional note
- `POST /api/v1/households/:id/pocket-money-payments/:paymentId/voids` for an adult-only, idempotent, reasoned correction that preserves the original record
- adult-only chore-template query/create/update commands, including explicit one-off schedules and
  one-or-more `assigneeIds`. Responses expose the grouped `assignees`; the runtime expands each
  template/date into one occurrence per selected person. Legacy singular `assigneeId` command
  receipts remain readable during forward upgrades. Archive/restore use replay-safe lifecycle
  commands (`POST .../:templateId/archivals` and
  `POST .../:templateId/restorations` with a validated `resumeFrom` local date)
- `GET /api/v1/households/:id/home` for curated presence, television power and power-safety state
- `POST /api/v1/households/:id/home/actions/:actionId` for allowlisted, confirmed and audited Home Assistant scripts
- `POST /api/v1/households/:id/assist/day-summary` and `/assist/chore-completions` for Home Assistant Assist
- `GET /api/v1/households/:id/photos` for one approved, path-safe photo collection and its display/thumbnail derivatives
- adult-only `GET /api/v1/households/:id/photo-source` and idempotent
  `POST /api/v1/households/:id/photo-source/refreshes` for safe index status and manual rescans
- `GET /api/v1/households/:id/photo-assets/:assetId/:variant` for immutable, opaque WebP display
  and thumbnail derivatives; source paths and originals never cross this boundary
- `GET /api/v1/auth/status`, first-use registration options/verification, discoverable-passkey
  authentication options/verification, session and sign-out routes for the private companion

Member-avatar commands use the adult Admin session, strict request-size and JPEG checks,
idempotency receipts and explicit audit actions. The browser normalizes the selected original to a
512×512 JPEG before sending it. SQLite stores at most one 1 MB derivative per member plus the
original opaque avatar key needed for reset; responses and receipts never contain image bytes.
The versioned same-origin URL prevents stale browser images without exposing a filesystem path.

Pocket-money settings, partial-payment and void commands use the same server-side adult session, validation,
idempotency receipt and audit path as other household writes. Chore completion and undo publish a
`pocket-money.changed` invalidation; they do not create star/reward records. The forward-only
`0009_pocket_money.sql` migration leaves the former reward tables dormant for upgrade safety.
Migration `0014_pocket_money_payment_history.sql` adds payment notes, multiple immutable
disbursements per child/week and one reasoned void per payment.

`TodaySummary`, `WeekSchedule` and `MonthSchedule` expose read-only calendar sources and
normalized events with opaque `calendarId`, inclusive household-local start/end
dates, provider version, recurrence-master identity and an explicit exception
flag. `TodaySummary` may include one nullable same-origin photo derivative and
family-readable alternative text. Phase 7 now selects that preview through the
same injected photo-source adapter as the Photos gallery; demo mode returns
fictional bundled derivatives. Private mode constructs the read-only Synology-folder adapter only
when its server-only source environment is configured; otherwise the source remains explicitly
unconfigured. The adapter ignores symlinks, incrementally fingerprints source files, applies EXIF
orientation, writes bounded WebP derivatives atomically and preserves the last safe index while the
NAS is unavailable. Each
`WeekSchedule` day also carries a nullable, presentation-safe daily forecast
summary (condition code, family-readable label and Celsius temperature). The
existing query routes read calendar values from the durable SQLite projection
rather than from browser fixtures; the current forecast is a deterministic
demo value until a separately approved provider is selected.

`MonthSchedule` returns a fixed Monday-first 42-day projection window, calendar
source descriptors and the normalized events overlapping that window. The
browser derives colour-coded title rows, deterministic overflow summaries and
accessible per-day summaries from that single typed response; it does not issue
five or six sequential Week requests. On narrow companions, the same response
also supplies the selected-date agenda beneath the compact grid.

Today composition reads durable `today_section_preferences` and
`announcements` through an injected content repository. Adult companion writes
use validated, idempotent and audited commands; private runtime uses SQLite and
demo/test runtime uses the same contract with isolated seed state. The server
selects the one active notice by start/expiry window and priority, publishes a
`today.changed` invalidation and returns explicit visibility flags in
`TodaySummary`. This is bounded content configuration, not a layout DSL.

The server selects its calendar implementation at composition time. Demo mode
injects `FakeCalendarProvider`; private mode injects a stable managed provider
that delegates either to the read-only `CalDavCalendarProvider` loaded from an
external secret path or to an `UnconfiguredCalendarProvider` that reports a
distinct not-configured state. The adult calendar-setup command can replace
that delegate after atomically saving the same external secret format, so a
server restart is not required to begin a read-only refresh.
The CalDAV implementation uses the maintained `tsdav` transport for RFC 4791
discovery/query and `ical.js` for normalized iCalendar components. Credentials
remain captured inside the server transport factory and are not enumerable on
the provider object. Full bounded refreshes hide missing calendars and
tombstone missing events in the same SQLite transaction as cursor/freshness
updates.

Calendar setup uses separate test/save/remove commands. Discovery credentials
remain in a ten-minute in-process pending record; the browser receives only an
opaque test ID and safe calendar descriptors. Save is idempotent and audited,
writes the private credential file before persisting safe connection metadata,
and publishes `calendar.changed`. Removal deletes the credential file and
disconnects the managed provider. No browser contract returns a username,
password, collection URL or event payload from discovery.

Phase 4 uses the same command envelope, actor/source resolution, audit summaries,
idempotency receipts and SSE invalidation path as chores. The television may
check list items, but recurring-chore, meal and pocket-money editing stays in the
responsive companion presentation.

Demo-only reset/scenario routes exist only when the server is started in demo
mode. Demo actor/source headers exercise the server-side permission matrix and
are rejected outside demo mode; they are not production authentication.

The browser first requests `GET /api/v1/runtime`. Its typed response selects
the configured household and carries the server-derived household-local date,
Monday week start and current month. Household API paths, React Query keys,
planning defaults and real-time event paths are derived only after that
response succeeds. `demo` and `test` inject the fixed Perth clock used by
retained evidence; `private` injects the system clock. A private database with
no household returns `requiresSetup: true` and a null household, so the browser
renders first use without issuing household queries. After the one-time local setup code and
WebAuthn registration are verified, household/member/default-list creation and credential storage
commit in one transaction; the runtime resolver observes the new household without a restart.

Repository construction follows the same mode boundary. Demo/test may seed the
fictional household. Private construction runs migrations but does not insert
fictional households, members, chores, lists, meals, pocket-money settings or
device records. This separation is a composition concern rather than a second
database schema.

## Persistence

Use SQLite in WAL mode for the first household deployment:

- one mounted persistent database file
- numbered, forward-only schema migrations
- transactional commands
- foreign keys enabled
- automated consistent backups
- no dependence on a network-mounted live SQLite file

The database file lives on the Synology container's local volume. Do not put a live SQLite database on an SMB client mount.

Migrations `0001`–`0017` establish the household core, Admin/pairing state, chore runtime, calendar
projection, household planning, Home Assistant projection, television credentials, photos, pocket
money, member avatars, calendar setup, companion passkeys/sessions, Today configuration, payment
history, the Synology photo index, saved-meal preparation metadata and reasoned chore-occurrence
management history. The live demo server uses the SQLite repository; its in-memory adapter remains
only for isolated contract tests.

Postgres is a future option only if concurrency or operational evidence justifies it.

## Authentication and authorisation

### Television

Use one-time pairing:

1. The TV requests a short-lived pairing code.
2. An adult approves it in the companion/admin interface.
3. The TV proves possession of its locally generated secret after approval; the
   server stores only its hash and activates the independently revocable device.
4. Android Keystore-backed AES-GCM storage retains the secret. Native code sets
   the scoped `HttpOnly` WebView cookie; browser JavaScript never receives it.

Debug emulator HTTP is an intentionally non-secure browser context. Browser
commands therefore generate idempotency IDs with `crypto.randomUUID()` when
available and a `crypto.getRandomValues()` fallback otherwise; both paths retain
cryptographic randomness.

### Companion/admin

The LAN-only release uses named adult household accounts with passkeys as the primary companion
sign-in. Private first use reads a high-entropy one-time code from an external secret file, rate
limits invalid attempts, requires user verification and a discoverable passkey, then issues a
30-day `HttpOnly`, `Secure`, `SameSite=Strict` cookie. Only its SHA-256 digest is stored; sign-out
revokes the database session. Registration and authentication challenges are single-use and expire
after five minutes. WebAuthn credentials retain their public key, signature counter, transports,
device type and backup state; successful authentication advances the counter.

A second-adult/recovery flow remains required before the household pilot. It may issue a renewable
recovery code only after adult confirmation on an already trusted surface; it must never place a
shared admin token in a URL. Passkeys require a stable private hostname and HTTPS secure origin
before real household data is entered.

During the isolated demo, a server-resolved Maya administrator session exercises the same role/capability checks without pretending to be production authentication. This demo actor header is disabled outside demo mode. See D-014.

### Service integrations

- Calendar credentials and Home Assistant tokens remain server-side.
- Secrets enter containers through environment/secret files excluded from source control.
- Tokens are scoped as narrowly as the provider allows.
- Device and service credentials are independently revocable.

### Permissions

Model roles/capabilities rather than scattered UI checks. The server is authoritative. Hiding a button is not authorisation.

## Home Assistant security boundary

Hearth is permitted to call only configured Home Assistant scripts/services through an allowlist containing:

- stable Hearth action ID
- display name
- target HA domain/service or script entity
- accepted argument schema
- confirmation level
- permitted Hearth roles

Never expose an arbitrary service-call form to a child/guest surface or an LLM.

The Phase 5 adapter accepts only `evening-mode`, `goodnight` and `screen-off`.
Those IDs map server-side to fixed script targets; request payloads cannot name
a Home Assistant domain, service or entity. The cached projection stores only
presence, television power, whether Hearth is foreground and a generic
protected-media boolean. It stores no current app, title, track or player.

Home Assistant is also the complete local-voice host. Voice Preview Edition or
an iPhone sends speech to Assist; Assist calls Hearth's authenticated `/assist`
API and uses Piper to speak Hearth's returned result. Hearth has no wake-word,
speech-recognition, microphone or text-to-speech runtime.

Music requests take a distinct path. Music Assistant is installed as a Home
Assistant OS app, connected through the official Home Assistant integration,
and configured with Jellyfin as a music source plus Google Cast as the native
player provider. A deployment-owned mapping associates each Assist satellite
or room with a named player such as `Hearth TV`, so “play Dreams” can omit the
room while “play Dreams in Ezra's room” can select another approved player.
This is an Assist automation/custom-intent mapping, not a Hearth setting or
database record.

As of 2026-08-04, starting arbitrary music by voice is not a built-in core
Home Assistant intent. It requires Music Assistant's separately installed
community voice-support blueprints/custom sentences. The implementation should
send the resolved audio to the Cast player. Launching the native Jellyfin app is
possible at a general app level through Home Assistant's Android TV Remote
integration, but selecting an arbitrary song through keypress or UI automation
is deliberately excluded as brittle.

## Offline and degraded operation

- Cache the latest calendar projection and selected Home Assistant household/power-safety state in Hearth.
- Continue to show local chores, lists, meals, photos and cached events when external services fail.
- Queue only safe, explicitly designed local commands. Do not blindly replay ambiguous calendar edits.
- Mark stale data with a quiet, comprehensible indicator.
- Integration failure must not prevent app startup.
- The TV shell shows a branded recovery surface if the Hearth server itself is unavailable.

## Deployment

The intended production deployment is Docker Compose under a new Synology path such as `/volume1/docker/hearth-v2`; do not overwrite the old `/volume1/docker/hearth` path without explicit approval.

Initial containers:

- `server`: pinned Node LTS, Fastify and the sole owner of the local SQLite volume
- `web`: pinned nginx stable, static React assets and the same-origin `/api` reverse proxy

`hearth/deploy/synology` implements this split with non-root processes, read-only root filesystems,
dropped capabilities, bounded logs, readiness-gated startup and loopback-only HTTP ingress. DSM
Reverse Proxy terminates the eventual private HTTPS origin and is the only intended route to the
web container. No router port-forward or public DNS exposure is part of this deployment.

The server image compiles its SQLite native binding inside the pinned Linux build image for the
target CPU architecture, rather than trusting a prebuilt binary from a different glibc runtime.
`GET /api/v1/health` reports process liveness; `GET /api/v1/readiness` verifies SQLite and the latest
migration. The stable private hostname and trusted certificate remain commissioning inputs because
adult passkeys bind to that origin. See D-031.

## Observability

- Structured server logs with request ID and actor/device ID, excluding secrets and sensitive event bodies by default.
- Health endpoints distinguish process health, database readiness and integration health.
- Audit events are household records, not merely logs.
- Home Assistant may monitor Hearth health and notify an adult after persistent failure.
- Retention and backup behaviour must be documented before production use.

## Performance strategy

- Server-rendering is unnecessary for the LAN TV application; use a static React build and cached API queries.
- Load the Today shell and cached household summary before secondary modules.
- Avoid large client state frameworks until real complexity requires one.
- Optimise images server-side into television-appropriate derivatives.
- Measure launch/resume and navigation on the target TV rather than optimising only desktop benchmarks.
