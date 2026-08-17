# Hearth v2 decision record

Record durable choices here. New decisions should include date, status, context, choice and consequences.

## D-001 — Coexist with a root bargain finder

- Date: 2026-08-03
- Status: superseded on 2026-08-03
- Original choice: Reserve `hearth/` for the product so a Python bargain finder could remain at the repository root.
- Superseding context: The owner intentionally removed the bargain finder and confirmed this is a Hearth-only workspace. Hearth code remains under `hearth/` as the stable monorepo boundary, while the root retains authoritative project documents.
- Consequence: No bargain-finder Python regression gate applies to Hearth development.

## D-002 — Skylight-inspired outcomes, original product

- Date: 2026-08-03
- Status: accepted
- Choice: Match the useful family outcomes publicly associated with Skylight Calendar—calendar aggregation, chores/routines, rewards, meal planning, lists and photos—without copying branding, text, artwork or pixel-level UI.
- Consequence: Reference research informs scope; Hearth uses its own information architecture and visual system.

## D-003 — Television-first and touch-optional

- Date: 2026-08-03
- Status: accepted
- Choice: Target a landscape Google TV operated by D-pad remote, voice and iPhone. Touch is optional.
- Consequence: Every required workflow must work with six-key remote navigation; phone companion handles dense editing.

## D-004 — Native TV shell with shared web product UI

- Date: 2026-08-03
- Status: accepted
- Choice: Use a minimal Kotlin Android TV shell containing a controlled Hearth WebView and native bridge rather than a browser bookmark or duplicating the complete interface in Kotlin.
- Consequence: Hearth behaves as a native TV app while the family interface and phone companion share React/domain work. The bridge must remain narrow and secure.

## D-005 — Clear system ownership

- Date: 2026-08-03
- Status: superseded in part by D-019 on 2026-08-03
- Original choice: Synology hosts Hearth/Jellyfin/media; Pi 5 hosts Home Assistant OS, Music Assistant and voice; Google TV runs the visual apps.
- Retained consequence: The Pi is headless and outside the HDMI path. No new general server/streamer is required.

## D-006 — Domain ownership boundaries

- Date: 2026-08-03
- Status: superseded in part by D-019 on 2026-08-03
- Original choice: Hearth owns household organisation; calendar providers own calendar truth; Home Assistant owns devices/automations/voice; Jellyfin owns video; Music Assistant owns music playback.
- Retained consequence: Hearth owns household organisation, calendar providers own calendar truth and Home Assistant owns devices/automations/voice. Hearth does not reimplement adjacent systems.

## D-007 — SQLite-first deployment

- Date: 2026-08-03
- Status: accepted
- Choice: Use migrated SQLite in WAL mode on a Synology-local persistent volume for the initial single-household service.
- Consequence: Operations remain simple. A move to Postgres needs evidence and another decision.

## D-008 — Layouts are source code

- Date: 2026-08-03
- Status: accepted
- Choice: Do not recreate the prior visual layout-development system.
- Consequence: Product layouts are composed/tested in React. Configuration controls household content and permitted modules, not arbitrary grid geometry.

## D-009 — Local deterministic voice before LLM

- Date: 2026-08-03
- Status: accepted
- Choice: Ship core commands through Home Assistant Assist, Speech-to-Phrase/Piper and typed scripts before adding an LLM.
- Consequence: The initial product is fast, local and auditable. Any later model calls the same allowlisted action layer.

## D-010 — LAN/Tailscale-first security posture

- Date: 2026-08-03
- Status: accepted
- Choice: Keep Hearth private to the home network and Tailscale initially.
- Consequence: Public access, public OAuth callbacks or multi-tenant operation require a separate threat/security review.

## D-011 — No soundbar required at launch

- Date: 2026-08-03
- Status: accepted
- Choice: Evaluate the selected TV's built-in audio before purchasing a speaker. Sonos Beam Gen 2 is the preferred clean upgrade if needed.
- Consequence: Hearth software does not depend on Sonos or any media-player adapter. Audio remains a television/native-app concern.

## D-012 — iCloud through the CalDAV adapter is the first household provider

- Date: 2026-08-03
- Status: accepted
- Context: Read-only local account metadata identifies an active iCloud calendar store with household-labelled calendars. No event content or credential was inspected. A server-side standards adapter can support that source without coupling Hearth's domain model to Apple payloads.
- Choice: Implement the first real provider as a read-only RFC 4791 CalDAV adapter suitable for iCloud. The adapter is inert in demo mode and in private mode until an external server-only secret config explicitly names an HTTPS endpoint and an exact calendar allowlist. The allowlist has no broad default.
- Consequence: The provider choice no longer blocks Phase 3 implementation. Creating an app-specific credential, approving exact calendar names and performing a live read remain an owner-controlled setup/validation action; none is stored or performed in the workspace. Calendar writes remain absent until separately approved.

## D-013 — Node baseline and Phase 1 runtime boundary

- Date: 2026-08-03
- Status: accepted
- Choice: Require Node `>=22.12 <26` for the development workspace, use typed Fastify/Zod contracts with an injected in-memory Phase 1 repository, and smoke-test the forward-only SQLite schema separately.
- Consequence: Vite 8 and Fastify 5 run on the installed Node 25.9 toolchain; real persistence is deferred to Phase 2. A supported LTS Node container image must be selected and pinned before Synology deployment.

## D-014 — Named adult passkeys and one-time television pairing

