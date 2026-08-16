# Hearth v2 implementation roadmap

The roadmap is deliberately vertical. Each phase must leave a coherent, testable product state rather than a wide collection of unfinished modules.

## Phase 0 — Foundation and decision validation

### Work

- Re-read all authoritative documents and report contradictions before coding.
- Inspect available Node, pnpm, Java/Kotlin and Android tooling.
- Create the pnpm monorepo under `hearth/` with `apps/server`, `apps/web`, `packages/shared` and `packages/core`.
- Reserve `apps/tv` with documentation; do not let missing Android SDK block web/server progress.
- Add strict TypeScript, formatting, linting, tests and reproducible scripts.
- Establish original design tokens and seeded demo household data.
- Add a workspace-level `.env.example` without secrets.
- Add a concise `hearth/README.md` with verified setup/run/test commands.

### Completion criteria

- A clean install can run the web and server locally.
- Typecheck, lint, tests and production builds pass.
- No real provider credential is required.

## Phase 1 — Television interaction prototype

### Work

- Build an original Today surface using seeded data.
- Build Week calendar and Chores surfaces.
- Implement persistent TV navigation and complete D-pad/keyboard focus behaviour.
- Implement chore completion in an in-memory/fake adapter with undo.
- Build deliberate loading, empty, stale and offline demonstrations.
- Add responsive phone rendering for the same core information.
- Add Playwright flows for remote-equivalent navigation.
- Render and inspect 4K/1080 and iPhone viewports.

### Completion criteria

- A user can navigate Today → Week → Chores, complete a chore and return using only arrow keys, Enter and Escape/Back equivalents.
- Focus is always visible and stable.
- The Today screen is legible at a simulated three-metre distance.
- The interface is recognisably Hearth and does not imitate Skylight's layout or branding.
- Seeded state and error states are deterministic and testable.

## Phase 2 — Household core and persistence

Implementation note (2026-08-03): Phase 2 is implemented. The phone Admin area manages the household, people/roles, paired televisions and connection readiness. WAL-mode SQLite now persists setup, chore templates, generated occurrence snapshots, completion/undo/skip state, idempotent command receipts and audit events. One-time television pairing is independently revocable. Server-Sent Events invalidate open Today/Chores clients after commands. Restart, closed-database backup/restore, historical-template, duplicate-request and TV/adult/child/voice/automation permission tests cover the completion criteria.

Hardening note (2026-08-09): the runtime now distinguishes `demo`, `test` and
`private`, injects household/clock context, and publishes household-local today,
week and month values through `/api/v1/runtime`. Browser API paths and query
keys no longer embed the fictional household/date. Private repository
construction applies migrations without seeding Ezra, Maya or planning data and
shows an explicit setup-required state. The authenticated adult first-use action now verifies a
one-time external setup code and a user-verified passkey before transactionally creating the named
household, first adult and default lists. Private Admin uses the resulting revocable, hash-only
companion session; real enrolment remains blocked until the stable private HTTPS origin is approved.
Private household reads now share one server-side access boundary: runtime bootstrap redacts the
configured household until sign-in or pairing, companion sessions require `household.view`, paired
televisions require `household.read`, and the same protection covers photos and event streams.
Pairing-code generation remains fixed-width beyond 99 retained requests, while passkey option
issuance now combines per-client throttling, a global pending cap and physical expiry pruning.

Recurring chore editing remains intentionally out of the Admin UI until the denser phone-oriented administration work in Phase 4. Phase 2 establishes and tests its server/domain persistence contract without putting dense editing on the television.

Implementation extension (2026-08-08): People now changes profile photos through a phone-sized
square crop flow with direct drag and pinch/scroll zoom plus a keyboard fallback. Portrait and
landscape originals are normalized in the browser to a bounded 512×512 JPEG; typed adult-only
update/reset commands persist one derivative in SQLite with idempotency receipts and audit events.
Replace, restart persistence, restore-original, permission, malformed-image, migration-integrity
and rendered companion flows are covered without coupling member identity photos to the Phase 7
Synology gallery.

Polish extension (2026-08-10): System Health and More now open an adult-only Recent activity
projection over the existing audit table. It groups the newest changes into family-readable rows,
supports Family/Planning/Connections/System filters and keeps target/request identifiers and
secret-bearing fields out of visible copy. SQLite integration coverage proves cross-repository
events share the same feed; browser coverage exercises child denial, empty/unavailable states,
D-pad filtering, Back focus restoration, accessibility and light/dark phone layouts.

