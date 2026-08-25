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

Timed CalDAV values with a usable `TZID` are projected from that declared
timezone. Provider values without an absolute offset or resolvable timezone are
treated as household-local wall time, never as the Synology container's local
timezone. This keeps floating events stable across development and UTC
production hosts before Hearth stores their normalized UTC instants.

CalDAV is opt-in outside demo mode through `HEARTH_CALENDAR_CONFIG_PATH`. That
variable points to a server-only JSON secret outside the repository containing
the HTTPS server URL, account identifier, app-specific password, household
timezone and exact allowed calendar names/owner mappings. Empty or ambiguous
allowlists fail closed. The current workspace contains no credential and no
live read has been attempted. Apple documents app-specific passwords for
third-party calendar access; a credential must be created and supplied by the
owner only when live validation is approved.

The responsive Connections > Calendar workflow now creates that configuration
without exposing it to browser storage or SQLite. An adult supplies an HTTPS
CalDAV server address, account identifier and app-specific password; the server
tests discovery and returns only opaque option IDs, names and colours. The
adult then approves exact calendars and optional household-owner mappings. A
successful private-mode save atomically writes the external JSON secret with
owner-only file permissions and activates the read-only provider. SQLite keeps
only the server hostname, masked account hint, selected names/colours/mappings,
status and timestamps. The password and full server URL are held only in the
short-lived in-process test result until save, then discarded. Demo mode uses a
deterministic fake verifier and never contacts iCloud.

Connected calendar assignments remain editable through a separate idempotent
mapping command. That command rewrites only the allowlisted display-name/owner
mapping inside the existing server-only secret, mirrors the safe mapping in
SQLite and updates the local calendar projection. It never asks for, returns or
replaces the stored CalDAV credential. Browser presentation derives the colour
from the assigned Hearth member (or the fixed Whole family colour), so later
member colour/avatar edits flow through without reconnecting the provider.

The selected-calendar allowlist is also editable independently of account
replacement. An authenticated adult explicitly requests rediscovery; the server
loads the existing credential from its private file, contacts the provider and
returns only a ten-minute opaque test ID plus safe calendar descriptors. The
adult saves a revised exact selection through the normal idempotent save command.
The password and full server URL never return to the browser, while the external
allowlist and safe SQLite projection are replaced together.

Only authenticated CalDAV account connections are supported. Calendar web interfaces and
alternate URL-ingestion paths remain outside the integration boundary.

### Experimental iCloud Reminders capability check

