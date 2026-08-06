# Hearth v2 integration contracts

## Integration philosophy

Hearth presents one family experience without pretending to own every underlying system. Each external system sits behind a narrow server-side adapter, has a visible health state and can fail without taking down unrelated features.

No external credentials are required for the first rendered prototype. Seed data and fake adapters must use the same contracts as real providers.

## Calendar providers

The first household provider is iCloud through a standards-based CalDAV
adapter. The `CalendarProvider` boundary remains provider-neutral so Google
Calendar or Microsoft/Outlook can be added later without encoding any
provider's payloads into the domain model.

Minimum adapter capabilities:

- list calendars
- incremental or bounded event synchronisation
- get event detail
- report read/write capability
- create/update/delete only when authorised
- return provider version/etag/conflict information
- normalise all-day events and recurrence references

Initial implementation order:

1. fake seeded provider
2. read-only adapter for the selected household provider
3. monitored sync and cached display
4. explicitly approved write operations
5. conflict handling and retry policy

Phase 3 implements steps 1–3. The server-side contract returns normalized
descriptors plus upserts and tombstones. Provider payload identifiers are
converted to Hearth opaque IDs; the browser receives source identity,
local-date projection, recurrence metadata and capability only. The fake
adapter exercises bounded and incremental changes, deletions and outage. The
real CalDAV adapter performs a read-only RFC 4791 time-range query with bounded
recurrence expansion and deliberately returns a complete bounded snapshot for
transactional reconciliation. Removed sources become hidden and missing
objects become tombstones. RFC 6578 sync tokens are deferred until live
profiling shows they are useful.

CalDAV is opt-in outside demo mode through `HEARTH_CALENDAR_CONFIG_PATH`. That
variable points to a server-only JSON secret outside the repository containing
the HTTPS server URL, account identifier, app-specific password, household
timezone and exact allowed calendar names/owner mappings. Empty or ambiguous
allowlists fail closed. The current workspace contains no credential and no
live read has been attempted. Apple documents app-specific passwords for
third-party calendar access; a credential must be created and supplied by the
owner only when live validation is approved.

Do not scrape calendar web interfaces or ingest private ICS links into client code.

## Home Assistant

Hearth talks to Home Assistant from the server, using its supported REST/WebSocket APIs as appropriate. The television/web client never receives the Home Assistant long-lived token.

### Read path

Expose a curated projection of selected states:

- television power and a generic protected-media-active state for safe automation
- room presence
- selected climate/weather/door state
- availability of Hearth scenes/scripts

Translate entity IDs and raw states into family-readable Hearth models.

### Command path

Commands resolve a Hearth action ID through a server-side allowlist. Initial actions:

- `evening-mode`
- `goodnight`
- `screen-off`

Each definition includes argument validation, allowed roles and confirmation level. Reject arbitrary domain/service/entity input from clients.

### Home Assistant to Hearth

Provide authenticated, narrowly scoped command endpoints for day summaries, list additions and chore completion. Support idempotency identifiers because automations and voice pipelines may retry.

Recommended initial Home Assistant scripts:

- `hearth_complete_chore`
- `hearth_screen_off`
- `hearth_evening`
- `hearth_goodnight`

## Voice

Home Assistant Assist is the voice orchestrator. The initial fully local pipeline is:

- Home Assistant Voice Preview Edition or iPhone microphone
- Speech-to-Phrase for fast allowlisted household commands
- Piper for local speech responses
- optional openWakeWord
- Whisper later for freer transcription if performance is acceptable

Hearth supplies neither the microphone nor a speech pipeline. It exposes
narrowly scoped, authenticated `/assist` endpoints and returns deterministic
text for Home Assistant/Piper to speak. The Phase 5 fake adapter exercises this
contract without a Home Assistant credential; live token provisioning and
entity mapping are deployment work and remain outside the browser bundle.

This section governs household commands that call Hearth. Voice-requested
music follows the separate Music Assistant flow below and never calls a Hearth
`/assist` endpoint.

Intent flow for “mark Ezra's dishwasher chore complete today”:

1. Assist produces a structured chore-completion intent.
2. A Home Assistant script calls Hearth with member/chore/date and a request ID.
3. Hearth resolves ambiguity and validates permission/current occurrence.
4. Hearth commits the completion and audit event transactionally.
5. The result is returned for spoken confirmation.
6. Connected clients receive a state invalidation/update.

If multiple chores match, do not guess. Return candidate labels so Assist can ask a short clarification.

An LLM may later map open language to the same typed scripts. It cannot receive arbitrary Home Assistant tools, database access or a generic HTTP tool.

## Music Assistant voice-music path

Music Assistant is a separate open-source music-library and playback server
designed to run beside Home Assistant. It is not bundled into a fresh Home
Assistant installation and is not a Hearth component. On the planned Home
Assistant OS deployment:

1. Install the Music Assistant server from the Home Assistant App Store.
2. Add/confirm the official Home Assistant Music Assistant integration.
3. Add the Synology Jellyfin server as a Music Assistant music source using a
   dedicated least-privilege account supplied outside this workspace.
4. Use Music Assistant's native Google Cast player provider for the selected
   TCL and any later Cast speakers. Music Assistant disables television/video
   Cast devices by default, so explicitly enable only the selected TCL player.
5. Give the television player a clear logical name such as `Hearth TV` and map
   the living-room Assist satellite/area to it.
6. Install and configure Music Assistant's community voice-support
   blueprints/custom intents for initiating playback.

The mapping in step 5 means a request heard by the living-room Voice Preview
Edition can treat `Hearth TV` as its omitted target: “play Dreams by Fleetwood
Mac” routes there, while “play it in Ezra's room” names a different configured
player. This is deployment configuration, not a universal Home Assistant
setting literally named “default music destination.”