- Date: 2026-08-03
- Status: accepted
- Choice: Companion administration uses named adult accounts with passkeys on a stable private HTTPS origin. A carefully controlled local recovery code may recover an adult account; Hearth never uses a shared admin token in a URL. Televisions request a short-lived code that an authenticated adult approves, producing an independently revocable, narrowly scoped device credential.
- Demo boundary: The isolated demo resolves Maya as an adult administrator through a demo-only server actor header so role and capability checks can be tested before a secure origin exists. Demo identity is disabled outside demo mode and is not production authentication.
- Consequence: The remaining deployment input is the private Synology/Tailscale hostname and HTTPS certificate path, not the authentication model. In private mode the bootstrap runtime withholds household identity until a valid companion session or paired-TV credential is presented, and every household read requires `household.view` or `household.read` respectively. Passkey option ceremonies are rate-limited, capped and pruned; fixed-width pairing codes do not exhaust after 99 retained requests. Children and guests remain server-side forbidden from configuration, and revoking one television does not affect adult companion sessions or other devices.

## D-015 — SQLite chore runtime and Server-Sent Events invalidation

- Date: 2026-08-03
- Status: accepted
- Choice: Implement the Phase 2 chore repository on the same migrated WAL-mode SQLite database as household setup. Generate daily/weekly occurrence snapshots lazily and idempotently by local date; commit commands, audit records and receipts in one transaction. Use same-origin Server-Sent Events for one-way household invalidation.
- Consequence: Chore state survives restart, template edits do not rewrite history, command retries replay safely, and open screens refresh without polling. The server retains an in-memory repository only for isolated tests. SSE carries identifiers and invalidation events rather than household payloads; clients refetch through the authenticated JSON API.

## D-016 — Provider-neutral durable calendar projection

- Date: 2026-08-03
- Status: accepted
- Choice: Normalize adapter events into a read-optimized SQLite projection with opaque Hearth IDs, source/owner identity, instants, inclusive household-local dates, recurrence master/exception metadata and deletion tombstones. Persist one opaque cursor and bounded sync window per connection; use cached rows whenever sync is stale or unavailable.
- Consequence: Today and Week do not depend on provider payloads or connectivity. Full bounded sync reconciles its requested window and incremental sync applies upserts/deletions. Raw provider errors and credentials never enter browser contracts. Calendar writes remain absent until the provider and explicit write scope are approved.

## D-017 — One audited planning command path and append-only rewards

- Date: 2026-08-03
- Status: reward portion superseded by D-027; shared command-path portion remains accepted
- Choice: Persist lists, saved meals, meal plans and reward definitions/ledger on the existing migrated SQLite household database. Send TV, companion and future voice operations through the same typed command services, actor/source checks, idempotency receipts and audit path. Resolve voice list names before mutation and refuse ambiguous targets; reject active normalized duplicates. Derive star balances from an append-only signed ledger, with corrections represented as uniquely linked reversal entries.
- Consequence: A retry cannot silently add a second list item or reward entry, a voice command cannot guess between lists, and reward history remains reconcilable after chore awards, undo, adjustments and reversals. Dense recurring-chore, meal and reward editing remains phone-first while TV list completion uses the same contract.

## D-018 — Bounded read-only CalDAV reconciliation before sync-token optimisation

- Date: 2026-08-03
- Status: accepted
- Choice: The first CalDAV adapter performs an RFC 4791 time-range query for only the requested household dates, asks the server to expand recurrence in that range and returns a complete bounded snapshot. Hearth reconciles the snapshot transactionally, hides removed sources and tombstones absent events before exposing the new cache. The adapter uses Basic authentication only over HTTPS and exposes no create, update or delete operation.
- Consequence: The real adapter satisfies the existing `CalendarProvider` bounded-sync contract with straightforward recovery semantics and no provider writes. RFC 6578 collection sync tokens remain a later performance optimisation after live iCloud profiling demonstrates a need; adding them will not change browser contracts or cache ownership.

## D-019 — Native Google TV media stays outside Hearth

- Date: 2026-08-03
- Status: accepted; external voice-music path clarified by D-022 on 2026-08-04
- Context: The owner clarified that the native Jellyfin app on Google TV should connect directly to the existing Jellyfin server on the Synology for music as well as movies and television. Earlier specifications had incorrectly expanded Hearth into a Jellyfin launcher and Music Assistant controller.
- Choice: Hearth has no Jellyfin or Music Assistant adapter, credential, connection card, library projection, playback surface or app-launch command. Manual media browsing is opened through normal Google TV navigation; D-022 separately permits Home Assistant/Music Assistant voice playback outside Hearth. Home Assistant may expose to Hearth only a generic protected-media-active signal for presence-aware power safety.
- Consequence: The `IntegrationState` public contract contains only Calendar and Home Assistant, Phase 5 contains Home Assistant and voice work rather than media work, and the Android TV shell needs no native-media launch bridge. Adding any Hearth media integration later requires explicit owner approval and a new decision.

## D-020 — Home Assistant owns voice; Hearth exposes typed Assist commands

- Date: 2026-08-03
- Status: accepted
- Context: “Local voice” was ambiguous enough to suggest that Hearth might own a microphone, wake word or speech runtime. The owner clarified that these belong to Home Assistant.
- Choice: Home Assistant Voice Preview Edition/iPhone, Assist, Speech-to-Phrase or Whisper, openWakeWord and Piper own voice capture, recognition, intent and speech. Hearth exposes authenticated, idempotent `/assist` JSON commands and returns deterministic family-readable result text. Hearth's Home screen can call only three fixed server-side Home Assistant script mappings: Evening, Goodnight and Screen Off.
- Consequence: Hearth ships no microphone/listening control, wake-word engine, speech recognizer or text-to-speech service. Home Assistant credentials and raw entity/service names remain server-side, protected native playback is represented only by a boolean power guard, and future LLM work can use only the same typed commands.

## D-021 — Exact-origin Android TV shell and television-held pairing secret

- Date: 2026-08-04
- Status: accepted
- Context: Phase 6 needed a real Google TV launcher and recoverable WebView
  without expanding Hearth into a general Android launcher or exposing a
  server-issued credential to React. Android's legacy JavaScript interface is a
  broader native attack surface, and deprecated encrypted-preference helpers do
  not provide the desired explicit key boundary.
