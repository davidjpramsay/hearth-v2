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
- Status: superseded in part by D-052
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
  token set, leaves layouts and family identity cues intact and is available without administrator
  authentication through companion More and a TV-rail utility. The control changes only local
  browser/WebView storage and cannot mutate household data. Evening dimming is a separate rendered overlay that also covers
  photos and ambient mode; it does not call Home Assistant or claim panel-brightness control.
- Consequence: Each television and companion can choose what suits its room, no server contract,
  credential, migration or household audit event is required, and a corrupted/unavailable storage
  value fails safely to Automatic. A future paired-device policy could remotely recommend a theme,
  but must not silently replace this explicit local choice.

## D-027 — Proportional pocket money replaces star rewards

- Date: 2026-08-06
- Status: amended by D-035 and D-065
- Context: The owner does not want an abstract star economy or reward catalogue. Each child instead has a real weekly pocket-money amount, and parents need an honest running figure and a record of what to pay.
- Choice: Require an adult-configured weekly amount in Australian cents and payday for every participating child. D-065 supersedes the original as-of-date denominator. Apply the resulting percentage directly to the weekly amount and round once to the nearest cent. Keep skipped chores in the denominator. Let an adult record one idempotent payment snapshot per child/week containing counts, percentage and amount. Remove star values from chore contracts and administration, remove reward routes/screens and stop chore completion/undo from writing reward-ledger entries.
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
- Status: superseded in part by D-052
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

## D-049 — Weather uses a narrow server-side Open-Meteo adapter

- Date: 2026-08-17
- Status: accepted; coordinate-configuration detail superseded by D-051
- Context: Today and Week already had a browser-safe forecast contract, but private mode returned
  no forecast because only deterministic demo data existed. Routing weather through Home Assistant
  would widen its deliberately small allowlist and make a useful read-only cue depend on the Pi.
- Choice: Use Open-Meteo from the Hearth server with approximate latitude/longitude supplied only
  through the private deployment environment. Request current conditions plus daily maximums and
  WMO condition codes, normalize them into the existing four display conditions, cache successful
  responses for 30 minutes, coalesce concurrent reads and retain the last safe response during
  outage. Expose only a bounded provider identity so the browser can render the required visible
  attribution link; never expose or persist coordinates. Leave weather unavailable when either
  coordinate is absent rather than guessing from an address or calendar.
- Consequence: Weather works without credentials, a browser-side request or Home Assistant entity,
  while calendar/household content remains independent during internet failure. D-051 replaces the
  deployment-only coordinate setup with a household setting. A future provider change remains behind the same injected
  adapter and public forecast schema.

## D-050 — Calendar presentation mappings are editable independently of credentials

- Date: 2026-08-20
- Status: accepted
- Context: Calendar ownership could be chosen only while first entering the CalDAV account. A later
  reassignment incorrectly implied reconnecting and re-entering an app-specific password, while
  provider colours did not consistently match Hearth people.
- Choice: Permanently present every connected source as calendar name, assigned person and display
  colour. Save the complete mapping through its own authenticated, idempotent and audited command.
  Rewrite only the existing external allowlist owner mappings and the safe SQLite projection; retain
  URL, username and app-specific password unchanged. Derive browser/event colour and avatar from the
  current Hearth member, or use the fixed Whole family mark/colour for a null owner.
- Consequence: Adults can fix or evolve ownership without reconnecting, and member colour/avatar
  edits flow through Calendar identity. The command never receives credential material and remains
  read-only with respect to provider events.

## D-051 — Weather location is a tested household setting

- Date: 2026-08-20
- Status: accepted
- Context: Environment-only coordinates made ordinary weather setup inaccessible and forced server
  administration for a household preference. Weather geography and calendar timezone are related
  but not interchangeable.
- Choice: Keep timezone separate. Add an adult-only weather location section with Open-Meteo
  suburb/postcode search, one-time browser geolocation, direct-user-action Nominatim reverse
  labelling, Advanced coordinates, and a required live current-conditions test. Persist the chosen
  label/coordinates/source in migration `0022_weather_location.sql`; reconfigure the managed
  Open-Meteo provider immediately. Retain environment coordinates only as fallback when no row exists.
- Consequence: Families can configure and verify weather from the companion without Home Assistant,
  an API key or container editing. Coordinates appear only in adult settings and local SQLite, never
  in Today/Week/TV contracts, logs or provider audit summaries.

## D-052 — Managed phone uploads are the primary family-photo path

- Date: 2026-08-20
- Status: accepted
- Context: Requiring adults to discover a special Synology shared folder, copy files into it and
  manually request a scan made a normal household action feel like server administration. The
  folder also failed to explain clearly whether Synology Photos or Apple Photos albums were linked.
  Hearth already has an authenticated phone companion and a private writable data mount.
