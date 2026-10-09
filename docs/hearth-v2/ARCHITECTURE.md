# Hearth v2 architecture

## Local Games boundary

Games serves only the household-supplied archive through authenticated, no-store household GETs:
`…/games/word-groups` returns bounded puzzle metadata; `…/games/word-groups/:puzzleId` returns one
validated board and its groups. No archive path or source URL enters a request or response. Answers
are game data, not an authorization secret; client-side evaluation is not an anti-cheating boundary.

The archive adapter reads one descriptor-pinned regular file, bounded to 10 MiB and 5,000 puzzles.
It validates dates, identifiers, four difficulty levels and the complete sixteen-tile partition;
content-derived IDs prevent changed answers inheriting stale guesses. Reads are lazy, coalesced and
cached for one minute. Malformed/missing data affects only Games, preserving a previously loaded
archive as stale. There is no remote fetch, embedded newspaper interface or new credential.

Game rules live in core. Browser progress stores numeric guesses/order only, isolated by runtime
and household, validated by replay and bounded to the 2,000 most recently played puzzles. This is
device-local game state, not a household command, offline write queue or authoritative shared
record; no database migration or audit event is needed for each tile selection. Version 2 keeps a
separate bounded index of up to 5,000 completed puzzle IDs so replay or eviction of an old detailed
attempt does not forget a completion. The owner's 2026-10-06 reset discards only old v1 Games keys
on each device when it loads this version. Other browser storage and all household state are left
alone. V2 progress is not reset on subsequent visits or ordinary releases.

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

- TV launcher category and original fern-plus-wordmark banner/icon with explicit intrinsic proportions
- full-screen exact-origin controlled WebView
- foreground-only screen retention through the activity window flag, released on pause (D-094)
- TV-only 1920-pixel logical viewport across Android display densities
- application identity, network-status and exit-only native message bridge
- predictive/remote Back callback forwarded to the React history handler
- one-time pairing and AES-GCM device-credential storage backed by Android Keystore
- last-route restoration plus native server, network, revocation and WebView recovery

Business logic remains in server/core. Do not create a second chore/calendar implementation in Kotlin.

The shell also installs a main-frame-only document-start viewport script for the exact paired
origin. Native display metrics determine the scale; a short-lived parser observer handles the head
and viewport arriving after document start. Older WebViews receive an origin-checked post-commit/
post-parser fallback. This is a layout guard, not a new bridge capability: it reads no credentials,
storage or API data and does not weaken CSP. The server's same-origin startup script remains in
place for ordinary browsers and appearance. See D-093.

### `archive/apple-reminders-bridge`

Contains the retired Swift/EventKit proof, source projection and frozen wire contract for possible
future research. It is excluded from active application packages, builds and deployment. Restoring
it requires a new product and security decision; active Hearth has no Apple Reminders credential,
pairing, snapshot or EventKit boundary.

### `packages/shared`

Zod schemas, API request/response contracts, event envelopes, identifiers and generated/inferred TypeScript types. It must remain browser-safe.

### `packages/core`

Pure household-domain behaviour: recurrence expansion, completion rules, proportional pocket-money calculation, permission decisions and deterministic summaries. No Fastify, SQL, browser or Home Assistant imports.

## Data flow