- Choice: Build `app.hearth.tv` as a minimal Kotlin shell using Android Gradle
  Plugin 9.3.0, Gradle 9.5.0, API 36, AndroidX Activity 1.13.0 and WebKit 1.16.0.
  Production accepts one exact HTTPS origin; debug HTTP is limited to
  emulator/loopback hosts. Use an origin-allowlisted WebMessage listener for
  only app identity, network status and exit request. The TV generates a
  256-bit pairing secret, the server persists only its hash, and Android stores
  it with AES-256-GCM under a non-exportable Keystore key before native code
  installs an `HttpOnly`, `SameSite=Strict` WebView cookie. The native shell
  preserves the product's 1920-pixel logical TV canvas across Android display
  densities by combining an Android density-derived initial scale with an
  equivalent TV-only viewport declaration before React renders; cleartext debug command IDs use the cryptographic random-values
  fallback because UUID generation is secure-context-only.
- Consequence: Browser JavaScript and API responses never contain the raw device
  credential, revoking one television fails its next native session check, and
  the bridge cannot launch Jellyfin, invoke Home Assistant, evaluate arbitrary
  JavaScript or access files. Release signing remains external to the
  repository. Android unit/lint/APK gates are automated and the API 36 emulator
  lifecycle evidence is retained; the selected-TCL lifecycle run remains
  required before Phase 6 completion.

## D-022 — Voice-requested music is orchestrated outside Hearth

- Date: 2026-08-04
- Status: accepted
- Context: The household wants a local voice request such as “play Dreams by
  Fleetwood Mac” to start the correct music on the television. Opening the
  native Jellyfin app is easy at an app level, but reliably searching and
  selecting an arbitrary song through its Android UI would require brittle
  keypress/ADB automation. Music Assistant can instead search Jellyfin as a
  music source and stream the result directly to the television's Google Cast
  receiver.
- Choice: Install Music Assistant as a separate Home Assistant OS app when the
  owner approves live Pi changes. Connect it through the official Home
  Assistant integration, use a dedicated Jellyfin account as the music source,
  and prefer its native Google Cast player provider for the TCL. Explicitly
  enable the selected television/video Cast player because Music Assistant
  disables that player class by default. Treat the Jellyfin source as a tested
  first choice rather than a guaranteed dependency; its documented best-effort
  maintenance makes a separately approved read-only Synology music share the
  fallback if household reliability testing fails. Map the living-room Voice
  Preview Edition/area to a logical `Hearth TV` player so an omitted destination
  resolves there. Configure Music Assistant's community voice-support
  blueprints/custom intents because arbitrary voice-started music is not
  currently a built-in Home Assistant core intent. Keep this entire source,
  queue, target and intent path outside Hearth.
- Consequence: A successful voice request normally opens the Cast receiver and
  shows available track metadata rather than navigating the Jellyfin app.
  Hearth receives no library, query, queue, player or app state; it sees only a
  generic protected-media boolean that must include Cast playback. The native
  Jellyfin app remains available for ordinary browsing, and Home Assistant's
  Android TV Remote integration remains responsible for general television
  power/app control. Pi backup, installation, Jellyfin credential creation,
  entity mapping and physical-TV validation require separate live-system
  approval and evidence.

## D-023 — Month uses colour marks plus one identity key

- Date: 2026-08-04
- Status: superseded by D-024
- Context: The owner requested a Month calendar beneath Week and preferred not
  to repeat small faces in every event mark. A conventional event-card month
  would be unreadable at television distance, while colour alone would violate
  Hearth's accessible identity-cue rule.
- Choice: Render Month as a Monday-first six-week grid. Date cells contain only
  compact source-colour marks; a persistent Calendar key pairs each colour with
  its member avatar or the Family household mark and a text label. The API
  returns one typed 42-day projection, and the phone uses the same grid through
  a Week/Month switch.
- Consequence: Month remains glanceable and fits one television viewport without
  duplicating faces in every cell. Assistive date labels name the underlying
  events, and the provider-neutral calendar projection remains the sole data
  source. No new credential, calendar write or persistence migration is needed.

## D-024 — Month names events without repeating member faces

- Date: 2026-08-05
- Status: accepted
- Context: Rendered household review showed that colour-only marks answer whose
  calendar an event belongs to but not what the family needs to remember. Full
  miniature event cards or repeated faces would make the six-week television
  grid noisy, while a seven-column phone grid cannot carry sofa-sized titles.
- Choice: Keep the persistent avatar/colour Calendar key, but show compact
  colour-coded event titles inside television date cells. Bound each cell to two
  title rows at the main TV size and one at compact TV sizes, followed by an
  accurate `+N more` summary. Keep every title in the date button's accessible
  name. On phone, retain the familiar grid and expose all titles and times in a
  focused/selected-date agenda directly beneath it.
- Consequence: Month now answers both who and what at a glance without faces in
  every cell or unbounded cell growth. Dense days remain honest about hidden
  events, D-pad geometry and Back behaviour are unchanged, and the existing
  42-day provider-neutral response remains sufficient. No credential, calendar
  write, API-contract or persistence change is introduced.

## D-025 — One dedicated Synology folder is Hearth's photo source

- Date: 2026-08-05
- Status: accepted
- Context: Hearth needs a private, predictable photo source that the Synology can expose to the
  server without granting access to the household's wider photo library.
- Choice: Keep one explicitly approved Synology folder as Hearth's production source. Hearth
  indexes through a server-only adapter, stores opaque asset records and exposes only same-origin
  display/thumbnail derivatives. Demo mode uses five original fictional assets through the same
  public contract; private mode fails safe as unconfigured.
- Consequence: Local ownership remains on the Synology and the browser never receives an original
  file or filesystem path. The current ambient slideshow is local and exits on any remote key;
  Home Assistant presence/quiet-hours coordination remains a separate Phase 7 task.

## D-026 — Appearance is per display; evening dimming is independent

