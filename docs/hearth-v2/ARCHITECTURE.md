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
  Hearth Companion iOS app -> Apple EventKit Reminders (native, read-only proof)
  iPhone Companion apps -> responsive Hearth web administration
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

### `apps/ios`

The first native iOS companion proof is a SwiftUI iOS 17+ target under
`hearth/apps/ios`. It owns a narrow, read-only `ReminderStore` boundary with a
real EventKit adapter and a deterministic fake adapter for tests/previews. The
native surface requests the EventKit full Reminders permission required by iOS
to read existing reminders, enumerates reminder-capable lists, lets an adult
select lists and displays safe reminder projections. After adult-approved
pairing, its separate `ReminderSnapshotClient` may send only the frozen,
bounded full-snapshot projection to the trusted private Hearth origin using the
device-scoped `HearthReminderSource` credential. It stores that 32-byte secret
in Keychain, never uses it as a household/adult session, requests no background
access and does not mutate EventKit data.

The app root injects a separate `ReminderListSelectionStore` into the reminder
model. The live implementation uses app-sandboxed `UserDefaults` to retain only
the sorted opaque identifiers of selected EventKit lists; previews and tests use
an in-memory implementation. Unset state, an intentional empty selection and a
saved non-empty selection remain distinct. Every successful list read intersects
the saved identifiers with the current EventKit lists, so removed lists are
pruned without persisting reminder titles, dates or completion state. If EventKit
temporarily returns no lists while a non-empty selection exists, the model keeps
the prior selection/snapshot stale and emits no clearing snapshot; only an
explicit empty adult selection can intentionally clear the Hearth projection.

This is an Apple integration surface, not a second household database or a
replacement for the responsive web companion. A later installed Hearth
Companion may combine native Apple integrations with the existing authenticated
web administration session; WKWebView versus opening that authenticated web
session remains a future evaluated choice outside this proof.

### `packages/shared`

Zod schemas, API request/response contracts, event envelopes, identifiers and generated/inferred TypeScript types. It must remain browser-safe.

### `packages/core`

Pure household-domain behaviour: recurrence expansion, completion rules, proportional pocket-money calculation, permission decisions and deterministic summaries. No Fastify, SQL, browser or Home Assistant imports.

## Data flow