```text
Calendar provider -> calendar adapter -> Hearth cache/projection -> Hearth API -> TV/web
TV/web reminder command -> Hearth API -> native reminder validation -> DB/audit
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
- household-owned reminder reads and authenticated create, update, completion and reversal
  commands; the retired native bridge contract remains reference-only under
  `hearth/archive/apple-reminders-bridge/`
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
summary (condition code, family-readable label, low/high Celsius temperatures, rain probability
and safe provider identity). The
existing query routes read calendar values from the durable SQLite projection
rather than from browser fixtures. Demo mode uses deterministic forecasts. Private mode injects the
server-only Open-Meteo adapter when a saved or fallback location is configured, coalesces concurrent
requests, caches successful responses for five minutes and retains the last safe response during a
temporary provider outage. `GET /api/v1/households/:householdId/weather` returns current conditions,
24 hourly points and seven daily points through one typed projection. The safe location label may
appear; coordinates never enter this forecast contract. An optional `configured` boolean keeps a
saved-location outage distinct from missing setup, including when no forecast has ever been cached.

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

The authenticated household Reminders query reads Hearth-owned reminder rows through the same API
on television, phone and future native clients. The browser defaults to incomplete items; **All**
may reveal completed items. Validated create, update, completion/reopen and deletion commands are
idempotent and audited. `TodaySummary` derives a bounded summary from incomplete reminders, ordered
overdue, due today, undated and then future, returning the total open count plus at most three
preview items.

The optional daily-verse flag resolves through an injected `DailyVerseProvider` only when enabled.
Demo mode returns original fictional copy. Private mode either uses the ESV passage-text API with a
token read from `HEARTH_ESV_API_KEY_PATH`, or an explicit unconfigured adapter. Successful text is
cached by household and passage in SQLite; a failed refresh may return that passage as stale, while
provider failure never fails the wider Today response. The token and raw response do not enter
browser contracts, logs, receipts or audits. The extracted Today composer reads available memory or
SQLite verse content synchronously and starts a deduplicated background refresh; it never awaits
the optional provider. Changed verse content publishes `today.changed`. Failed/null/stale results
back off for one minute rather than suppressing recovery for the rest of the day. Successful daily
results are memoised for that date; prior-date in-memory entries are discarded.

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

Browser JSON requests bound both response headers and body parsing to ten seconds and preserve
caller cancellation. Bootstrap does not automatically retry an initial failed request; it offers
an explicit recovery action without using cached family data to bypass authentication. Explicit
calendar/Home Assistant discovery receives thirty seconds; photo upload/import refresh, checked
backup and update-start requests receive two minutes. A timeout is an ambiguous write outcome, not
proof that the server rejected a command.

Reminder, payment/settings/void, household, list-add and meal-management intents retain a cloned
payload and request ID for manual retry while the owning screen is mounted. Date/week context is
captured at submission. A changed intent cannot replace an unanswered one until it is resolved.
Only definitive rejection or confirmed success releases the intent. Optimistic chore/list rollback
restores the affected record only, and per-record pending state prevents overlapping actions on it.

The client maintains one household SSE connection. Opens/reconnects, online, foreground and
pageshow events catch up all household queries plus runtime; domain events invalidate a typed
domain map. Invalidations are coalesced and deferred while commands are pending. A visible-minute
fallback runs only while the stream is disconnected. Inactive queries are marked stale rather than
eagerly loaded. This is catch-up by fresh reads, not event replay.

The data router protects registered drafts across menu links, remote Back and browser history.
Remote entry waits for usable controls rather than hidden Suspense content. A route-lifetime
observer restores focus when loading/error replacement removes the focused node, while retaining
explicit visible field/navigation focus. A bounded eight-direction queue bridges lazy transitions;
activation is never queued, and Back, Tab or pointer interaction discards pending directions.
Shared Calendar-tab movement remains explicit through a pending lazy view; history Back instead
restores the destination route's remembered control.
Meal-week drafts track original per-date revisions; untouched dates absorb incoming data and changed
dirty dates require an explicit resolution before Save. The demo planning repository and pure
record/fixture helpers are separate from SQLite persistence; meal administration CSS is route-local.

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

Migrations `0001`–`0027` establish the household core, Admin/pairing state, chore runtime, calendar
projection, household planning, Home Assistant projection, television credentials, photos, pocket
money, member avatars, calendar setup, companion passkeys/sessions, Today configuration, payment
history, the Synology photo index, saved-meal preparation metadata, reasoned chore-occurrence
management history, snapshotted chore windows/order, credential-free Home Assistant connection
metadata, named-adult passkey recovery, canonical chore time-of-day grouping,
the tested household weather location, managed photo-upload metadata, optional folder-import status,
daily-verse visibility, the bounded attributed passage cache and Hearth-owned reminders. The
short-lived Apple projection remains in forward migration history only and is removed by `0027`.
The live demo server uses the SQLite
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

Private pairing codes are random six-character uppercase alphanumeric values with UUID record IDs.
Admission permits at most 32 pending requests and 20 new attempts per resolved peer per ten minutes;
replay occurs before charging admission. Expiry does not depend on polling, pending lists are bounded,
and records retain a seven-day replay window before pruning on new issuance.

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
Verification rechecks linked credential/member state after asynchronous proof. Additional enrollment
and recovery-code issuance bind and recheck the initiating server-authenticated session at commit;
recovery claims exactly one still-active code before replacing access. First-use transactions
reassert the singleton household invariant. Realtime delivery and heartbeats revalidate admission.
Sign-out cancels private reads, closes streams, clears runtime/query authority and reloads an
unmounted private view. Private photos and avatars use `private, no-store` caching.
Authentication-option issuance is rate-limited per resolved client address. Forwarded addresses are
used only through explicit `HEARTH_TRUST_PROXY_ADDRESSES` IP/CIDR configuration; otherwise the socket
peer identifies the rate-limit bucket, shared by callers behind the same proxy. Pending ceremonies are
globally capped, and expired ceremonies/address windows are physically removed before new options
are created. This keeps the unauthenticated passkey entry point memory-bounded.

The process health response includes the active immutable release identifier and is explicitly
non-cacheable. Open browser and television WebView clients compare it when their existing realtime
connection opens or reconnects, once per visible minute, and when the page returns to the foreground
or network. A changed release causes one full page reload; credentials and paired-device storage are
untouched. Registered unsaved drafts defer that reload until a later safe check without consuming
the new release identifier. Hidden pages do not run the interval check.

Adult access supports several named adult accounts and several independently revocable passkeys per
adult. Adding a passkey or issuing a replacement recovery code requires a current administrator
session; issuing the code additionally re-verifies the current passkey. The 128-bit recovery code
is displayed once, expires after 180 days, and is stored only as a SHA-256 digest. Successful
recovery consumes the code, creates a replacement passkey and revokes that adult's earlier passkeys
and sessions. Hearth never places a shared admin token in a URL and does not permit the final
passkey to be revoked before recovery exists. Passkeys still require a stable private hostname and
HTTPS secure origin before real household data is entered.

D-097 adds an optional `signInOnThisDevice` registration intent. Legacy requests retain the helper's
session. The explicit phone-setup flow freezes this intent in the ceremony and, only after verified
registration and commit-time administrator/session/target checks, creates a session for the chosen
adult and revokes the initiating browser session in the same transaction. Other sessions and keys
remain active. The replacement token is internal to the server and reaches the browser only in the
existing Secure/HttpOnly/Strict cookie; the response remains credential/audit metadata. The client
closes the old document and clears private caches without calling sign-out on the new cookie.

If every adult loses access, `deploy/synology/owner-access.py` is a deliberately local operator
exception, not a web endpoint or shared password. It requires root or the NAS administrators group,
existing private-database access, a verified online backup and exact active-adult targeting. It
issues a 128-bit, 15-minute, digest-only one-time recovery record. Its private file is never printed
by the tool or persisted in source/logs. Issuance changes no keys, sessions, roles or household data;
the existing user-verified recovery ceremony later consumes it and replaces only that adult's access.
Every operator mutation has a truthful system/NAS-owner audit in the same transaction.

Appliance update status is an administrator-only service, not a browser privilege. Starting an
update requires a new passkey-authenticated session no more than five minutes old. The server accepts
only the exact release exposed by its fixed verified-workflow provider, creates an online recovery
copy and sends a two-field request through a mode-restricted local FIFO. It has no Docker socket,
root credential or general command endpoint. A separately installed platform agent performs the
fixed host operation and publishes only bounded progress/result state. See D-079.
The host independently enforces the fixed latest-successful-release policy; it does not trust a
commit chosen by the application. Control is mounted from `/usr/local/etc/hearth-v2/control`;
authoritative markers and rollback copies remain outside that mount under root-only
`/volume1/.hearth-v2-state`, so snapshots cannot fill the DSM system partition.
The host Python helper opens data files without following links, verifies a private SQLite snapshot,
and binds atomic recovery to the originally pinned data-directory identity. See D-089.

During the isolated demo, a server-resolved Maya administrator session exercises the same role/capability checks without pretending to be production authentication. This demo actor header is disabled outside demo mode. See D-014.

### Service integrations

- Calendar credentials and Home Assistant URL/token/raw mappings remain in access-restricted,
  external server files; SQLite, browser contracts and audit summaries retain only safe metadata.
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
- Missing, malformed or unreadable optional calendar/Home Assistant files disable only those
  adapters. Retain the original file for repair and warn without secrets for an invalid/unreadable
  existing file. Explicit load/test APIs remain strict; invalid authentication/security configuration
  never becomes an unauthenticated fallback.
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
GitHub Actions verifies that `linux/amd64` compilation alongside the code and Android gates.
Four isolated single-worker browser shards test the same run's compiled application; each uses a
disposable demo database, never private data or a shared live development server. Only after every
gate succeeds does the cache-backed publisher publish the server/web images to private GitHub
Container Registry packages tagged with the full
Git commit. Production Compose is pull-only; the DS920+ does not install pnpm dependencies or
compile native code during an ordinary update. A separate Compose override retains source builds
only as an explicit recovery fallback. Image publication is an outbound package operation and does
not give GitHub Actions network or credential access to the private household deployment.
`GET /api/v1/health` reports process liveness; `GET /api/v1/readiness` verifies SQLite and the latest
migration. The stable private hostname and trusted certificate remain commissioning inputs because
adult passkeys bind to that origin. See D-031.

The server creates routine database recovery copies. The explicitly authorized local NAS-owner
maintenance tool may also create a checked private online backup before access repair (D-097).
In private mode the server
uses SQLite online backup into the restricted data volume, verifies and prunes those files, and
serves only a typed aggregate status to authenticated adults. Restore is intentionally outside the
HTTP application: the production image contains a CLI that verifies a retained copy and writes it
to a new clean destination without overwriting an existing database. See D-043.

On Synology, the optional update agent is root-owned and blocks on a dedicated FIFO; it does not poll
GitHub or expose a socket. The unprivileged server selects the newest successful fixed workflow
release, while the agent independently accepts only a request ID and full hexadecimal commit. The
agent uses the existing pinned Compose/image helper, stops SQLite only for the final checked rollback
copy, health-checks the new containers and restores both database and image tags if activation fails.
Development has no agent and does not render update controls.

## Observability

- Structured server logs with request ID and actor/device ID, excluding secrets and sensitive event bodies by default.
- Public health endpoints distinguish process liveness and database readiness. Authenticated adult
  System Health adds safe migration, application-version and recovery-copy state.
- Audit events are household records, not merely logs.
- Home Assistant may monitor Hearth health and notify an adult after persistent failure.
- Retention and backup behaviour is configured and documented; actual Synology capacity/off-device
  monitoring and the live restore drill remain required before production use.

## Performance strategy

- Private calendar reads return the durable projection immediately and refresh the requested
  bounded date window in the background. One serialized worker coalesces repeated reads, retains
  at most eight pending windows, and publishes calendar invalidation after completion. Successful
  windows refresh after five minutes; failures back off for one minute. Configuration changes
  invalidate in-flight results so an obsolete connection cannot repopulate the cache.

- Server-rendering is unnecessary for the LAN TV application; use a static React build and cached API queries.
- Load the Today shell and cached household summary before secondary modules.
- Avoid large client state frameworks until real complexity requires one.
- Optimise images server-side into television-appropriate derivatives.
- Measure launch/resume and navigation on the target TV rather than optimising only desktop benchmarks.