- Date: 2026-08-05
- Status: accepted
- Context: The owner requested a Hearth-wide dark mode after reviewing the light television and
  photo surfaces. A household-wide setting would make a phone unexpectedly restyle the television,
  while coupling visual comfort to Home Assistant's Evening action would confuse interface
  appearance with a physical-home scene.
- Choice: Store only `light`, `dark` or `automatic` plus an evening-dimming boolean in versioned
  local browser/WebView storage on each display. Automatic follows `prefers-color-scheme`; a small
  pre-render bootstrap applies the resolved theme before React starts. Dark uses a warm charcoal
  token set, leaves layouts and family identity cues intact and is available through companion
  More/Admin and a TV-rail utility. Evening dimming is a separate rendered overlay that also covers
  photos and ambient mode; it does not call Home Assistant or claim panel-brightness control.
- Consequence: Each television and companion can choose what suits its room, no server contract,
  credential, migration or household audit event is required, and a corrupted/unavailable storage
  value fails safely to Automatic. A future paired-device policy could remotely recommend a theme,
  but must not silently replace this explicit local choice.

## D-027 — Proportional pocket money replaces star rewards

- Date: 2026-08-06
- Status: amended by D-035
- Context: The owner does not want an abstract star economy or reward catalogue. Each child instead has a real weekly pocket-money amount, and parents need an honest running figure and a record of what to pay.
- Choice: Require an adult-configured weekly amount in Australian cents and payday for every participating child. For the Monday–Sunday week, calculate progress from completed chores divided by all non-excused, non-cancelled chores due through the selected as-of date. Apply that percentage directly to the weekly amount and round once to the nearest cent. Keep skipped chores in the denominator. Let an adult record one idempotent payment snapshot per child/week containing counts, percentage and amount. Remove star values from chore contracts and administration, remove reward routes/screens and stop chore completion/undo from writing reward-ledger entries.
- Consequence: Chores can show a child-friendly weekly percentage and amount due while phone administration owns weekly settings and payment recording. A later chore/template change cannot rewrite an existing payment. Migration `0009_pocket_money.sql` is forward-only; the migration-0005 reward tables remain dormant so existing databases are not destructively rewritten, but no active API or UI reads or writes them. D-017 remains authoritative for the shared typed/idempotent/audited command path and is superseded only for its reward-ledger choice.

## D-028 — Member profile photos are bounded local derivatives

- Date: 2026-08-08
- Status: accepted
- Context: Member avatars are identity cues across calendars, chores and pocket money. People had no
  way to change them, while the Synology family-photo gallery has different approval, orientation
  and ambient-display responsibilities. Sending an arbitrary original image to every client or
  storing filesystem paths would weaken local privacy and make television rendering unpredictable.
- Choice: Let adult administrators choose a browser-decodable portrait or landscape image in the
  companion People screen and position a square crop through direct drag and pinch/scroll zoom,
  with arrow-key, plus/minus and reset fallbacks rather than three visible range sliders. Normalize
  it client-side to a 512×512 JPEG, reject payloads over 1 MB or without valid JPEG framing, and
  store one derivative per member in SQLite. Preserve the member's prior opaque avatar key for
  restore. Serve the derivative through a versioned same-origin URL. Update and reset are typed,
  idempotent and audited; image bytes are excluded from receipts, responses and logs.
- Consequence: Member identity photos are editable, restart/backup safe and consistently shaped
  without retaining the selected original or coupling People to the Synology photo adapter. SQLite
  backups now include these small derivatives. Any future phone photo picker may feed the same crop
  contract without changing the stored derivative boundary.

## D-029 — Calendar setup writes an external secret, not browser or database credentials

- Date: 2026-08-08
- Status: accepted
- Context: The read-only CalDAV projection was complete, but connecting it
  required manually authoring a server JSON file. The Connections screen only
  described that process, so an adult could not add the calendar account from
  Hearth. Calendar setup also needed one clear authenticated account path that
  preserves exact server-side calendar allowlisting.
- Choice: Add an adult-only companion workflow for an HTTPS CalDAV server,
  account and app-specific password. Test/discovery occurs on the server and
  returns only opaque option IDs plus calendar names/colours. Keep the pending
  secret in memory for ten minutes, require exact calendar selection and
  optional person mapping, then atomically write the established external
  version-1 config file with mode `0600`. Persist only masked setup metadata in
  SQLite. Use a stable managed read-only provider so saving/removal can activate
  or disconnect it without restarting. Demo mode uses a fake verifier and never
  performs network access.
- Consequence: Calendar setup is usable and auditable without making a browser,
  SQLite backup or log a credential store. `HEARTH_CALENDAR_CONFIG_PATH` remains
  mandatory for a private save, and the supported connection is an authenticated
  CalDAV account. Live iCloud validation still requires the owner's app-specific
  credential and explicit approval, and calendar writes remain absent.

## D-030 — Runtime household and dates come from one server bootstrap

- Date: 2026-08-09
- Status: accepted
- Context: The polished browser still embedded the fictional household ID and
  Monday 3 August 2026 in API paths, query keys, focus targets and planning
  defaults. SQLite repositories also seeded demo records when started for a
  private household, which made the demo look complete while preventing an
  honest first-use state.
- Choice: Expose one browser-safe `GET /api/v1/runtime` contract containing the
  explicit `demo`, `test` or `private` mode, nullable configured household,
  household timezone/locale and server-derived local date, Monday week start
  and current month. Inject the clock and household selection at server
  composition. Demo and automated test modes use the fixed Perth instant;
  private mode uses the system clock and never seeds fictional household,
  member, planning, chore or pocket-money rows. The browser must load this
  dependency before household queries and derive query keys, routes, screen
  dates and focus entry from returned data.
- Consequence: Private startup is an explicit first-use state rather than Ezra
  and Maya, household renames/timezone changes update the runtime contract, and
  date boundaries are consistent on TV and phone. D-032 now implements the initial adult creation
  action behind the stable private HTTPS/passkey boundary; an unconfigured private database still
  shows an honest setup-required surface and accepts no demo bootstrap command.