- Choice: Make **Add photos from this phone** the primary adult flow. Accept one bounded supported
  image per raw authenticated command, verify its decoded format, normalize an orientation-correct
  managed master plus 4K display and thumbnail WebPs, deduplicate by content hash and store only
  opaque keys under the private Hearth data mount. The browser may multi-select and upload files
  sequentially with partial-success feedback. Keep the existing adult-approved `/photos-source`
  mount only as an optional read-only bulk importer; an import failure must not mark managed storage
  unavailable. Do not connect to Apple Photos, accept shared-album links or retain client filenames.
- Consequence: Adults can add real photos entirely through Hearth, while local ownership remains on
  the Synology. Migration `0023_managed_photo_uploads.sql` records path-free managed metadata and
  optional import state. SQLite online copies protect metadata but not image files, so encrypted
  Synology backup must include the complete Hearth data directory, including `/data/photo-uploads`
  and `/data/photo-derivatives`. D-025 and D-036 remain valid for the optional importer and opaque
  derivative rules, but no longer make that folder Hearth's primary authority or setup prerequisite.

## D-053 — Pocket-money rules are standing settings, separate from week review

- Date: 2026-08-20
- Status: accepted
- Context: The repository already stores one amount and payday per child, but placing those fields
  inside a selected week's progress card and offering previous/current/next navigation implied that
  adults had to configure pocket money again every week. Future-week navigation also exposed no
  useful progress or payment action.
- Choice: Present amount and payday in a dedicated **Weekly settings** section that explicitly
  repeats until changed. Keep those controls available while reviewing history and always save them
  as the child's current standing rule. Replace three directional week buttons with one labelled
  **Week to review** selector containing the current week and recent past weeks only. Keep progress,
  payments and immutable payment snapshots scoped to the selected week.
- Consequence: Pocket money becomes set-and-forget while parents can still inspect and correct past
  payment records. Future-week setup is unnecessary, and changing the review week cannot alter or
  hide the standing amount/payday controls. D-035 still governs immutable disbursements and voids;
  its week-navigation consequence is narrowed by this decision.

## D-054 — Calendar selection edits reuse the private server-side credential

- Date: 2026-08-20
- Status: accepted
- Context: After initial connection, adults could change presentation mappings but could not add or
  remove provider calendars without replacing the connection and re-entering the app-specific
  password. Calendar selection is an allowlist preference, not a credential change.
- Choice: Add a separate adult-only **Edit calendars** action. The server loads the existing
  credential from the external owner-only secret file, performs provider rediscovery and stages a
  bounded ten-minute pending result. The browser receives only opaque option IDs, names, colours,
  masked account metadata and a test ID. Saving reuses the authenticated idempotent connection-save
  command to replace the exact allowlist and safe SQLite projection. **Replace connection** remains
  solely for account, endpoint or password changes.
- Consequence: Adults can evolve the selected source set without handling credential material. A
  failed saved sign-in directs them to replacement, and no username, password or collection URL is
  added to browser storage, SQLite, logs, receipts or audits.

## D-055 — Daily Bible verse is an optional, attributed server integration

- Date: 2026-08-20
- Status: accepted
- Context: The earlier Hearth had an ESV daily-verse module, and the household wants that calm
  glanceable outcome without restoring the old layout system or exposing its API credential.
- Choice: Add one off-by-default **Daily Bible verse** Today preference. Select one passage from a
  fixed small rotation by household-local date, fetch it through ESV's server-side passage-text API,
  retain the provider's short copyright marker and show full attribution in a Back-safe dialog.
  Read the token only from `HEARTH_ESV_API_KEY_PATH`; cache the bounded passage text in SQLite for
  stale fallback. Demo mode uses original fictional copy and contacts no provider.
- Consequence: The feature can be enabled per household without changing Today layout code or
  weakening secret boundaries. A missing key or ESV outage cannot take down Today. Migration
  `0024_daily_bible_verse.sql` adds only one visibility flag and the bounded cache; live token
  installation remains an owner-approved deployment action.

## D-056 — Synology pulls verified immutable images instead of compiling releases

- Date: 2026-08-21
- Status: accepted
- Context: The commissioned DS920+ has an Intel Celeron J4125 and approximately 4 GB of memory.
  Production updates were rebuilding the complete pnpm workspace and native `better-sqlite3`
  binding on that appliance even though GitHub Actions already built the same `linux/amd64`
  targets. This made routine updates slow and extended service downtime without adding assurance.
- Choice: Keep the multi-stage Dockerfile as the reproducible image definition, but publish the
  server and web targets to private GitHub Container Registry packages only after the complete
  web/server, Android and Synology-image verification jobs pass. Tag each package solely with the
  full immutable Git commit. Production Compose contains image references and no `build:` section;
  Synology authenticates once with a read-only `read:packages` credential, pulls both images while
  the existing containers remain available, then recreates the project and checks readiness. Keep
  `compose.build.yaml` as an explicit operator-only fallback for registry outages or recovery.