```text
Calendar provider -> calendar adapter -> Hearth cache/projection -> Hearth API -> TV/web
iPhone EventKit -> device-scoped full snapshot -> Hearth reminder projection -> Hearth API -> TV/web
TV/web command -> Hearth API -> domain validation -> DB/audit -> optional provider command
Voice -> Home Assistant Assist -> allowlisted HA script -> Hearth command API
Hearth UI -> Hearth API -> HA adapter -> allowlisted HA service/script
Hearth Companion iOS -> EventKit permission -> selected Apple Reminders lists (read-only)
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

### Implemented household and native-bridge contracts

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
- the versioned native Reminders endpoints, schemas and retry rules in
  `REMINDERS_COMPANION_CONTRACT.md`, including approval-gated pairing, a distinct
  `HearthReminderSource` credential, full-snapshot replacement and ordinary household reads
- `GET /api/v1/households/:id/admin` and typed household/member setup commands
- adult-only `GET /api/v1/households/:id/activity?limit=` for the newest 1–100 safe audit
  summaries; the companion currently requests 50 and presents family-readable filters without
  rendering opaque target or request identifiers
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
- adult-only `GET /api/v1/households/:id/home-assistant-connection`, separate connection-test and
  save commands, and an idempotent removal command for the bounded Home Assistant mapping workflow
- `POST /api/v1/households/:id/assist/day-summary` and `/assist/chore-completions` for Home Assistant Assist
- `GET /api/v1/households/:id/photos` for the private, path-safe photo collection and its display/thumbnail derivatives
- adult-only, idempotent `POST /api/v1/households/:id/photo-uploads` with one raw supported image,
  `X-Hearth-Request-Id` and optional capture timestamp; the server authenticates the companion,
  validates/decode-bounds the image, normalizes it locally and returns no storage path or filename
- adult-only `GET /api/v1/households/:id/photo-source` and idempotent
  `POST /api/v1/households/:id/photo-source/refreshes` for aggregate managed/import status and
  manual checks of the optional read-only folder import
- adult-only, idempotent `POST /api/v1/households/:id/photo-assets/:assetId/curation-actions` for
  favourite, unfavourite, hide and unhide commands with command receipts and audit events
- adult-only, idempotent `POST /api/v1/households/:id/photo-assets/:assetId/deletions` for permanent
  removal of a Hearth-managed upload and its derivatives. Optional-folder imports return a stable
  conflict instead of allowing Hearth to mutate the read-only source
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
flag. `TodaySummary` may include one nullable same-origin photo derivative, family-readable
alternative text and the normalized `portrait | landscape | square` orientation required for
deterministic television composition. Phase 7 now selects that preview through the
same injected photo-source adapter as the Photos gallery; demo mode returns
fictional bundled derivatives. Private mode always constructs the managed Synology adapter. Adult
uploads are normalized to a private master plus bounded WebP display/thumbnail derivatives under
`/data`, deduplicated by content hash and recorded with an opaque asset ID. The optional read-only
folder import activates only when its server environment path is configured; it ignores symlinks,
incrementally fingerprints files, applies EXIF orientation and preserves its last safe index if the
import mount is unavailable. Adult curation receives only a bounded source kind and deletion
capability, never a path. The provider deletes only a managed upload after the service authenticates
an adult, persists an idempotent receipt and records a path-free audit event. The optional import
remains source-authoritative and read-only. Import failure does not disable managed uploads or
existing photos. Each
`WeekSchedule` day also carries a nullable, presentation-safe daily forecast
summary (condition code, family-readable label, Celsius temperature and safe provider identity). The
existing query routes read calendar values from the durable SQLite projection
rather than from browser fixtures. Demo mode uses deterministic forecasts. Private mode injects the
server-only Open-Meteo adapter when both deployment coordinates are configured, coalesces concurrent
requests, caches successful responses for 30 minutes and retains the last safe response during a
temporary provider outage. Coordinates never enter the browser contract or SQLite.

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

The optional daily-verse flag resolves through an injected `DailyVerseProvider` only when enabled.
Demo mode returns original fictional copy. Private mode either uses the ESV passage-text API with a
token read from `HEARTH_ESV_API_KEY_PATH`, or an explicit unconfigured adapter. Successful text is
cached by household and passage in SQLite; a failed refresh may return that passage as stale, while
provider failure never fails the wider Today response. The token and raw response do not enter
browser contracts, logs, receipts or audits.

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

Calendar-owner edits use a fourth idempotent mapping command. It requires the
complete connected source set, validates every member against the household,
updates the safe projection and external allowlist atomically, and leaves the
existing URL/account/password fields untouched.

Selected-calendar edits use an adult-only rediscovery route. The server loads
the existing external credential, stages the same bounded ten-minute safe test
result used by initial setup and never returns credential material. Saving the
revised set reuses the idempotent calendar save contract, so adding or removing
an allowed calendar does not require replacing the connection.

Calendar-bearing browser queries follow an appliance refresh policy. Today,
Week and Month fetch immediately when mounted, refetch every five minutes while
the document is visible and refetch immediately when browser connectivity
returns. Saving, remapping or removing a calendar connection invalidates all
three projections immediately; the existing `calendar.changed` SSE event does
the same for changes made by another connected device. The interval is a
recovery backstop rather than a replacement for SSE. A failed provider refresh
continues to return the durable SQLite projection with stale integration state,
so previously synced events remain visible instead of becoming a blank screen.

Weather location setup is a separate adult-only repository boundary with
search, test and save routes. Search and phone reverse-labelling are server
proxies so provider policy and error mapping remain outside the browser. Save
requires a live test ID, writes migration-0022 household coordinates, creates an
audit event/receipt, reconfigures the managed Open-Meteo provider in memory and
publishes `weather.changed` without restarting Hearth.

Home Assistant setup follows the same two-step boundary. A test calls only the supported
`/api/config` and `/api/states` REST endpoints, keeps the URL, token and raw discovered entity IDs
inside a ten-minute in-process record, and returns opaque option IDs with friendly labels. Save
resolves exactly four state mappings and three script mappings, atomically writes the raw values to
the external mode-`0600` secret file, persists only hostname/instance/version/friendly labels in
SQLite, activates the managed provider without restart and publishes `home.changed`. Removal
deletes the external file and disconnects the provider. Demo/test use deterministic fictional
discovery; the private browser contract never returns the token, root URL or raw entity IDs.

Phase 4 uses the same command envelope, actor/source resolution, audit summaries,
idempotency receipts and SSE invalidation path as chores. The television may
check list items, but recurring-chore, meal and pocket-money editing stays in the
responsive companion presentation.

`PUT /api/v1/households/:householdId/chore-template-order` accepts one idempotent adult command with
every active template ID exactly once. Template create/update commands carry optional
`availableFromTime` and `dueTime` values; shared validation rejects a reversed window. The
repository updates active order transactionally and occurrence generation snapshots both time
boundaries and `sortOrder`, keeping previously generated days stable after later edits.

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
Once a private household exists, an unauthenticated runtime response remains bootstrap-safe but
redacts the household identifier and name (`household: null`, `requiresSetup: false`). The browser
then offers passkey sign-in. A valid companion session or paired-TV credential reveals the runtime
household and allows normal route construction.

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

Migrations `0001`–`0025` establish the household core, Admin/pairing state, chore runtime, calendar
projection, household planning, Home Assistant projection, television credentials, photos, pocket
money, member avatars, calendar setup, companion passkeys/sessions, Today configuration, payment
history, the Synology photo index, saved-meal preparation metadata, reasoned chore-occurrence
management history, snapshotted chore windows/order, credential-free Home Assistant connection
metadata, named-adult passkey recovery, canonical chore time-of-day grouping,
the tested household weather location, managed photo-upload metadata, optional folder-import status,
daily-verse visibility, the bounded attributed passage cache and the device-scoped EventKit
Reminders projection. The live demo server uses the SQLite
repository; its in-memory adapter remains only for isolated contract tests.

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

Pairing codes remain exactly six uppercase alphanumeric characters across the bounded sequence;
retained expired rows cannot make later pairing creation produce an invalid over-length code.

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
Authentication-option issuance is rate-limited per resolved client address, pending ceremonies are
globally capped, and expired ceremonies/address windows are physically removed before new options
are created. This keeps the unauthenticated passkey entry point memory-bounded.

Adult access supports several named adult accounts and several independently revocable passkeys per
adult. Adding a passkey or issuing a replacement recovery code requires a current administrator
session; issuing the code additionally re-verifies the current passkey. The 128-bit recovery code
is displayed once, expires after 180 days, and is stored only as a SHA-256 digest. Successful
recovery consumes the code, creates a replacement passkey and revokes that adult's earlier passkeys
and sessions. Hearth never places a shared admin token in a URL and does not permit the final
passkey to be revoked before recovery exists. Passkeys still require a stable private hostname and
HTTPS secure origin before real household data is entered.

During the isolated demo, a server-resolved Maya administrator session exercises the same role/capability checks without pretending to be production authentication. This demo actor header is disabled outside demo mode. See D-014.

### Service integrations

- Calendar credentials and Home Assistant URL/token/raw mappings remain in access-restricted,
  external server files; SQLite, browser contracts and audit summaries retain only safe metadata.
- A paired EventKit companion uses its own hash-only, independently revocable device credential with
  exactly `reminders.snapshot.write`. It cannot authenticate as a television or companion adult,
  and an adult passkey session cannot be substituted for snapshot upload.
- Secrets enter containers through environment/secret files excluded from source control.
- Tokens are scoped as narrowly as the provider allows.
- Device and service credentials are independently revocable.

### Permissions

Model roles/capabilities rather than scattered UI checks. The server is authoritative. Hiding a button is not authorisation.

Every `/api/v1/households/:householdId` route in private mode passes one central read boundary
before its route handler. Companion sessions must belong to the requested household and resolve to
an active member with `household.view`; television credentials must belong to the household and
carry `household.read`. This includes photo derivatives and Server-Sent Events. Route-specific
capability checks still apply to administration and mutations after this baseline read check.

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
Those IDs map server-side to one of exactly three selected script entities and call only Home
Assistant's `script.turn_on` service; request payloads cannot name a Home Assistant domain, service
or entity. Runtime reads fetch only the four selected state endpoints. The cached projection stores
only presence, television power, whether Hearth is foreground and a generic protected-media
boolean. It stores no current app, title, track or player. The adult setup workflow exposes only
opaque discovery choices and family-readable saved labels, so it does not become a general Home
Assistant dashboard.

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
- Refresh visible calendar surfaces every five minutes and immediately after browser reconnect or calendar settings changes; retain the last successful browser query data while a request is in flight or fails.
- Continue to show local chores, lists, meals, photos and cached events when external services fail.
- Queue only safe, explicitly designed local commands. Do not blindly replay ambiguous calendar edits.
- Mark stale data with a quiet, comprehensible indicator.
- Integration failure must not prevent app startup.
- The TV shell shows a branded recovery surface if the Hearth server itself is unavailable.

## Deployment

The commissioned production deployment uses Docker Compose source and release files under
`/volume1/docker/hearth-v2`, with private household data and secrets deliberately kept in the
separate `/volume1/hearth-v2-private` share. Do not overwrite the old `/volume1/docker/hearth`
path without explicit approval.

Initial containers:

- `server`: pinned Node LTS, Fastify and the sole owner of the local SQLite volume
- `web`: pinned nginx stable, static React assets and the same-origin `/api` reverse proxy

`hearth/deploy/synology` implements this split with non-root processes, read-only root filesystems,
dropped capabilities, bounded logs, readiness-gated startup and loopback-only HTTP ingress. DSM
Reverse Proxy terminates the eventual private HTTPS origin and is the only intended route to the
web container. No router port-forward or public DNS exposure is part of this deployment.

The server image compiles its SQLite native binding inside the pinned Linux build image for the
target CPU architecture, rather than trusting a prebuilt binary from a different glibc runtime.
GitHub Actions performs that `linux/amd64` compilation after the complete verification gate and
publishes the server/web images to private GitHub Container Registry packages tagged with the full
Git commit. Production Compose is pull-only; the DS920+ does not install pnpm dependencies or
compile native code during an ordinary update. A separate Compose override retains source builds
only as an explicit recovery fallback. Image publication is an outbound package operation and does
not give GitHub Actions network or credential access to the private household deployment.
`GET /api/v1/health` reports process liveness; `GET /api/v1/readiness` verifies SQLite and the latest
migration. The stable private hostname and trusted certificate remain commissioning inputs because
adult passkeys bind to that origin. See D-031.

The server is also the sole process allowed to create database recovery copies. In private mode it
uses SQLite online backup into the restricted data volume, verifies and prunes those files, and
serves only a typed aggregate status to authenticated adults. Restore is intentionally outside the
HTTP application: the production image contains a CLI that verifies a retained copy and writes it
to a new clean destination without overwriting an existing database. See D-043.

## Observability

- Structured server logs with request ID and actor/device ID, excluding secrets and sensitive event bodies by default.
- Public health endpoints distinguish process liveness and database readiness. Authenticated adult
  System Health adds safe migration, application-version and recovery-copy state.
- Audit events are household records, not merely logs.
- Home Assistant may monitor Hearth health and notify an adult after persistent failure.
- Retention and backup behaviour is configured and documented; actual Synology capacity/off-device
  monitoring and the live restore drill remain required before production use.

## Performance strategy

- Server-rendering is unnecessary for the LAN TV application; use a static React build and cached API queries.
- Load the Today shell and cached household summary before secondary modules.
- Avoid large client state frameworks until real complexity requires one.
- Optimise images server-side into television-appropriate derivatives.
- Measure launch/resume and navigation on the target TV rather than optimising only desktop benchmarks.