## D-031 — Synology uses a hardened two-container same-origin deployment

- Date: 2026-08-09
- Status: accepted
- Context: Hearth needs a reproducible DS920+ deployment without mixing build tooling into the
  runtime, exposing Fastify directly, or choosing a permanent WebAuthn origin before the household
  approves its private hostname and certificate. A packaged SQLite ARM binary also proved that
  third-party native prebuilds can require a newer glibc than the pinned runtime.
- Choice: Build separate `server` and `web` images from one multi-stage Dockerfile. Pin Node
  24.18.0 Bookworm and nginx 1.30.4 Alpine bases, compile the SQLite binding inside the exact target
  Linux build, copy migrations into the production server, and gate the web service on database
  readiness. Run both services non-root with read-only roots, all capabilities dropped,
  `no-new-privileges`, bounded logs and private data/secret mounts. Bind nginx only to Synology
  loopback, proxy `/api` on the same origin and reserve DSM Reverse Proxy for the stable private HTTPS
  boundary.
- Consequence: Native ARM64 and emulated DS920+ `linux/amd64` builds and private first-use smoke
  tests pass locally without touching the NAS. The Synology service account/folders, stable private
  hostname, trusted certificate, adult passkeys, backup/restore drill and live commissioning still
  require explicit approval. No real household or provider data may be entered before those controls
  are complete.

## D-032 — Private first use establishes a named adult passkey session

- Date: 2026-08-09
- Status: accepted
- Context: Private mode could prove that no fictional household was seeded, but it had no secure
  way to create the real household or authenticate phone administration. A temporary hostname,
  shared admin URL token or browser-stored bearer credential would undermine the stable private
  WebAuthn boundary selected in D-014.
- Choice: Require `HEARTH_AUTH_RP_ID`, its exact `HEARTH_AUTH_ORIGIN` and an external
  `HEARTH_FIRST_USE_CODE_PATH` together. Rate limit and constant-time-check the one-time code before
  issuing a five-minute, single-use WebAuthn registration challenge. Require a discoverable,
  user-verified passkey. After verification, create the household, first adult administrator,
  Groceries/To-do lists, credential and audit record transactionally. Persist credential public-key
  material, counters, transports/device/backup state and only a SHA-256 digest of a random 30-day
  companion session. Deliver it as an `HttpOnly`, `Secure`, `SameSite=Strict` cookie; advance the
  passkey counter on authentication and revoke the session on sign-out. Keep television device
  credentials independent.
- Consequence: Private Admin no longer relies on demo actor headers and first use completes without a
  server restart, but real enrolment cannot happen until the permanent private HTTPS hostname and
  trusted certificate are approved. D-044 supplies the later second-adult/additional-passkey and
  locally confirmed recovery flow; real-device commissioning evidence remains required.

## D-033 — Calendar is one destination with three stable views

- Date: 2026-08-09
- Status: accepted
- Context: Week and Month occupied separate positions in the television rail,
  Agenda was only an incidental phone rendering of Week, and phone More jumped
  directly into administration. Calendar connection setup therefore existed
  but was hard to discover, while the primary menu gave two positions to one
  family outcome and hid ordinary family modules from the companion.
- Choice: Make Calendar one television rail/phone-tab destination and expose
  Week, Month and Agenda through one D-pad-safe view switch on both form factors.
  Use `/calendar/week`, `/calendar/month` and `/calendar/agenda` as stable paths;
  preserve old Week/Month links through query-preserving redirects. Add real
  earlier/current/later queries, household-timezone event formatting, a focused
  event-detail overlay with exact Back restoration and a direct Sources link.
  Put Home before the lower-frequency Photos destination. Make phone More a
  family-tools/setup hub, rename the admin root Hearth settings and keep pairing
  inside Televisions.
- Consequence: The primary navigation is shorter and outcome-led without
  removing any calendar view or saved link. Dense schedules have a genuine
  full-size Agenda surface, calendar setup is discoverable, and event/detail
  navigation is remote-safe. This changes browser routes and presentation only;
  provider contracts, credentials, read-only scope and database schema are
  unchanged.

## D-034 — Today supports bounded content choices, not layout editing

- Date: 2026-08-09
- Status: accepted
- Context: Dinner, list summary, notice and photo were always rendered, the
  seeded notice could not be changed, and hiding one item would otherwise tempt
  a general user-configurable grid that the product explicitly excludes.
- Choice: Add one phone-first **Today & notices** administration surface. Store
  four independent visibility booleans and durable concise notices with
  Standard/Important priority, start/expiry and archive state. Select the active
  notice on the server. Require authenticated administrator commands with Zod
  validation, request-id receipts, audit records and realtime invalidation.
  Keep plans and chores fixed and let code-defined summary variants rebalance
  the remaining content.
- Consequence: Families can remove irrelevant overview material and publish a
  useful notice without turning Hearth into a layout editor or moving priority
  logic into the browser. Private state survives restart; demo reset remains
  isolated. Rich acknowledgement/member targeting remains deferred until a
  real household need is demonstrated.

## D-035 — Pocket-money payments use immutable disbursements and reasoned voids

- Date: 2026-08-09
- Status: accepted
- Context: D-027 allowed only one payment snapshot per child/week. Real pocket money may be split
  between cash and transfer, paid in parts, or recorded against the wrong account. Parents also need
  to review earlier weeks without an erroneous record disappearing from history.
- Choice: Allow multiple positive, immutable payment disbursements for a child/week, each preserving
  chore counts, percentage, amount, actor, time and an optional parent note. Sum only non-voided
  rows and reject any command that would exceed the amount currently due. Correct a mistake with at
  most one separate adult-authenticated void containing a required reason; never edit or delete the
  original payment. Keep payment and void commands independently idempotent and audited. Permit
  recording before payday, but warn clearly. Drive command timestamps through the injected Hearth
  clock so demo evidence is deterministic and private mode uses real time. Remove the old reward
  schemas, repository methods and seeds from active source while retaining migration-0005 tables for
  forward-only upgrade safety.