### Work

- Implement household, member, role/capability and paired-device domain models.
- Add SQLite migrations and repositories.
- Implement chore templates, occurrence generation, completion/undo/skip and audit events.
- Replace in-memory UI mutations with the typed API.
- Add request identifiers/idempotency for voice/automation-safe commands.
- Add Today summary query and real-time invalidation/update channel.

### Completion criteria

- State survives server restart.
- Historical occurrences remain correct after template changes.
- Duplicate completion requests do not double-award or corrupt state.
- Permission and audit tests cover TV, adult, child and automation actors.
- Backup and restore of a development database is demonstrated.

## Phase 3 — Calendar projection

Status: complete and locally verified. iCloud/CalDAV is the selected first
provider; credentialed live-read validation remains an owner-controlled setup
action and is not required in demo mode.

### Work

- Finalise provider-agnostic calendar contracts. **Complete.**
- Implement fake provider sync and recurrence/all-day test corpus. **Complete.**
- Add the selected provider read-only. **Complete for CalDAV/iCloud.**
- Implement sync status, stale cache and provider-error handling. **Complete.**
- Only after explicit approval, add scoped event writes and conflict handling.

### Completion criteria

- Multiple calendars render with owner/source identity.
- Provider outage leaves cached events usable.
- Perth local dates, imported DST events, all-day events and recurrence exceptions are tested.
- No real event is changed without approved write scope.

The completed slice includes multiple source/owner identity, durable SQLite
cache/cursor/window state, all-day and inclusive local-date projection,
recurrence exceptions, cancellation tombstones, imported-DST date tests and
offline/provider-outage recovery. The first real adapter uses HTTPS CalDAV,
server-side exact calendar allowlisting, bounded recurrence expansion,
family-safe error mapping and an external secret-config path. Contract tests
run the adapter through the persisted Today repository. No credentialed iCloud
read was attempted; that is a deployment validation item rather than missing
application code. Any calendar write scope remains separately deferred.

Implementation extension (2026-08-04): the owner approved Month after rendered
television evaluation. Month now uses the existing provider-neutral projection
through one typed 42-day query, compact colour-coded event titles with bounded
overflow, an avatar/colour source key, deterministic D-pad navigation and a
responsive Week/Month phone switch with a selected-date agenda. No calendar
credential, write scope or migration was added.

Implementation extension (2026-08-08): the missing companion calendar setup
workflow is implemented. Adult-only typed routes test an HTTPS CalDAV account,
return safe discovered calendar descriptors, persist exact selections/owner
mappings, replay duplicate saves, audit save/removal and expose connected state
without returning credentials. Private mode atomically updates the configured
external secret path and activates the managed read-only provider; demo mode is
fully fake and inert. Migration `0011_calendar_connection_setup.sql` persists
safe setup metadata only. A real iCloud credentialed read remains an explicitly
owner-controlled deployment validation action and has not been performed.

Implementation extension (2026-08-09): Calendar is now one primary television
and phone destination with Week, Month and a dedicated responsive Agenda view.
All three views share an explicit D-pad/keyboard switch and a direct source
setup link; legacy `/week` and `/month` bookmarks preserve query parameters
through redirects. Week and Month now have functional earlier/current/later
navigation, event selection opens a family-readable detail surface and Back
restores the exact event focus. Event time and timeline placement use the
runtime household timezone rather than a browser-side Perth constant. Phone
More now exposes family modules before grouped setup links, Home precedes Photos
on television, and duplicate pairing/settings wording has been removed.

Implementation extension (2026-08-09): **Today & notices** now provides
phone-first adult creation, editing and removal of expiring Standard/Important
household notices plus independent Dinner, List summary, Notice and Family
photo visibility. Migration `0013_notices_and_today_sections.sql` persists the
state; authenticated commands are validated, idempotent, audited and broadcast
through `today.changed`. Today rebalances its remaining bands without exposing
a layout editor. Demo reset isolation, SQLite restart, phone accessibility and
customised 1080p rendering are automated; live household copy remains a pilot
tuning decision.

Implementation extension (2026-08-10): Today now caps its calm television
columns at three event and three chore rows while exposing exact, focusable
overflow counts into Calendar Agenda and Chores. Event rows open calendar
details; Dinner, List summary and Family photo link to their real modules; and
Notice opens the full announcement in a Back-safe dialog. Automated remote-only
TV and phone flows prove focus restoration, responsive composition, accessibility
and clean console behaviour.