- Consequence: Native compilation and dependency installation happen on the GitHub-hosted amd64
  builder, not the NAS. Image publication is not live deployment: the workflow cannot reach the
  private Synology and receives no household credential. The NAS registry credential remains an
  access-restricted operational secret outside source, Compose and logs. Previous images are not
  automatically pruned, while database rollback remains restore-based when a migration is not
  backward compatible.

## D-057 — Agenda is a rolling today-plus-three-days surface

- Date: 2026-08-21
- Status: accepted
- Context: The dedicated Agenda was presenting the complete Monday–Sunday week even when today was
  late in that week. That made past dates prominent, duplicated Week navigation and pushed the most
  immediately useful plans below the first television viewport.
- Choice: Anchor Agenda to the configured household-local current date and render exactly today plus
  the next three calendar dates. Ignore legacy `start` query parameters on this route and remove its
  earlier/current/later controls. Week and Month remain the explicit surfaces for navigating beyond
  the immediate four-day horizon.
- Consequence: Agenda stays compact and useful across a week boundary without changing calendar
  provider contracts or stored data. The four columns fill a television row, phone keeps the same
  chronological groups, and event detail/Back focus behavior remains unchanged.

## D-058 — Today composition is derived from content and photo orientation

- Date: 2026-08-21
- Status: accepted; the fixed row-cap clause is superseded by D-063
- Context: A fixed lower row reserved excessive height for empty or short summary modules and placed
  portrait and landscape photos in the same geometry. Real household combinations therefore left
  dead space, pushed useful content below the television viewport and made Today behave like a web
  page that needed scrolling.
- Choice: Make television Today a deterministic single-viewport composition. Add normalized photo
  orientation and optional source dimensions to the browser-safe `TodaySummary` photo contract. Portrait photos occupy a substantial
  right-side rail spanning the dashboard; landscape and square photos use a shorter wide lower panel;
  no-photo layouts return the full width to one-to-four compact summary tiles. Upcoming and due
  chores share equal content columns, heading baselines and first-row rails. Portrait media starts
  on the same upper rail; landscape/square media starts on the same lower rail as the optional bands.
  Optional bands follow the actual core content rather than being pinned to the viewport bottom.
  Begin with a three-row event/chore cap and existing focus graph. D-063 later makes that cap
  composition-aware. Do not expose layout controls or carry the non-scrolling constraint into the
  phone companion.
- Consequence: Today responds to real enabled content without becoming a layout editor, keeps every
  module visible on supported television viewports and preserves undistorted photography. New photo
  producers must supply normalized orientation, while old private state needs no database migration
  because orientation is derived from stored image dimensions.

## D-059 — Photos collage geometry follows every visible asset's orientation

- Date: 2026-08-21
- Status: accepted
- Context: The Photos gallery selected a template from only the featured image and forced every
  support photo into the remaining rectangles. Real portrait photos were consequently displayed in
  landscape-shaped cells and lost important content to `cover` cropping, while portrait-heavy sets
  produced narrow strips merely to preserve a fixed five-photo count.
- Choice: Select and place visible occupants using each photo's stored pixel dimensions. Keep the
  selected image as a full-height anchor and search one to three support-column groupings for the
  composition closest to the television stage. Each image leaf retains its exact native ratio;
  negative page space is preferable to crop, stretch, a persistent frame, shadow or backing card.
  Phone portrait flattens the same occupants into orientation-aware spans, while phone landscape
  keeps three substantial occupants. Preserve automatic rotation, selection, ambient mode and
  geometry-derived D-pad links.
- Consequence: Portrait files remain legible without being cut into landscape frames, landscape
  files do not become ribbons and each supported television composition stays within one viewport.
  Up to five photos can remain visible even for portrait-heavy sets because the layout is derived
  from real ratios rather than a fixed set of portrait and landscape slots.

## D-060 — Today photo rotation is slow and display-local

- Date: 2026-08-21
- Status: accepted
- Context: A single Today photo could remain unchanged indefinitely even though the approved family
  collection contained other useful images. Reusing the gallery's 45-second cadence would make the
  household overview feel active and distracting, while a separate unexplained pause setting would
  make the two photo surfaces disagree on the same display.
- Choice: Advance Today after five minutes of visible screen time when at least two approved photos
  exist. Recompose Today from each next asset's normalized orientation. Share one in-memory
  Pause/Resume state with the Photos gallery for the current display session; do not persist it as
  household or device configuration. Stop the timer while the document is hidden and leave the
  preview static when reduced motion is requested. A reload begins a fresh automatic session.
- Consequence: Today gently circulates family photos without behaving like ambient mode. Pausing the
  gallery predictably freezes Today, hidden time cannot cause an immediate surprise change on return,
  and no database migration or browser contract is required.

## D-061 — Managed uploads and folder imports have different deletion authority

