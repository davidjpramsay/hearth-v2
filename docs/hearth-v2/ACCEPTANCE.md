# Hearth v2 acceptance and definition of done

## Per-change definition of done

A change is complete only when:

- behaviour and out-of-scope boundaries are clear
- contracts and migrations are documented
- relevant automated tests pass
- typecheck, lint and production build pass
- changed UI is rendered and inspected at relevant viewports
- D-pad/keyboard-only navigation is exercised for changed television surfaces
- loading, empty, stale, offline and error behaviour is considered
- no secrets or private provider payloads appear in source, bundle or logs
- authoritative documents are updated when a contract or decision changed
- the handoff names exact passed, failed, blocked and not-run checks

## Product acceptance scenarios

### Launch and navigation

- Cold launch reaches useful cached/current Today content within the product performance target.
- Resume after overnight television standby restores Hearth without manual process recovery.
- Every primary screen is reachable with D-pad and Back.
- Focus never disappears, becomes trapped or lands behind an overlay.
- Resuming Hearth after normal Google TV app switching restores the previous Hearth screen or a documented safe default.
- Demo/test dates are deterministic, while private mode derives today, Monday
  week start and current month from the configured household timezone.
- A new private database contains no fictional household or planning records,
  exposes an explicit setup-required launch state and does not enable demo
  reset/scenario commands.

### Calendar

- Events from multiple enabled calendars retain correct owner/source cues.
- Month fits one television viewport, shows readable colour-coded event titles plus deterministic overflow inside date cells, and identifies each colour through a separate avatar/label key. On phone, focusing or selecting a date exposes every title in a companion agenda beneath the compact grid.
- Month is reachable below Week with D-pad navigation; Back restores Week and the prior rail focus, while the phone exposes a Week/Month switch.
- All-day events appear on the correct Perth local dates.
- Events created in a daylight-saving region display at the correct Perth time.
- Recurrence exceptions and cancellations do not resurrect.
- An unavailable provider leaves cached events visible and clearly marked stale.
- A write conflict is explained and never silently overwrites the provider.
- An adult can test a private HTTPS CalDAV account, select exact calendars,
  assign optional people, save, reload and remove the connection from the phone
  companion. Passwords and raw collection URLs never appear in responses,
  SQLite, screenshots or logs; child and unauthenticated setup are rejected.

Phase 3 evidence as of 2026-08-03: the first five read/degraded-mode scenarios
are automated against the fake adapter, SQLite cache and rendered Today/Week/Month
surfaces. The selected CalDAV/iCloud adapter additionally has contract coverage
for exact allowlisting, HTTPS-only configuration, bounded recurrence expansion,
all-day projection, authentication failure, malformed payload recovery and the
persisted Today query. A credentialed iCloud read remains intentionally not run
until the owner supplies an external app-specific credential and calendar
allowlist. Write-conflict behaviour remains intentionally untested because no
write scope or write implementation has been approved.

Calendar-setup evidence as of 2026-08-08 adds shared-schema, Fastify,
SQLite-restart/idempotency, migration, permission, secret-scan, responsive
Playwright and accessibility coverage using the fake verifier. It does not
constitute live iCloud validation.

### Household people

- An adult administrator can choose either a portrait or landscape profile photo, position its
  square crop, save it, replace it and restore the original member avatar.
- The normalized profile photo survives server restart, remains below the size limit and is served
  from a same-origin opaque URL without exposing a source path or original image.
- Child/guest mutation is rejected; retrying the same command is idempotent; audit summaries and
  logs do not include base64 image data.
- The phone-sized crop dialog supports direct drag plus two-finger pinch zoom without visible
  position sliders. The crop surface remains keyboard-accessible with arrow, plus/minus and reset
  controls, and failures stay family-readable and inline.

### Chores and pocket money