- Consequence: Administration can show unpaid, partially paid and paid states, navigate weeks and
  retain an honest correction history after restart. Migration
  `0014_pocket_money_payment_history.sql` rebuilds the payment table without its old one-row-per-week
  constraint, adds optional notes and adds a one-to-one void table. D-027 still governs proportional
  calculation and supersedes stars, but its single-payment choice is replaced by this decision.

## D-036 — Synology photos use one read-only folder and opaque local derivatives

- Date: 2026-08-09
- Status: accepted
- Context: D-025 selected Synology as the family-photo authority but left the concrete private
  indexing and serving boundary open. The collage needs correct portrait/landscape geometry and
  slow automatic rotation without sending full originals, private NAS paths or a whole-library
  credential to the television.
- Choice: Mount exactly one adult-approved Synology folder read-only into the server. Ignore
  symlinks and bound discovery by depth, file count, size and decoded pixels. Store only a hash of
  each relative source identity plus a size/mtime fingerprint; use Sharp `autoOrient()` to create
  atomic, bounded WebP display and thumbnail derivatives in Hearth writable data. Serve them by
  opaque, immutable same-origin asset routes. Keep cached derivatives visible when the source is
  unavailable. Permit automatic interval rescans and an adult-companion-only, idempotent, audited
  manual scan that returns aggregate status—not a source path. Leave the adapter unconfigured when
  the environment path is absent; selecting and mounting the live folder still requires explicit
  approval.
- Consequence: The existing clever collage and ambient views can rotate real mixed-orientation
  family photos efficiently while Synology remains the original-file authority. Migration
  `0015_synology_photo_index.sql` adds incremental fingerprints and a status index. The initial
  adapter uses filesystem modification time for ordering/`capturedAt`; richer EXIF capture dates,
  hiding/favourite administration and any future phone import remain later, separately bounded
  work.

Implementation extension (2026-08-10): the existing favourite/hidden columns are now exposed only
through authenticated companion curation commands. Each favourite, unfavourite, hide or unhide is
validated, idempotent and audited. Scans preserve those flags; hidden assets are excluded from
Today/gallery/ambient projections but remain recoverable in adult administration through opaque
same-origin derivatives. No original, source path or delete operation crosses the boundary.

## D-037 — Meal administration is dinner-first and whole-week transactional

- Date: 2026-08-09
- Status: accepted
- Context: The television's two meal actions only displayed explanatory text and the phone edited
  one selected night at a time. Saved meals could be created but not searched, updated or retired,
  while exposing breakfast and lunch immediately would triple a form before the household had asked
  for those surfaces.
- Choice: Keep tonight and the seven-night dinner strip as the family television surface. Send its
  two management actions to one authenticated phone route where all seven dinner-name fields remain
  visible together and saved-meal/note details expand only when needed. Replace a displayed week's
  entries in one validated, transactional, receipt-idempotent command; add separately confirmed
  clear and copy commands. Treat saved meals as recoverable household records with search,
  favourite ordering, optional preparation minutes/notes and update/archive/restore commands.
  Retain breakfast and lunch as valid schema slots but defer their UI until household use justifies
  the added density. Keep recipes and ingredient-to-list generation deferred.
- Consequence: Planning several nights is materially faster on a phone, a retry cannot leave a
  partly updated week, and historical plans remain understandable after a saved meal is archived.
  Migration `0016_meal_planning_polish.sql` adds only bounded preparation metadata and an ordering
  index; the runtime repository still owns all command, receipt and audit transactions. Adding
  breakfast/lunch editing or grocery generation later requires demonstrated household need rather
  than a new integration boundary.

## D-038 — One-off chores and archived schedules share the occurrence model

- Date: 2026-08-09
- Status: accepted
- Context: Phone administration could edit simple recurring templates but could not schedule an
  extra job or retire a schedule. Hard deletion would lose household history, while restoring an
  archived recurring template with its old active range could manufacture jobs inside the paused
  interval when an adult later browsed those dates.
- Choice: Represent a one-off job as a normal chore template with `FREQ=ONCE` and equal household-
  local start/end dates. Use the existing archive column rather than deletion. Require separate,
  authenticated, receipt-idempotent archive and restore commands with audit events. Restore starts a
  new active window on a validated local date; for a one-off it moves the sole due date to that day.
  Previously generated occurrences remain unchanged. Keep multi-assignee schedules, due windows,
  reasoned excuse/reassignment and a history screen as later bounded work.
- Consequence: One-off and recurring jobs use one completion/pocket-money contract, retrying a
  lifecycle command cannot duplicate state, and a paused interval does not silently acquire chores.
  The existing schema already stores recurrence, active ranges and archive state, so this choice
  needs no migration.

## D-039 — Adult chore exceptions are reasoned occurrence commands

- Date: 2026-08-10
- Status: accepted
- Context: Completion/undo and future schedule editing were durable, but an adult could not fairly
  handle a school camp, illness or job swap without changing a template or losing the reason. A
  generic status edit would make pocket-money results hard to explain and could duplicate changes
  during a network retry.
- Choice: Keep television completion/undo unchanged. Add an optional `HH:mm` due time to templates
  and snapshot due time plus optional description onto generated occurrences. Require an
  authenticated adult, bounded reason and idempotent request ID for Skip, Excuse and Reassign.
  Skip changes pending to skipped and leaves it in the pocket-money denominator. Excuse changes
  pending/skipped to excused and removes it. Reassign moves pending/skipped work to another active
  household member and resets it to pending. Store the reason and safe prior/new member summary in
  the existing immutable audit event, and expose an adult-only occurrence-detail/history query.