Implementation extension (2026-08-10): **Today & notices** now previews the
resulting TV and Phone compositions using current household content before an
adult leaves settings. Visibility switches update the preview optimistically
and execute serially, closing a rapid-toggle race that could previously restore
an older switch value. Loading/unavailable preview data stays honest without
blocking the independently persisted settings.

## Phase 4 — Lists, meals and pocket money

Status: complete and locally verified with deterministic demo household data.

### Work

- Lists, item completion/addition and phone-first adult list administration.
- Meal plan and saved meals.
- Required weekly pocket-money amount and payday for each child.
- Week-to-date chore proportion, amount due and immutable payment snapshots.
- Phone-oriented administration for recurring chores, meals and pocket money.
- Voice-ready typed commands for the new modules.

### Completion criteria

- Ordinary list and meal operations work from TV and phone where appropriate.
- Pocket-money payment and correction retries are idempotent. A child/week may receive multiple immutable partial disbursements, but the non-voided total cannot exceed the calculated amount due.
- Voice retries do not duplicate list items or chore completions.
- Dense editing remains out of the TV's primary interaction path.

Implementation note (updated 2026-08-10): Lists and Meals have D-pad television
surfaces and responsive phone presentations. The phone Family Planning area
creates, renames, colours, orders, archives and restores lists; edits, orders
and removes list items; and explicitly clears checked history. Meal administration now edits all
seven dinner names together, expands saved-meal/note details only when needed, copies or clears a
week with confirmation, and creates, searches, favourites, updates, archives and restores reusable
meals with optional preparation time and notes. Chore administration now creates explicit one-off
or recurring schedules, keeps the everyday list compact, confirms archive, restores from today's
local date and retains previously generated occurrence history through idempotent audited commands.
It also edits future recurring chores, optional available/due windows and their stable
top-to-bottom display order. A separate phone-first daily management surface
supports reasoned skip, excuse and adult reassignment, exposes snapshotted descriptions and
newest-first immutable history, and preserves the documented pocket-money denominator rules.
The schedule editor now accepts one or more people through a phone-friendly visual picker. The
existing template-assignee join table is returned as one grouped template and expands to one
independently completable occurrence per selected person, with legacy singular receipts normalized
at the contract boundary.
Television rows show compact window metadata in the saved order without exposing adult management
controls. It also manages child weekly amounts,
paydays, partial payment snapshots, history, week navigation and reasoned void corrections. Chores shows the current weekly completion
proportion and proportional amount due. Typed voice list commands resolve
the target without guessing, normalize exact duplicates and use persisted
idempotency receipts. Migration `0017_chore_occurrence_management.sql` adds the forward-only
description/due-time snapshots and targeted audit-history index; migration
`0018_chore_windows_and_order.sql` adds available-from time, deterministic template order and
historical occurrence snapshots. Migration `0009_pocket_money.sql` supersedes the active
reward implementation while retaining the old migration tables as dormant
history; active reward source contracts and runtime seeds are removed and chore completion/undo no longer writes star awards. Migration
`0014_pocket_money_payment_history.sql` adds optional payment notes, multiple
immutable disbursements and one audited void per payment. Unit,
Fastify/SQLite integration, migration, accessibility, remote,
offline, failure/retry and rendered-viewport tests cover the completion
criteria.

## Phase 5 — Home Assistant integration and Assist command API

Status: complete and locally verified with fake and private REST adapter contracts plus the adult
connection/mapping workflow. Live credentials, actual entity selection, Assist/Piper hardware and
presence/IR tuning are deployment validation work and were not performed.

### Work

- Implement Home Assistant server adapter and curated state projection.
- Configure allowlisted actions with validation, roles and confirmations.
- Implement Hearth command endpoints for Home Assistant scripts.
- Add deterministic Home Assistant Assist API flows for reading the day and completing a chore. Home Assistant owns capture, recognition and speech.
- Add presence/IR automation guard conditions.

### Completion criteria

- “Mark Ezra's dishwasher chore complete today” updates exactly one occurrence and returns the correct text for Home Assistant/Piper to speak.
- A generic protected-media signal from Home Assistant prevents automatic screen shutdown without exposing media metadata or controls in Hearth.
- Home actions cannot call unlisted services/entities.
- Home Assistant unavailability does not break calendars, chores or lists.