Hearth does not currently treat iCloud Reminders as a supported product integration. An
operator-only, read-only capability probe may use the already commissioned CalDAV credential to
check the [CalDAV standards boundary](https://www.rfc-editor.org/rfc/rfc4791.html) before any such
feature is proposed. The probe discovers every CalDAV collection, queries only collections that
explicitly advertise `VTODO`, and retrieves at most ten small reminder samples. Its result contains
collection names, advertised component names, aggregate resource counts and the bounded
title/status/due/completion sample only. It never returns or persists the account, password,
collection/object URLs, UIDs, descriptions or raw DAV payloads.

WebDAV permits `DAV:href` to be a URI or relative reference. The probe resolves those references
against the advertised collection, compares decoded path segments to tolerate equivalent
percent-encoding, and ignores a response that merely repeats the collection itself. It still
rejects a different origin, sibling/outside path, embedded credentials, fragment, encoded path
separator, query or nested child path before any object body can be requested.

The probe has no browser route, database write, background polling or calendar/reminder mutation.
If no collection advertises `VTODO`, the check stops after discovery; Hearth must not scrape iCloud,
guess private endpoints or imply that modern upgraded iCloud Reminders are available through the
existing Calendar connection. A future native EventKit bridge would require a separate product,
privacy and authentication decision; Apple documents EventKit as the permission-controlled native
route for [requesting reminder access](https://developer.apple.com/documentation/eventkit/ekeventstore/requestfullaccesstoreminders%28completion%3A%29),
and documents reminder access inside its own
[Calendar app](https://support.apple.com/en-au/guide/calendar/icl873b9a527/mac) without documenting a
third-party CalDAV equivalent.

The commissioned read-only check on 2026-08-25 discovered two `VTODO` collections, but both
returned the same two legacy/other records and neither contained the newly created current test
reminders. All advertised objects were included within the bounded sample. This is evidence that
the CalDAV surface is not a reliable source for modern iCloud Reminders, so Hearth must not build a
direct iCloud Reminders sync on it.

## Weather

Private mode uses the server-side Open-Meteo forecast API with one household
weather location. An adult normally configures it in **Household → Weather
location** by searching a suburb/postcode through Open-Meteo's GeoNames-backed
geocoder, or by allowing a one-time browser geolocation request. Phone
coordinates are reverse-labelled through OpenStreetMap Nominatim as a direct
user-triggered lookup. The chosen label and coordinates are shown to the adult,
tested against current Open-Meteo conditions, then stored locally in SQLite.
The forecast remains independent of Home Assistant and needs no API key.

`HEARTH_WEATHER_LATITUDE` and `HEARTH_WEATHER_LONGITUDE` remain a deployment
fallback for existing installations only. A saved household location takes
precedence. The TV and normal forecast read models never receive coordinates;
the adult-only settings contract exposes them only under an Advanced disclosure.

The adapter requests only current temperature/condition and daily maximum temperature/condition,
normalizes WMO codes into Hearth's compact presentation contract and caches one successful response
for 30 minutes. Concurrent reads share the same request. If a refresh fails, the last safe response
remains available; if no safe response exists, Today shows **Forecast unavailable** and Week omits
the weather cue without affecting calendars or household data. Household-facing dashboards contain
only the useful forecast. Open-Meteo attribution and link remain visible in the adult Weather
settings surface alongside the location controls, satisfying the provider credit without adding
technical branding to the family dashboard.

Open-Meteo's official forecast contract documents `current`, `daily`, `timezone`, `past_days` and
`forecast_days` at <https://open-meteo.com/en/docs>; attribution requirements are documented at
<https://open-meteo.com/en/licence>.

## Optional ESV daily verse

Today can show one read-only ESV passage selected deterministically from a small approved rotation
using the household-local date. It is disabled by default. Private mode reads the API token only
from the external file named by `HEARTH_ESV_API_KEY_PATH`; the browser receives the quotation,
reference, translation/source link and freshness only. Demo mode uses original fictional copy and
does not contact ESV.

The adapter calls only `GET https://api.esv.org/v3/passage/text/` with server-side Token
authorization, requests the short ESV copyright marker, coalesces the result for the local day and
stores only the bounded rotation in SQLite for outage fallback. Today remains usable when the token
is absent or ESV is unavailable. The full reading dialog carries ESV attribution and the required
copyright notice. Official contract and usage conditions: <https://api.esv.org/docs/>,
<https://api.esv.org/docs/passage-text/> and <https://api.esv.org/>.

## Home Assistant

Hearth talks to Home Assistant from the server through its supported REST API. The television/web
client never receives the Home Assistant long-lived token, root URL or raw entity IDs.

The responsive **Connections > Home Assistant** workflow implements a two-step test/save boundary.
An authenticated adult supplies the private root address and a long-lived token. The server checks
`GET /api/config` and `GET /api/states`, retains the secret discovery result only in process for ten
minutes and returns opaque option IDs plus friendly labels/kinds. Save resolves those opaque IDs,
atomically writes the URL, token and raw mappings to the external
`HEARTH_HOME_ASSISTANT_CONFIG_PATH` file with mode `0600`, and activates the managed adapter without
a restart. SQLite stores only hostname, instance/version, friendly mapping labels, readiness and
timestamps. Save/remove use normal adult authorisation, idempotency receipts, audits and
`home.changed` invalidation. Demo/test mode uses deterministic fictional discovery and never contacts
Home Assistant.

Home Assistant documents Bearer authentication, `GET /api/config`, state reads and service calls in
its [REST API](https://developers.home-assistant.io/docs/api/rest/); its
[authentication documentation](https://developers.home-assistant.io/docs/auth_api/) describes
creating long-lived tokens from a user profile. Live token creation and connection remain an
owner-approved commissioning step after a current Home Assistant backup is verified.

### Read path

The first adapter reads exactly four mapped states in parallel:

- household occupancy
- living-room television power
- whether Hearth is the foreground television app
- one generic protected-media-active state covering native and Cast playback

Translate entity IDs and raw states into family-readable Hearth models.
Weather, climate and door sensors are not part of this first allowlist. Weather uses the separate
Open-Meteo adapter above rather than expanding Hearth into a general Home Assistant dashboard.

### Command path

Commands resolve a Hearth action ID through a server-side allowlist. Initial actions:

- `evening-mode`
- `goodnight`
- `screen-off`

Each definition includes argument validation, allowed roles and confirmation level. The REST
adapter calls only `POST /api/services/script/turn_on` with the server-mapped script for that action.
Reject arbitrary domain/service/entity input from clients.

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
text for Home Assistant/Piper to speak. Phase 5 tests exercise this contract with
the fake provider, while the private REST adapter and adult mapping workflow now
prepare the live connection without placing a token or entity ID in the browser
bundle. Actual Home Assistant/Piper sentence and hardware testing remains
deployment work.

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

The primary path is explicit adult upload from the phone companion. The server:

- accepts one bounded supported image per authenticated, idempotent command
- verifies the decoded format instead of trusting the filename or MIME header
- normalizes an orientation-correct managed master, television derivative and thumbnail locally
- deduplicates the household collection by content hash
- stores opaque asset references
- excludes hidden/unsupported/corrupt files
- never stores the client filename or exposes private filesystem locations

One explicitly approved Synology directory may additionally be mounted read-only as an optional
bulk-import source. It is never a prerequisite for phone uploads and must not be the Synology Photos
library root. Hearth does not connect to Apple Photos, accept shared-album links or browse either
provider account.

Do not attempt facial recognition or ingest every personal photo folder in the first release.

The current Phase 7 product slice provides the typed managed-upload boundary, safe demo and private
display/thumbnail derivatives, gallery, cached states and ambient exit. The optional folder adapter
ignores symbolic links, bounds file count/depth/size, fingerprints files for incremental checks,
skips Synology's `@eaDir` metadata and `#recycle` directories, corrects orientation and creates
atomic WebP derivatives. The browser receives opaque, versioned asset routes and aggregate counts
only. An adult companion may request an idempotent, audited folder check; an automatic quiet check
runs after the configured interval. Selecting and mounting that folder remains an owner-approved
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