- Date: 2026-08-21
- Status: accepted
- Context: Adults need an efficient way to remove obsolete family photos. Treating the optional NAS
  folder as Hearth's only store would weaken the primary phone-upload path, while allowing Hearth to
  delete through a bulk-import mount would make source ownership and backup behaviour unsafe.
- Choice: Keep phone uploads as Hearth-managed assets and the optional Synology folder as a read-only
  secondary bulk source. Adult Photos administration identifies each source and supports bulk
  selection. Any asset may be hidden or restored, but only a managed upload may be permanently
  deleted by Hearth after explicit confirmation. Imported originals are removed in Synology and then
  reconciled with **Check folder**. Deletion uses the typed authenticated command, idempotent receipt
  and path-free audit contract.
- Consequence: Adults can curate large collections quickly without risking NAS originals. Managed
  deletion removes the private master and derivatives, while historical receipts and audits remain.
  Backups may retain an earlier copy according to their normal retention policy; the active library
  no longer serves the deleted asset.

## D-062 — Calendar refresh combines realtime invalidation with a five-minute safety cycle

- Date: 2026-08-22
- Status: accepted; supersedes only D-015's statement that open screens refresh without polling
- Context: SSE refreshes an open display promptly after Hearth-owned settings or household changes,
  but it cannot detect every provider-side iCloud change and a dropped realtime connection must not
  leave an appliance display stale indefinitely. Requiring a manual reload is not dependable.
- Choice: Today, Week and Month fetch immediately when mounted, every five minutes while visible and
  immediately after browser connectivity returns. Calendar connection saves, source-selection
  changes, owner remaps and removal invalidate all three projections immediately. Keep the existing
  `calendar.changed` SSE invalidation for cross-device responsiveness. Each server read attempts the
  bounded provider sync and falls back to the durable SQLite projection when iCloud is unavailable;
  the browser also retains its last successful query data during a failed background request.
- Consequence: Provider-side changes appear within five minutes without user action, Hearth-owned
  settings changes remain immediate, reconnect recovery is deterministic and a temporary iCloud
  outage does not blank the family calendar. The five-minute interval is a resilience backstop, not
  a general high-frequency polling architecture, and it pauses when the document is hidden.

## D-063 — Today row capacity follows the photo composition

- Date: 2026-08-24
- Status: accepted; supersedes only D-058's fixed three-row cap
- Context: Three rows leave useful vertical capacity unused beside portrait photography and when no
  photo is enabled. Raising every layout to five instead pushes landscape photography and optional
  modules beyond supported television viewports or makes the family image unacceptably small.
- Choice: Derive one shared Upcoming/Chores capacity from the active display and normalized photo
  orientation. Phones show three rows. A landscape-photo television shows four rows at full height
  and three on a compact 768-pixel display. Portrait and no-photo television compositions may show
  five; a square image shows five at full TV height and three on the compact display. Slice the typed data
  before rendering so exact overflow counts and D-pad links describe only controls that are visible.
- Consequence: Busy portrait/no-photo dashboards expose more useful work without scrolling, while
  landscape images remain substantial. Photo rotation can recompose the row count together with the
  image orientation, and every hidden item remains reachable through the existing overflow action.

## D-064 — iCloud Reminders requires standards capability evidence before product integration