- One remote Select completes one pending occurrence and offers undo.
- A retried voice/automation request does not create a second completion.
- Editing a recurring chore does not rewrite past completions.
- An adult can reverse an accidental completion with an audit trail.
- A child cannot modify another person's history or household rules without permission.
- Every participating child has a required weekly amount and payday in phone administration.
- Chores shows each child's week-to-date completed/total count, percentage and proportional amount due without requiring scroll on the primary television layout.
- Completing and undoing a chore updates that running total through the same typed chore contract.
- Excused and cancelled occurrences do not reduce the percentage; skipped occurrences remain incomplete.
- A recorded payment snapshots the counts, percentage and amount, is idempotent on retry and cannot be duplicated for the same child/week.
- Star balances, per-chore points, reward choices and redemptions are absent from the active UI and API.

### Lists and meals

- Items can be checked with one obvious action.
- Voice addition handles exact duplicates and ambiguous list names safely.
- Today's meal is visible without entering the Meals module.
- Long-form editing is comfortable from the phone companion.

### Home Assistant and voice

- Voice Preview Edition and an iPhone can trigger the same typed Hearth actions.
- The configured chore-completion sentence updates the correct person/date/chore and returns confirmation for Home Assistant/Piper to speak.
- Ambiguous commands ask for clarification rather than guessing.
- Unlisted Home Assistant entities/services cannot be invoked through Hearth.
- A Home Assistant outage does not prevent reading local Hearth data.

### Native television coexistence

- Jellyfin music and video remain available through the independent native Google TV client without a Hearth credential, connection card or launch command.
- Home Assistant does not auto-power-off the television during protected native-app playback.
- Hearth remains resumable after ordinary Google TV app switching without knowing which media app was used.

### External voice-music commissioning

- Music Assistant is installed beside Home Assistant, not inside Hearth, and
  connects to Jellyfin with a dedicated credential that never enters the
  Hearth workspace or bundles.
- “Play Dreams by Fleetwood Mac” from the living-room voice unit resolves to the
  mapped `Hearth TV` Google Cast player when no destination is spoken.
- Naming a different configured room/player overrides that mapping.
- The requested track plays through Cast with available metadata; acceptance
  does not require opening or automating the native Jellyfin app.
- Pause, resume, next, previous, stop and volume operate reliably, while
  ambiguous search results fail safely or request clarification.
- Cast playback sets the same generic protected-media guard used for native
  playback and prevents a presence-driven screen shutdown.
- Music Assistant/Jellyfin/voice failure remains external to Hearth and does
  not prevent the family dashboard from operating.
- The selected TCL television/video Cast player is explicitly enabled in Music
  Assistant, remains discoverable on the same local network and survives a
  restart/re-discovery test.
- Jellyfin music search, playlist import, refresh and sustained playback are
  reliable enough for the household; otherwise the documented read-only
  Synology music-share fallback is used only after approval.

Status as of 2026-08-04: not run. Music Assistant, the community voice-support
intents, Jellyfin source, player mapping and physical-TCL Cast behaviour remain
live-system commissioning tasks requiring owner approval.

### Presence and power

- Presence during allowed hours can wake/show Hearth.
- No-presence timeout turns the panel off only when Hearth is foreground and no protected media session exists.
- A seated household member does not experience repeated false shutdowns after final presence tuning.
- Quiet hours prevent unwanted wakeups.
- Network wake failure falls back to the approved IR mechanism without hard-cutting mains power.

### Photos and ambient mode

- Approved photos rotate without visible distortion, incorrect orientation or filesystem exposure.
- The normal gallery shows each visible photo once, fills its available screen region and chooses a
  stable composition from the featured photo's orientation. In a mixed five-photo set each automatic
  advance visibly changes the feature: a featured portrait becomes a useful tall anchor and a
  featured landscape becomes a wide anchor. Portrait support tiles remain substantial, with no
  skinny portrait column, shallow landscape ribbon or horizontal overflow. Rotation is no faster
  than every 45 seconds and remains static under reduced motion. Phone landscape shows three
  substantial rotating occupants rather than five compressed strips.