- Consequence: The phone can explain and preserve one-day decisions without rewriting schedules,
  retries cannot duplicate the mutation/history, and pocket-money calculations remain
  deterministic. Migration `0017_chore_occurrence_management.sql` backfills description/due-time
  snapshots and adds the history lookup index. Multi-assignee templates and due windows remain
  separate later work; this decision completes the reasoned exception/reassignment/history portion
  deferred by D-038.

## D-040 — Multi-assignee schedules create one occurrence per person

- Date: 2026-08-10
- Status: accepted
- Context: The product specification and initial data model allowed a chore template to name one or
  more people, and migration `0003_chore_runtime.sql` already stored a set of template assignees.
  The public contract, SQLite mapper and phone editor nevertheless exposed only one person. Treating
  several people as sharing one completion would also make responsibility and proportional pocket
  money ambiguous.
- Choice: Make `assigneeIds` a non-empty, duplicate-free command field and return a grouped
  `assignees` array. For every due template/date/instance, generate one occurrence per selected
  active member. Each copy has its own completion, exception, audit and pocket-money state. Keep
  previously generated occurrence snapshots intact when the future schedule changes. Normalize old
  singular `assigneeId` requests and stored `assignee` command results at the schema boundary so a
  forward upgrade can safely replay existing idempotency receipts.
- Consequence: Parents author one schedule for a shared household responsibility while each child
  receives a clear, independently completable job. The existing join-table and occurrence-uniqueness
  constraints implement the choice without a new migration. Due windows and routine ordering remain
  separate later work.

## D-041 — Chore windows and order are snapshotted onto occurrences

- Date: 2026-08-10
- Status: accepted
- Context: A single due time could not express “after school but before dinner”, and implicit query
  order gave adults no dependable way to shape a child's television routine. Reusing the template's
  live values at render time would also silently retime and rearrange historical days.
- Choice: Give a chore template optional household-local **Available from** and **Due by** values,
  rejecting a two-ended window unless start is earlier than due. Store an explicit household-local
  `sortOrder`. Phone administration exposes labelled earlier/later actions and sends the complete
  active template order in one authenticated, receipt-idempotent command. New schedules append and
  edits keep their position. Snapshot the two time boundaries and order onto every generated
  occurrence; the television renders compact window text and follows the occurrence order.
- Consequence: Parents can shape a calm, predictable routine without a drag-only editor, while
  completions and historical views remain stable after future edits. Migration
  `0018_chore_windows_and_order.sql` backfills deterministic template order and occurrence snapshots
  and adds the household/order index.

## D-042 — Home Assistant setup uses opaque discovery and an external secret

- Date: 2026-08-10
- Status: accepted
- Context: The curated Home and Assist contracts already enforced Hearth's narrow product boundary,
  but private deployment still needed a usable way for an adult to connect Home Assistant and map
  household-specific entities. Returning raw discovery IDs or storing a long-lived token in the
  browser/SQLite would unnecessarily widen the credential boundary, while a restart-only config
  file would make safe setup difficult on a phone.
- Choice: Use a two-step adult-only test/save workflow. Test the private root address and long-lived
  token through Home Assistant's supported REST API, retain the credential and raw discovery result
  for at most ten minutes in process, and return only opaque option IDs with friendly labels/kinds.
  Save exactly four state mappings (occupancy, television power, Hearth foreground and generic
  protected playback) plus three scripts (Evening, Goodnight and Screen off). Atomically write the
  root URL, token and raw entity IDs to an external mode-`0600` JSON file and activate a managed
  provider without restart. Store only hostname, instance/version, friendly labels, readiness and
  timestamps in SQLite. Permit runtime reads only for the four mapped state endpoints and commands
  only through `script.turn_on` for a server-mapped script. Keep demo discovery fictional; require a
  current approved Home Assistant backup before live commissioning.
- Consequence: Companion setup is usable and auditable without exposing secrets or creating a
  general Home Assistant dashboard. Migration `0019_home_assistant_connection_setup.sql` contains
  credential-free metadata only. Hearth still has no media-player, Jellyfin, Music Assistant, Cast,
  arbitrary entity/service, microphone or speech surface; D-019, D-020 and D-022 remain authoritative.

## D-043 — Recovery copies use SQLite online backup and fail-safe restore tooling

- Date: 2026-08-10
- Status: accepted
- Context: Copying an active WAL database is not a reliable household backup, while exposing a
  generic filesystem or restore action in the browser would make an operational safeguard
  unnecessarily dangerous. Adults also needed calm visibility of database and recovery state
  without turning Hearth into a developer console.
- Choice: In private mode, create scheduled and adult-requested recovery copies with SQLite's
  online backup API inside a mode-`0700` directory, verify `quick_check`, foreign keys and schema
  version, make each retained database mode `0600`, and prune to a bounded configured count. Keep
  commands adult-only, request-idempotent and audited. Expose only state, time, size, retention and
  application/migration version to the browser—never a host path or downloadable database. Restore
  is an operator-only CLI operation that accepts absolute paths, verifies the source, writes only
  to a new destination and refuses to overwrite an existing database. Secrets and original photos
  remain separate recovery domains.
- Consequence: Hearth can stay in use while a consistent local database recovery copy is made, and
  a clean-location restore can be mechanically proved before live deployment. Admin gains a calm
  System Health surface, but swapping a restored database, Synology Hyper Backup, Home Assistant
  recovery and the real NAS restore drill remain explicit operator/approval work rather than web
  buttons.

## D-044 — Adult access uses named passkeys and one-time local recovery

- Date: 2026-08-15
- Status: accepted
- Context: Private first use created one adult passkey, but a household pilot also needs a second
  adult, a spare credential and a safe lost-device path. A shared password, invitation URL or
  recoverable plaintext code would weaken the LAN/Tailscale-first boundary selected in D-014 and
  D-032.