- Date: 2026-08-24
- Status: accepted
- Context: [CalDAV](https://www.rfc-editor.org/rfc/rfc4791.html) defines `VTODO`, but Apple documents
  [upgraded iCloud Reminders](https://support.apple.com/en-ca/102457) separately and its
  [third-party iCloud access](https://support.apple.com/en-gb/121539) covers Mail, Calendar and
  Contacts rather than Reminders. Treating the existing iCloud app-specific credential as proof of
  Reminders access would risk promising an unsupported integration or probing private endpoints.
- Choice: Add one operator-only, read-only capability probe using the existing server-side CalDAV
  credential. Discover all collections, query only those that explicitly advertise `VTODO`, bound
  samples to at most ten items and omit credentials, URLs, UIDs, descriptions and raw DAV payloads
  from output. Add no browser route, persistence, polling or mutation. Stop when no task collection
  is advertised; do not scrape or guess Apple endpoints. Any later EventKit companion bridge or
  CalDAV reminders product surface needs separate approval and a new typed contract.
- Consequence: Hearth can establish whether the household account exposes standards-based tasks
  without weakening its calendar secret boundary or silently expanding product scope. A successful
  diagnostic is evidence for further design, not an automatic implementation commitment; an empty
  result closes the direct CalDAV path unless Apple publishes a supported change.
- Clarification (2026-08-25): WebDAV `DAV:href` values may be URI or relative references. Resolve
  them only against the advertised collection, compare decoded path segments for equivalent
  percent-encoding, and ignore an exact collection-self response. Different origins, sibling or
  parent paths, embedded credentials, fragments, queries, encoded separators and nested children remain
  rejected before object retrieval.
- Live result (2026-08-25): the commissioned account advertised two `VTODO` collections, but the
  bounded read returned two duplicated legacy/other records and none of the newly created current
  test reminders. Direct CalDAV is therefore rejected as a reliable modern iCloud Reminders source.
  Apple's Calendar guide separately confirms that its native macOS Calendar app can view, create,
  edit and complete scheduled reminders, but documents no corresponding CalDAV or app-password API.
  Reconsider direct server sync only if Apple documents a supported server API; otherwise a future
  permissioned native companion bridge is the appropriate boundary.

## D-065 — Pocket-money progress uses the complete weekly schedule

- Date: 2026-08-24
- Status: accepted; supersedes D-027's as-of-date denominator
- Context: Counting only chores due through today makes one completed Monday chore appear as 100%
  even when that child has more work scheduled later in the week. That overstates both progress and
  the amount earned from a fixed weekly allowance.
- Choice: For every current or historical Monday–Sunday week, load all seven days and calculate the
  percentage from completed occurrences divided by the complete non-excused, non-cancelled weekly
  schedule. Keep future pending occurrences and skipped occurrences in the denominator. Retain the
  as-of date only for payday state, command timing and the immutable payment snapshot timestamp.
- Consequence: Progress begins below 100% when work remains later in the week and rises as the child
  completes the whole schedule. Editing a future recurring schedule can change an unpaid current
  week's denominator, while existing immutable payment snapshots remain unchanged.

## D-066 — Normal Synology releases use a fixed root-owned activator

- Date: 2026-08-24
- Status: accepted with explicit owner approval
- Context: Repeated interactive `sudo` prompts were unreliable in Codex and DSM browser workflows,
  causing failed or confusing deployments. Storing the administrator password, granting a
  passwordless shell or granting unrestricted Docker access would violate Hearth's credential and
  least-privilege boundaries.
- Choice: Use one final owner-entered, non-echoing `sudo` prompt to install a root-owned
  `/usr/local/sbin/hearth-v2-activate-staged` command and root-owned production Compose/environment.
  Permit the named deployment user to run only that command through `sudo -n`. The command accepts
  no release argument, reads one validated 40-character staged marker, operates only the fixed
  Hearth Compose project, reapplies the root-owned narrow Docker-firewall rules and waits for
  readiness before recording the release. Refresh the helper
  deliberately whenever the canonical production Compose changes.
- Consequence: Routine verified releases can be launched and checked entirely from Codex without
  handling a password, while the NAS does not gain a reusable root task, passwordless shell or
  unrestricted Docker privilege. Removing `/etc/sudoers.d/hearth-v2-release` disables this path.

## D-067 — DSM forwarding permits Docker-origin traffic without bypassing inbound policy

- Date: 2026-08-25
- Status: accepted with explicit owner approval
- Context: DSM places its host-oriented `FORWARD_FIREWALL` catch-all drop before Docker's generated
  `DEFAULT_FORWARD` chain. That blocked ordinary bridge, DNS and outbound container traffic and
  required fragile Hearth-subnet exceptions. The live audit confirmed qBittorrent independently
  shares Gluetun's network namespace, Docker keeps its own bridge-isolation chains and unsolicited
  inbound traffic should remain subject to DSM's LAN, Tailscale and port rules.
- Choice: Keep DSM's input and forwarding firewall. Add one idempotent `FORWARD_FIREWALL` return
  rule matching only the input interface pattern `docker+`, positioned after established traffic.
  Packets from a Docker bridge may then continue into Docker's own `DOCKER-USER`, isolation and
  published-port policy. Do not match Docker output interfaces and do not reorder `DEFAULT_FORWARD`
  ahead of DSM, because those alternatives could weaken unsolicited inbound filtering. Remove the
  superseded Hearth-subnet and resolver exceptions. Apply the rule once at boot and after verified
  container replacement; run no polling watchdog.
- Consequence: Normal Docker-origin bridge, DNS and outbound traffic works across current and future
  Docker networks without per-application subnet rules. LAN/Tailscale/WAN-origin traffic remains
  gated by DSM before Docker, Docker continues to isolate bridges, and qBittorrent remains bounded
  by Gluetun's own namespace and kill switch. An explicit DSM firewall reload still requires one
  hook invocation and readiness verification.

## D-068 — Modern iCloud Reminders use a native EventKit companion proof

- Date: 2026-08-25
- Status: accepted and physically validated for the read-only proof
- Context: The commissioned CalDAV capability probe found advertised `VTODO`
  collections but did not expose the owner's newly created current Reminders
  or Family Reminders test items. Reopening that server-side path would weaken
  the established calendar credential boundary and still would not be a
  reliable modern Reminders source. Apple documents EventKit as the native
  permission-controlled route and requires full Reminders access for apps that
  read existing reminders on iOS 17+; Apple does not offer a read-only EventKit
  permission.
- Choice: Build the first native SwiftUI companion proof under
  `hearth/apps/ios`. A narrow `ReminderStore` protocol has a real EventKit
  adapter and deterministic fake adapter. The app requests
  `requestFullAccessToReminders`, enumerates `calendars(for: .reminder)`, lets
  an adult select lists and displays reminder title, list, due date/time and
  completion state. The app performs no EventKit mutation and has no server
  writes, background sync, APNs, two-way completion or web session in this
  slice.
- Consequence: A physical iPhone is the only evidence that the owner's current
  Apple Reminders lists and test reminders can be read. Simulator evidence is
  limited to UI wiring and fake-driven states. That physical proof passed on
  2026-08-25 on an iPhone 17e running iOS 26.6; completion was visible but not
  mutable in Hearth Companion. The eventual installed Hearth
  Companion may combine native Apple integrations with the existing responsive
  web administration UI; WKWebView versus opening an authenticated web session
  remains a later evaluated choice. No Apple ID, app-specific password, private
  URL or NAS credential enters Hearth.

## D-069 — Foreground EventKit changes refetch selected reminders without layout replacement

- Date: 2026-08-25
- Status: accepted for the native Reminders proof
- Context: EventKit documents that `EKEventStoreChanged` can invalidate fetched
  reminders and that clients should refetch. A manual pull was also replacing
  the complete success layout with a loading skeleton, causing a brief visual
  flicker when the user pulled repeatedly.
- Choice: Keep a narrow change stream on `ReminderStore`. The EventKit adapter
  yields when its `EKEventStore` changes; the view model debounces the signal,
  refetches the selected lists while the companion is foregrounded, and also
  refetches on foreground entry. When a prior snapshot exists, the view model
  preserves it while the read is in flight and exposes the refreshing state only
  to interaction controls.
- Consequence: Changes made in Apple Reminders while Hearth Companion is open
  appear without a manual pull, with manual refresh retained as a fallback.
  The physical run observed approximately nine seconds for one remote change
  and five seconds for a Mac completion change, and the previously reported
  repeated-pull flicker was no longer visible.
  This is not persistent background sync or APNs. Apple Reminders Sections are
  not synthesized because EventKit does not expose their hierarchy.

## D-070 — Reminder list selection is an app-local opaque preference

- Date: 2026-08-25
- Status: accepted for the native Reminders proof
- Context: Requiring an adult to reselect EventKit lists on every launch makes
  the native proof unreliable, but retaining reminder content would create a
  new cache and privacy boundary that this slice does not need. An empty saved
  set must also remain distinguishable from a first launch with no preference.
- Choice: Inject a narrow `ReminderListSelectionStore` separately from
  `ReminderStore`. The live adapter stores only sorted EventKit list identifiers
  in app-sandboxed `UserDefaults`; tests and previews use an in-memory adapter.
  A missing preference selects all lists after the first successful non-empty
  EventKit list read. A saved empty set remains empty, and every successful read
  intersects saved identifiers with the currently available lists before saving
  them again.
- Consequence: The adult's selection survives relaunch without storing reminder
  titles, dates, completion states or Apple credentials. Removed list identifiers
  fail closed and are pruned. This local preference is not a Hearth server
  snapshot, pairing credential, background upload, APNs state or writeback
  contract; the versioned server bridge is governed separately by D-071.

## D-071 — Native EventKit bridge uses a device-scoped full-snapshot contract

- Date: 2026-08-25
- Status: accepted; implements the native path identified by D-064
- Context: The commissioned CalDAV capability check did not expose current Apple Reminders, while a
  physical iPhone EventKit build successfully read current personal and shared family lists. Hearth
  needs a durable server contract before the iOS task adds network assumptions, and the eventual
  full native client must not fork household business rules or receive a broad credential merely to
  bridge reminders.
- Choice: Freeze `REMINDERS_COMPANION_CONTRACT.md` as wire version 1. Pair one EventKit source per
  household through an adult-approved ten-minute code and a device-generated Keychain secret whose
  server-side form is hash-only. Grant that device exactly `reminders.snapshot.write` through the
  distinct `HearthReminderSource` authorization scheme. Accept bounded full snapshots only, with a
  strictly increasing gap-tolerant sequence, immutable idempotency identities, internal tombstones,
  atomic projection/audit/receipt writes and stale-cache retention. Hash source identifiers before
  persistence and omit them from household reads. Keep the projection read-only and omit Apple
  Reminders Sections and unsupported content. Use hand-written Swift `Codable` DTOs checked against
  committed language-neutral fixtures until a stable generated-schema path exists.
- Consequence: The iPhone bridge can begin without schema drift or Apple credentials on Hearth. A
  revoked source cannot act as a television/adult client, temporary unavailability does not erase
  family information, and the later native iPhone app can use ordinary passkey-authenticated Hearth
  services alongside this narrow source transport. V1 requires full-list enumeration and caps one
  snapshot at 50 lists, 1,000 reminders and 1.5 MB; incremental sync, APNs/background transfer,
  EventKit mutation and full native feature parity require later evidence and decisions.

## D-072 — Reminders are a conditional read-only destination with a bounded Today summary

- Date: 2026-08-26
- Status: accepted and implemented
- Context: The EventKit bridge now provides a durable household projection, but exposing all
  reminders inside Today would crowd the appliance dashboard and showing an empty primary
  destination before the first snapshot would imply a working source that does not yet exist.
- Choice: Add one dedicated Reminders destination only after the active source is `current` or
  `stale`. Group the shared household projection by list, default to incomplete reminders and offer
  an explicit read-only **All** filter for completed rows. Add a default-on but independently
  configurable Today module containing only incomplete reminders whose source-local due date equals
  the household local date. Keep the module bounded and link it to the dedicated destination. Do
  not add complete, edit, delete or writeback controls.
- Consequence: Television, responsive web and the future native client can consume the same typed
  household read model without duplicating business rules. Temporary iPhone/iCloud failure leaves
  cached reminders visible with honest freshness, while unpaired, awaiting-first-snapshot and
  revoked sources do not create misleading navigation or Today content. Migration
  `0026_today_reminders.sql` stores only the visibility preference and no reminder content.

## D-073 — Today settings use direct controls without a simulated dashboard

- Date: 2026-08-26
- Status: accepted and implemented
- Context: The embedded TV/Phone Today preview repeated a large amount of the real dashboard inside
  the phone-first administration page, made the page unnecessarily long and was less trustworthy
  than checking the actual responsive Today destination.
- Choice: Remove the embedded Preview section, its secondary Today-summary query and its preview-only
  rendering code. Keep the six section switches, serialised optimistic persistence and notice
  administration unchanged. Treat the actual Today page as the authoritative rendered result.
- Consequence: Today administration is shorter and performs one fewer query. Layout behaviour remains
  covered on the real Today page across module subsets, photo orientations and supported viewports.

## D-074 — Apple Reminders use best-effort iOS background refresh

- Date: 2026-08-26
- Status: accepted and implemented; physical scheduling latency not yet measured
- Context: Foreground `EKEventStoreChanged` observation is fast, but it does not provide a server
  webhook or guarantee that a suspended iPhone app wakes when Apple Reminders changes. Hearth should
  usually receive changes without requiring the adult to reopen the companion, while keeping the
  source read-only and avoiding a misleading fixed refresh promise.
- Choice: Register one `BGAppRefreshTask` permitted by the app's Info.plist and request another run
  for paired sources when the app enters the background. Set fifteen minutes as the earliest start,
  reschedule when iOS launches the task, reread the complete selected EventKit lists and reuse the
  frozen device-scoped full-snapshot contract. Keep the task alive until Hearth accepts or rejects
  the snapshot. On expiration, cancel the transport without accepting or clearing data and retain
  any exact in-memory pending request for a later retry. Add no APNs polling, proprietary iCloud
  endpoint, continuous background mode or EventKit mutation.
- Consequence: Reminder changes can reach Hearth automatically while the companion is suspended,
  and existing server-sent invalidation updates open household screens immediately after acceptance.
  iOS still controls whether and when the task runs, so Hearth retains cached rows, an honest stale
  state and foreground/manual refresh. Simulator tests prove read-to-acceptance coordination; a
  physical background launch and real-world latency observation remain separate evidence.

## D-075 — Phone administration separates destinations from management actions

- Date: 2026-08-26
- Status: accepted and implemented
- Context: More exposed **Photos** as the family gallery while phone upload and curation lived behind
  a generic household/settings path. Adults repeatedly entered the display gallery while looking for
  photo management. On Today settings, a narrow-width override appeared before the desktop grid rule,
  so the desktop two-column cards won in the cascade and squeezed descriptions against switches.
- Choice: Name the gallery action **View family photos** and expose a prominent **Manage photos** row
  directly under Manage Hearth. Group the settings root as Family content, Household & access,
  Connections & displays and System, using joined list rows and one continuous focus order. At phone
  widths, render all Today visibility options as full-width joined rows; keep the icon, copy and switch
  in distinct grid columns and apply focus inside the group boundary. Keep More and settings-root
  navigation bars slim, slightly squared and title-only; task-specific guidance starts after opening a
  destination rather than repeating under every self-explanatory title.
- Consequence: Viewing and administering photos are discoverable as separate intents, upload no longer
  depends on finding the gallery or a generic household row, and Today controls remain legible at the
  390-pixel companion width. Routes, permissions and the underlying photo/Today contracts do not change.

## D-076 — Today summarises all open reminders

- Date: 2026-08-27
- Status: superseded by D-078; ordering retained for Hearth-owned reminders
- Context: Most household reminders have no due date. Restricting the Today card to reminders due on
  the household local date therefore produced **Nothing due today** while useful open reminders were
  present on the dedicated page.
- Choice: Keep the Today module bounded and linked to Reminders, but derive it from every incomplete
  Hearth reminder. Order the preview as overdue, due today, no due date and future;
  sort deterministically within each group. Return the total open count and at most three preview
  items. Render the count and first title with an overflow summary, and reserve **No open reminders**
  for a genuinely empty open projection.
- Consequence: Undated reminders remain visible at a glance without turning Today into a second task
  list. The dedicated page remains the complete destination and Hearth remains authoritative.

## D-077 — Weather uses one comparative hourly graph and weekly scale

- Date: 2026-08-27
- Status: accepted and implemented; extends D-049 and D-051
- Context: Today and Calendar exposed only small forecast cues. A family may need hourly rain, wind
  and apparent-temperature detail, but three simultaneous charts are noisy at television distance
  and a second weather provider would widen the integration surface unnecessarily.
- Choice: Add Weather immediately after Calendar. Extend the existing server-only Open-Meteo
  request and typed cache to current conditions, 24 hourly points and seven daily points. Present
  one graph with Temperature, Rain and Wind modes, D-pad hour/mode navigation and touch controls.
  Compare seven daily temperature ranges on one weekly domain and use the same approach in compact
  Calendar Week summaries. Refresh the server cache every five minutes, retain stale data on failure
  and keep provider attribution in adult Weather location settings rather than on household-facing
  Weather or Today.
- Consequence: Hearth gains useful forecast depth without another credential, provider or competing
  graph. The browser never receives coordinates, Week remains glanceable, and outage behaviour stays
  consistent with the appliance model. The visual hierarchy is original Hearth work rather than a
  copy of any operating-system weather screen.

## D-078 — Retire Apple Reminders and make reminders Hearth-owned

- Date: 2026-08-27
- Status: accepted and implemented
- Context: Modern iCloud Reminders required a separate physical iPhone bridge, full EventKit
  permission, pairing, a device credential, snapshot replacement and best-effort background
  scheduling. Even after the proof worked, Apple controlled propagation and background execution,
  making this disproportionate to a calm household reminder feature.
- Choice: Remove Apple Reminders from the active product. Archive the Swift proof, CalDAV probe,
  frozen contract, source projection and former browser UI under
  `hearth/archive/apple-reminders-bridge/`, outside all active packages. Replace the projection with
  household-owned reminders supporting create, edit, complete, reopen and confirmed removal.
  Preserve historical migrations `0025` and `0026` for forward upgrade integrity; migration `0027`
  drops the Apple source/device/list/item/receipt tables and their credential hashes before creating
  native reminder tables.
- Consequence: Hearth reminders work without an iPhone companion, Apple permission or external
  freshness state. The old Apple reminder data is intentionally not imported because its ownership
  and identity semantics differ from Hearth content. Deploying `0027` permanently removes that
  projection from the live database; rollback therefore requires restoring a pre-migration backup.
  Any future Apple integration needs a new product decision, threat review and physical acceptance
  campaign rather than re-enabling archived code.

## D-079 — Appliance updates use an authenticated coordinator and fixed host agent

- Date: 2026-08-28
- Status: accepted and implemented for Synology; live installation not yet run
- Context: Exact-commit Synology releases are reliable but still require an operator. Letting the
  browser run Docker or shell commands would turn a web compromise into host control, while blindly
  following `main` could install a release whose verification or images are incomplete.
- Choice: Add a System Health update card only when a platform adapter is configured. The server
  discovers the newest successful `main` push from the fixed verification workflow, accepts only its
  exact 40-character commit, creates and verifies an online database backup, then writes a bounded
  request to a mode-restricted FIFO. A separately installed root-owned Synology agent blocks on that
  FIFO, invokes only the fixed Hearth release helper, health-checks the replacement and restores the
  previous database and images on failure. Update reads require an adult administrator; installation
  also requires a passkey session created within five minutes. Development hides the card. Termux
  may use the same typed coordinator only after its platform agent and rollback path are separately
  commissioned.
- Consequence: The normal browser and containers receive neither Docker access nor a general shell.
  Release start and terminal result are audited, progress survives the web container restart, and a
  failed release returns to the prior working state. The first live Synology use still requires one
  approved rerun of the root helper installer to install the new fixed agent and Compose mount.

## D-080 — Open clients reload after a verified release changes

- Date: 2026-09-01
- Status: accepted and implemented
- Context: A television WebView can remain alive across a Synology container replacement and keep
  rendering its already loaded JavaScript even though the new non-cached HTML is live.
- Choice: Expose the non-secret active release identifier from the non-cacheable health route. The
  shared web client compares it on initial load, realtime connection/reconnection, foreground and
  network return, with a once-per-minute fallback while visible. It reloads the document once only
  when the identifier changes; hidden pages do not run the interval check.
- Consequence: Future server/web patches appear without clearing application data or repairing the
  television. A temporary outage leaves the current screen intact and retries at the next lifecycle
  signal or visible interval.