Implementation note (2026-08-03): the responsive Home surface projects only
living-room presence, TV power and a generic playback-protection signal. Three
actions map to fixed server-side script IDs, with idempotency, actor checks,
explicit Goodnight confirmation and audit events. Migration
`0006_home_assistant_projection.sql` caches the minimal state. The `/assist`
day-summary, list-item and chore-completion routes are structured entry points
for Home Assistant; Hearth contains no listening or speaking UI. Browser,
Fastify, SQLite, migration, focus/Back, accessibility and protected-playback
tests cover the completion criteria using the fake adapter.

Connection extension (2026-08-10): responsive **Connections > Home Assistant** administration now
tests `/api/config` and `/api/states`, presents only opaque friendly discovery choices, maps exactly
four safety states and three scripts, and can save/remove the connection without restart. The raw
URL, token and entity IDs are atomically stored only in an external mode-`0600` file; migration
`0019_home_assistant_connection_setup.sql` stores safe labels/status only. The live adapter reads
only the mapped state endpoints and calls only mapped scripts through `script.turn_on`. Shared,
runtime, repository, Fastify, migration, secret-redaction, phone, keyboard-Back and accessibility
tests cover this local boundary. Actual household commissioning still requires an approved current
Home Assistant backup and remains deliberately unperformed.

## Phase 6 — Android TV shell

### Work

- Create the Kotlin TV project and manifest/launcher resources.
- Implement the controlled WebView and secure origin/bridge.
- Implement one-time device pairing and credential storage.
- Implement Back/D-pad lifecycle, resume and recovery surface.
- Test on an Android TV emulator, then on the selected TCL television.

### Completion criteria

- Hearth launches from Google TV like a normal TV application.
- Overnight standby/resume restores a usable screen.
- Normal Google TV switching away from and back to Hearth restores sensible state/focus.
- Network and server outages show recoverable product UI, not a blank WebView.
- No integration secret is present in the APK/web bundle.

Implementation note (2026-08-04): the Kotlin shell, TV launcher manifest,
controlled WebView, exact-origin bridge, native pairing/revocation flow,
Keystore-backed credential encryption, Back callback, last-route restoration
and branded recovery surfaces are implemented. Android unit tests, lint, debug
APK assembly and minified release APK assembly pass against API 36. The API 36
Google TV emulator now has retained evidence for pairing, a 1920-pixel logical
viewport, D-pad complete/undo, Back/exit, process recreation, app switching,
sleep/wake, server recovery and revocation. Phase 6 remains in progress until
the selected TCL television passes the same checks, including a visible launcher
tile, actual network disconnect and overnight standby/resume. No media-launch or
Home Assistant bridge was added.

Browser-display extension (2026-08-16): Samsung M7 testing demonstrated that Tizen Browser exposes
WebAuthn but rejects resident credentials and an empty `allowCredentials` list. Private signed-out
Hearth now offers the same adult-approved short-code pairing outcome for non-Android television
browsers. The display generates the 256-bit secret with Web Crypto, keeps it only in volatile page
memory during approval, and receives a restricted persistent `HttpOnly` device cookie. The Android
shell remains the preferred Google TV installation because it additionally provides Keystore,
launcher, lifecycle and recovery guarantees.

## Parallel deployment workstream — Home Assistant voice and music

Status: planned and documented; not installed or verified on the live Pi,
Synology or selected TCL. This is household-infrastructure commissioning, not a
new Hearth application phase.

### Work

- Preserve and verify a restorable Home Assistant/Pi backup before changing the
  live appliance.
- Install the Music Assistant Home Assistant OS app and connect the official
  Home Assistant integration.
- Add Jellyfin as a Music Assistant music source with a dedicated
  least-privilege account kept outside this workspace.
- Add the TCL through native Google Cast for music, explicitly enable the
  television/video Cast player that Music Assistant disables by default, and
  add Android TV Remote for power, volume and approved app control.
- Name the Cast player `Hearth TV` and map the living-room Voice Preview
  Edition/area to that target when a request omits a room.
- Install and configure Music Assistant's custom local voice-support
  blueprints/intents; do not claim arbitrary song-starting is built into Home
  Assistant core.
- Extend the Home Assistant protected-playback helper so both native-app and
  Cast playback prevent presence-driven screen shutdown.
- Test wake, Cast takeover, metadata, eARC audio, pause/resume/stop/volume,
  ambiguous titles, loud-playback push-to-talk and recovery after Pi, TV and
  network restarts.