As of 2026-08-04, Home Assistant core provides player intents such as pause,
resume, previous, next and volume, but does not natively initiate arbitrary
music searches by voice. Music Assistant documents the additional community
voice-support setup for play requests, with both fully local and LLM-based
recognition options. Hearth uses the fully local/custom-intent option first.

The desired runtime flow is:

```text
Voice Preview Edition or iPhone
  -> Home Assistant Assist custom music intent
  -> Music Assistant search/queue
  -> Jellyfin music source on Synology
  -> Google Cast player named Hearth TV
  -> television/eARC audio
```

Success means the requested audio plays and Cast displays available metadata;
it does not mean the native Jellyfin app opens. Do not automate Jellyfin search
screens with Android keypresses or ADB. App UI state and updates would make
that path unreliable.

The Jellyfin music-source provider is currently maintained by Music Assistant
on a best-effort basis with no dedicated developer. Validate search, playlists,
library refresh and multi-hour playback before relying on it. If it is not
reliable enough, the approved fallback is a read-only direct Synology music
share exposed to Music Assistant through a supported Home Assistant OS/network
storage mechanism; do not grant the app broad mount privileges or change the
source silently. Jellyfin remains the native browsing server either way.

Official references:

- <https://www.music-assistant.io/installation/>
- <https://www.home-assistant.io/integrations/music_assistant/>
- <https://www.music-assistant.io/music-providers/jellyfin/>
- <https://www.music-assistant.io/player-support/google-cast/>
- <https://www.music-assistant.io/integration/voice/>

## Android/Google TV

Home Assistant uses the Android TV Remote integration for power, keys, volume,
approved native-app launches and the generic active-app state needed by
presence-aware power guards. Music Assistant uses the television's separate
Google Cast player for voice-requested audio. TCL may require Screenless
Service/network standby configuration before either integration can wake or
reach it reliably while the panel is off.

The Hearth Android shell exposes a small native bridge to its trusted web origin:

- app identity/version
- network/reconnect status
- exit/back request
- no pairing secret or Android intent surface

The implemented bridge uses `WebViewCompat.addWebMessageListener` with the exact
paired origin and accepts only type-only JSON messages up to 256 bytes. Android
Back is delivered as a native-to-web message; the web root may answer with the
single exit request. Pairing occurs through native HTTPS calls before WebView
creation, and native code installs the scoped `HttpOnly` cookie. Do not replace
this with `addJavascriptInterface`, expose general Android intents, or add
shell/ADB capabilities to web content.

The included Google TV microphone remote remains a normal Google/Gemini remote. Do not rely on remapping it to Home Assistant for the first release.

## Native television media boundary

The existing Jellyfin server on the Synology remains authoritative for movies,
television and music. The native Jellyfin client installed on Google TV
connects directly to that server and handles normal browsing and manual
playback independently of Hearth. Music Assistant may also read the Jellyfin
music library and stream resolved tracks to Google Cast, but remains entirely
within the external Home Assistant/media deployment.

Hearth therefore has:

- no Jellyfin or Music Assistant credential, adapter or connection status
- no movie/music shortcut or native-app launch command
- no media library, now-playing, queue or transport surface
- no return-from-Jellyfin workflow beyond ordinary Android app suspend/resume restoration

Home Assistant may report to Hearth only whether protected television playback
is active so presence automation does not turn off the panel. The boolean must
cover both protected native-app playback and Music Assistant/Cast playback.
That safety signal does not make media a Hearth integration. Any future
proposal to add media controls to Hearth requires explicit owner approval and
a new recorded decision.

## Photos

Start with one approved Synology directory or album. The server:

- indexes only that configured source
- stores opaque asset references
- creates television-size derivatives and thumbnails
- respects orientation
- excludes hidden/unsupported/corrupt files
- never exposes the parent filesystem

Do not attempt facial recognition or ingest every personal photo folder in the first release.

An Apple Photos Shared Album public website is a viewing link, not Hearth's
photo-source API. Apple documents that anyone with the link can view a public
album in a browser; it should therefore be treated as public-by-link. Apple's
supported PhotoKit asset access runs inside an authorised Apple-platform app,
not as a documented headless Synology or Google TV feed. Hearth does not scrape,
index or persist an iCloud Shared Album webpage URL. If selected Apple photos
are wanted in Hearth, export or sync them into the one approved Synology source,
or add a separately reviewed future iPhone PhotoKit upload flow.

The current Phase 7 product slice provides the typed source boundary, safe demo
display/thumbnail derivatives, gallery, cached-source states and ambient exit.
Selecting and indexing the live Synology folder remains an owner-approved
deployment step and must not broaden beyond the configured collection.

## Presence and IR

Prefer an ESP32/ESPHome node near the television for the existing PIR and IR components. This separates room I/O from the Home Assistant server and permits later mmWave replacement.

Power automation guard conditions must include:

- protected television media state reported by Home Assistant, including native-app and Cast playback
- household quiet hours
- presence timeout
- manual override/grace period

The automation sends a supported network/IR standby command. It does not hard-cut mains power.

## iPhones

Use the Home Assistant Companion app for:

- Assist from Action Button, lock screen, Control Centre or Shortcut
- presence only if the household explicitly enables it
- notifications for adult-facing integration failures where useful

Use the responsive Hearth web companion for detailed editing until a native iOS application has a demonstrated advantage.

## Failure reporting

Represent each Hearth integration as:

- configured and healthy
- configured but degraded/stale
- authentication required
- permission limited/read-only
- not configured
- intentionally disabled

Do not collapse “not configured,” “blocked,” “empty” and “checked successfully” into the same state.