- Remote/voice input exits ambient mode immediately.
- The same static dashboard is not left illuminated overnight.
- Missing/corrupt photos fail gracefully.

Status as of 2026-08-08: the local browser/server slice passes a unique-image,
orientation-selected full-screen collage with bounded tile geometry, calm 45-second occupant
rotation and a reduced-motion pause, mixed landscape and portrait rendering, path-safe typed
responses, D-pad gallery selection,
immediate keyboard/Back-equivalent ambient exit, real offline cached content,
empty/unavailable/failure-retry states and a corrupt-derivative fallback at TV
and phone viewports. Live Synology indexing, voice exit, physical-TCL rendering
and Home Assistant presence/quiet-hours coordination are not run, so this
acceptance section and Phase 7 remain incomplete.

### Appearance and evening comfort

- Light, Dark and Automatic are selectable without touch and remembered separately on each display.
- Automatic responds when that device's operating-system/browser colour scheme changes.
- Dark preserves readable household/member colours, semantic states and a visible D-pad focus ring
  across Today, Week, Month, Chores, Lists, Meals, Photos, Home and Admin.
- Evening dimming is independently selectable, persists, includes photos/ambient mode and does not
  invoke the Home Assistant Evening scene.
- Back returns from Appearance to the prior screen and restores its previous focused control.

Status as of 2026-08-05: browser automation passes persistence, automatic
system-theme changes, independent dimming, remote-only entry/selection/Back,
serious/critical accessibility checks and dark renders at 3840×2160, 1920×1080,
1366×768, 390×844 and 844×390. The selected TCL's real room comfort and system
theme reporting remain untested until the physical-TV pilot.

### Security and privacy

- Television pairing can be revoked.
- Server-side secrets are absent from built JS and APK artefacts.
- Child/guest roles cannot access admin configuration.
- In private mode, an adult can create the first household only with the external one-time setup
  code and a user-verified passkey; Admin then requires a valid revocable `HttpOnly` companion
  session. The database stores public-key material and session hashes, never the setup code or raw
  session token.
- Mutation audit records include actor, channel, target, time and result.
- Logs do not include tokens or full sensitive calendar content by default.
- Public internet exposure is absent unless separately reviewed and approved.

Phase 6 source/build evidence as of 2026-08-04: the release manifest requires
Leanback, marks touch optional, declares only network access plus the protected
AndroidX receiver permission, disables backup and cleartext, and contains no
configured server URL or integration secret. Pairing/revocation integration
tests, eight native unit tests, Android lint and debug/minified-release assembly
pass. The API 36 Google TV emulator also passes short-code pairing, D-pad
completion/undo, Back/exit, app switching, process recreation, sleep/wake,
server recovery and revocation with retained screenshots. The selected-TCL run
is still required, including its visible launcher tile, actual network
disconnect, overnight resume and native-app coexistence; therefore Phase 6 is
not yet complete.

### Operations and recovery

- Hearth server restarts automatically after Synology restart.
- Home Assistant recovers after Pi restart.
- TV, Pi, NAS and router restarts are each tested.
- A current Hearth backup is restored into a clean test location successfully.
- A Home Assistant backup to Synology is restored successfully.
- The application has visible but calm health reporting for adults.

Local deployment evidence as of 2026-08-09: the production server/web images build and become
healthy together in private mode on native ARM64 and emulated DS920+ `linux/amd64`; the same-origin
readiness route, 12-migration database startup, unseeded first-use runtime, non-root/read-only
security settings and clean `SIGTERM` shutdown pass. These checks validate the scaffold only. The
five operations bullets above still require the actual Synology, Pi, TV, router and restore drill,
so production acceptance remains incomplete.

## Release evidence

Before calling the first household release complete, retain:

- exact test/build command output
- rendered screenshots for 4K/1080 and iPhone states
- Android TV emulator or device test notes
- integration test results and intentionally untested items
- backup/restore evidence
- current deployment versions and rollback procedure