### Completion criteria

- “Play Dreams by Fleetwood Mac” heard by the living-room voice unit resolves
  through Music Assistant and plays on `Hearth TV` without naming the room.
- An explicitly named room/player overrides the living-room mapping.
- Playback uses Google Cast; no Jellyfin UI keypress or ADB automation is
  required.
- Home Assistant does not power off the panel while native or Cast media is
  active, and returns to normal presence policy when playback ends.
- Music Assistant or Jellyfin unavailability produces a clear voice failure and
  does not affect Hearth calendars, chores, lists or launch/resume.
- Jellyfin-source search, refresh, playlists and long playback pass a household
  reliability trial; if not, a separately approved read-only Synology
  music-share fallback is documented and tested.
- A Home Assistant backup containing the new configuration is restored in a
  safe test context.

## Phase 7 — Photos, ambient mode and production operations

Status as of 2026-08-10: in progress. The browser/server Photos slice is
implemented with an injected fake/local source, opaque asset contracts, a
forward-only photo migration, original mixed-orientation demo derivatives,
responsive full-screen collage templates with no skinny leftover strips, calm
30-second automatic and reduced-motion-safe occupant rotation, a three-image phone-landscape adaptation, ambient
slideshow, immediate remote exit, cached-source states and corrupt-image fallback. The private
server now includes the concrete read-only Synology-folder indexer, incremental fingerprinting,
orientation-correct display/thumbnail WebPs, opaque immutable asset routes, adult-only audited
manual scans, aggregate Admin status and persistent favourite/hide/restore curation. Hidden assets
remain indexed but are excluded from Today, gallery and ambient projections. A production-oriented two-container Synology
scaffold now builds and runs as both ARM64 and the DS920+ `linux/amd64` target,
with same-origin proxying, non-root/read-only processes, readiness gating,
forward migrations and clean shutdown verified locally. A three-job GitHub Actions gate mirrors
the complete web/server/browser suite, Android TV shell and production container image builds and
has passed on the release-checkpoint branch. Live Synology
commissioning, hostname/TLS and real-device passkey enrolment/recovery validation, approved live photo-folder
selection/mount and scan evidence,
Home Assistant presence/quiet-hours coordination,
restore evidence and the household pilot remain open; Phase 7 is not complete.

Adult-access extension (2026-08-15): private Admin now manages named adults with multiple passkeys,
independent credential revocation and a passkey-confirmed, 128-bit one-time recovery code. Recovery
creates a replacement passkey and revokes that adult's earlier credentials and sessions. Migration
`0020_adult_access_recovery.sql`, schema/route/repository tests and virtual-WebAuthn browser coverage
exercise the local contract; stable-hostname real-device enrolment and code recovery remain a live
commissioning gate rather than an unimplemented software flow.

Cross-cutting appearance extension (2026-08-05): Light, Dark and Automatic are
implemented as per-display browser/WebView preferences, with Automatic following
the device colour scheme. A separate evening-dimming switch reduces Hearth's
rendered glare without invoking Home Assistant or claiming television-brightness
control. More/Admin and the TV rail expose the same remote-safe controls. Unit,
accessibility, persistence, system-change, D-pad/Back and five-viewport rendered
checks pass; physical-TCL comfort assessment remains part of the household pilot.

### Work

- Commission the implemented Synology photo source against one explicitly approved read-only folder.
- Add ambient slideshow and screen/presence coordination.
- Commission the verified Docker/Compose scaffold on the approved private Synology HTTPS origin.
- Commission the implemented System Health and online-backup service, configure Synology's
  encrypted off-device copy, and perform the documented clean-location restore drill on the NAS.
- Conduct a household pilot and tune television readability/presence rules.

### Completion criteria

- Photos are attractive, correctly oriented and do not expose filesystem paths.
- The television never remains on indefinitely after the room is unoccupied.
- Backup restoration is performed, not merely documented.
- Synology, Pi, router and TV restart scenarios recover without developer intervention.
- The system passes `ACCEPTANCE.md` on actual target hardware.

## Deferred opportunities

- General conversational agent over the allowlisted command layer
- Dedicated local-AI mini-PC
- Native iOS companion
- Multiple households/remote family sharing
- Recipe/ingredient management
- Advanced energy and home-status visualisations
- Premium unified remote integration
- MCP adapter over existing authenticated application services