- Choice: Let an authenticated administrator enrol multiple independently named passkeys against
  any active adult household member and revoke them separately. Block revocation of an adult's
  final credential until recovery exists. Creating or replacing recovery requires a fresh
  user-verified assertion from the current adult, generates 128 random bits, displays the grouped
  code once, stores only its SHA-256 digest and expires it after 180 days. Recovery is single-use:
  a valid code creates a replacement discoverable passkey, consumes the code and revokes that
  adult's earlier passkeys and sessions. Do not use URL tokens or browser storage.
- Consequence: A family can add the second adult and recover from a lost phone without a common
  admin secret. Migration `0020_adult_access_recovery.sql` links new sessions to credentials and
  adds one-active-per-adult recovery records. The flow is implemented and virtual-WebAuthn tested;
  real-device use remains gated on the approved stable private HTTPS hostname and commissioning
  evidence.

## D-045 — Pre-commission display testing uses an isolated fictional-data pilot

- Date: 2026-08-16
- Status: accepted
- Context: The family needs to test the rendered product on the Samsung M7 before the permanent
  private HTTPS hostname, passkeys, backups and provider credentials are commissioned. Reusing the
  private Compose service with temporary authentication values would weaken the WebAuthn boundary,
  while putting real household data into an unauthenticated HTTP test would be unsafe.
- Choice: Provide a separate `hearth-v2-demo` Compose project that binds only to an explicitly
  supplied Synology LAN address, mounts its own demo database directory and uses the deterministic
  fictional household. It mounts no secrets or photo source, accepts no live calendar or Home
  Assistant configuration and must not receive a public reverse proxy or router port-forward.
- Consequence: The M7 can begin browser, layout and remote testing immediately without pretending
  that private commissioning is complete. The demo database can never become the private household
  database accidentally; real family data still waits for stable HTTPS, real-device passkey and
  recovery checks, encrypted backup and restore evidence.

## D-046 — Non-Android television browsers use restricted short-code pairing

- Date: 2026-08-16
- Status: accepted
- Context: The commissioned Samsung M7 Tizen Browser exposes WebAuthn but rejects discoverable
  resident credentials and an empty `allowCredentials` list. It cannot install the Android TV
  shell, and signing the shared display in as an adult would unnecessarily grant Admin capability.
- Choice: Offer an explicit browser-television pairing path alongside adult passkey sign-in. The
  display creates a 256-bit secret with Web Crypto, retains it only in volatile component memory,
  requests a short-lived six-character code and exchanges the secret only after an authenticated
  adult approves that code in Admin → Televisions. The server stores only its existing hash and
  sets the raw value directly as a persistent `Secure`, `HttpOnly`, `SameSite=Strict` device cookie.
  Never place it in a URL, local/session storage, response body, audit row or log. Clearing browser
  site data requires re-pairing; revocation remains per display.
- Consequence: The M7 can display the real private dashboard without a recovery code, adult passkey
  session or LAN-cleartext port. Browser JavaScript briefly creates and submits the secret during
  pairing, so D-021's stronger native-only secret boundary remains authoritative for Android but
  does not describe this explicit Tizen fallback. The Android shell remains preferred where
  available because it adds Keystore storage, launcher integration and lifecycle recovery.

## D-047 — Television UI targets a crisp 1080p application surface; 4K remains media-specific

- Date: 2026-08-17
- Status: accepted
- Context: The Samsung M7 has a 3840×2160 panel, but Samsung specifies a 1920×1080 application
  surface for UHD television apps. Amazon likewise directs Fire TV and Fire TV web apps to target
  1920×1080 while separately supporting 4K hardware-decoded video. Trying to make the dashboard
  claim native 4K would add device-specific complexity without increasing the application surface
  exposed by either platform.
- Choice: Keep one sofa-readable 1920×1080 logical television canvas. On genuine 3840×2160 browser
  viewports, use browser layout zoom rather than a transformed completed application layer. Keep
  approved photo display derivatives at up to 3840×2160, request the full display asset for the
  feature and ambient views, and preload the next full display asset. Do not encode photos into a
  synthetic video merely to reach a platform's 4K video plane; a future native ambient player must
  justify that extra transcoding, lifecycle and device-specific surface with real viewing evidence.
- Consequence: Samsung Browser, the Android/Google TV shell and Fire TV candidates share the same
  predictable layout and D-pad contract. Native streaming apps can still use their independent 4K
  video paths, but Hearth does not confuse that media capability with dashboard resolution. Device
  acceptance now prioritises typography, focus, overscan, image quality and stability at the actual
  application surface rather than a misleading pixel-count badge.

Official platform references:

- <https://developer.samsung.com/smarttv/develop/guides/fundamentals/managing-screen-resolution.html>
- <https://developer.samsung.com/smarttv/develop/guides/multimedia/4k-8k-uhd-video.html>
- <https://developer.amazon.com/docs/fire-tv/design-and-user-experience-guidelines.html>
- <https://developer.amazon.com/docs/fire-tv/4k-tunnel-mode-playback.html>

## D-048 — Chore grouping uses five fixed time-of-day values

- Date: 2026-08-17
- Status: accepted
- Context: The routine editor exposed a free-text **Routine group** field. Different labels such as
  “School morning”, “Before school” and “Extra jobs” described overlapping concepts, made television
  grouping unpredictable and did not explain what adults should enter.
- Choice: Rename the adult-facing field **Time of day** and use a native selector containing exactly
  **Morning**, **After school**, **Evening**, **Bedtime** and **Anytime**. Retain `routineLabel` and
  `routine_label` as compatibility names inside the existing API/database shape, but constrain the
  shared command and read contracts to the five values. Migration `0021_routine_time_of_day.sql`
  maps existing morning, after-school/afternoon, bedtime and evening/dinner labels to their canonical
  values and maps any other historical label to Anytime.
- Consequence: Phone, keyboard and remote authoring share an accessible native control; chores can
  be grouped consistently without inventing a separate Routine entity. Existing routine schedules
  and occurrence history remain intact, with only their display grouping normalized.
