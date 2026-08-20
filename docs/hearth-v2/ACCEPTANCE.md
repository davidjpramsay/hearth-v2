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
- Week, Month and Agenda are views beneath one Calendar primary destination on
  television and phone. Every view is reachable with D-pad/keyboard-only input;
  legacy Week/Month links redirect without losing scenario/date query state.
- Earlier, current-period and later controls issue the requested week/month
  query, and Calendar source setup is directly discoverable without searching
  the general settings list.
- Selecting an Agenda/Week event exposes its available time, source/person and
  location in a family-readable detail surface; Back closes it and restores the
  exact event focus.
- All-day events appear on the correct Perth local dates.
- Events created in a daylight-saving region display at the correct Perth time.
- Recurrence exceptions and cancellations do not resurrect.
- An unavailable provider leaves cached events visible and clearly marked stale.
- A write conflict is explained and never silently overwrites the provider.
- An adult can test a private HTTPS CalDAV account, select exact calendars,
  assign optional people, save, reload and remove the connection from the phone
  companion. Passwords and raw collection URLs never appear in responses,
  SQLite, screenshots or logs; child and unauthenticated setup are rejected.
- Every connected source permanently shows calendar name, assigned person and
  display colour. Reassigning a source updates Week/Month owner identity and
  member-derived colour without reconnecting or re-entering the CalDAV password;
  Whole family uses the family presentation.
- An adult can add or remove selected calendars from an existing connection by
  using **Edit calendars**. Hearth rediscovers the account with the server-side
  credential and never returns or requests that credential in the browser; the
  revised exact allowlist survives reload and restart.
- An adult can search a suburb/postcode or use the phone's one-time location,
  inspect the resolved label and advanced coordinates, test current conditions,
  and save the location separately from timezone. The saved location survives
  restart and takes precedence over environment fallback coordinates.
- With a tested weather location configured, Today shows current local conditions and
  Week shows normalized daily forecasts without provider branding on household-facing dashboards.
  Provider attribution remains visible in adult Weather settings. Coordinates never enter
  TV/forecast responses or logs. A provider outage retains the last safe forecast and a first-load
  failure leaves calendar and household content usable with an unavailable weather cue.

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

Calendar-navigation evidence as of 2026-08-09 adds 1366×768 and 1920×1080
television, 390×844 and 844×390 phone, D-pad/Back, route compatibility,
date-navigation, event-detail focus restoration and automated accessibility
coverage. Browser-plugin control was unavailable, so the installed Playwright
Chromium fallback produced the retained evidence.

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
- An adult can select one or more people on a chore schedule. A multi-person schedule is returned as
  one grouped template but generates one distinct occurrence per selected person; completing one
  occurrence leaves every other person's copy pending and preserves independent pocket-money totals.
- An adult can create a one-off chore for a household-local date, archive any active chore only
  after confirmation and restore it from today. Command retries replay safely, past occurrences
  remain visible and the archived interval does not produce retroactive jobs.
- An adult can add an optional available-from time, due time or valid two-ended window to future
  schedules. Reversed windows are rejected with a stable validation error.
- An adult can move active schedules earlier or later from the phone. The saved order includes every
  active template exactly once, appends newly created schedules and survives restart/retry.
- Generated occurrences retain their snapshotted window and order after a later template edit or
  reorder; future ungenerated days use the new values.
- An adult can then reasonedly skip, excuse or
  reassign a pending occurrence from the phone. The occurrence detail shows its snapshotted
  description, time window and newest-first immutable history after restart.
- Skip remains incomplete and eligible for pocket money, excuse is excluded, and reassignment moves
  responsibility. Retrying the same request cannot apply the change or create history twice.
- The television renders compact available/due metadata in the saved order but keeps
  completion/undo as the only ordinary chore actions; ordering, exception and history controls
  remain phone-first.
- An adult can reverse an accidental completion with an audit trail.
- A child cannot modify another person's history or household rules without permission.
- Every participating child has a required weekly amount and payday in phone administration. The setting persists across weeks and server restarts, repeats until an adult changes it and is visibly described as set-and-forget.
- Chores shows each child's week-to-date completed/total count, percentage and proportional amount due without requiring scroll on the primary television layout.
- On a day with no due occurrence, each child remains visible with weekly pocket-money progress and explicit unscheduled-day wording; private households never expose a demo-bootstrap action.
- Completing and undoing a chore updates that running total through the same typed chore contract.
- Excused and cancelled occurrences do not reduce the percentage; skipped occurrences remain incomplete.
- Pocket-money administration defaults to the current Monday–Sunday week and uses one labelled selector for current and past-week review. Standing amount/payday settings remain separate from the selected review week, and no future-week control is shown.
- A payment snapshots the counts, percentage and amount, supports an optional note and is idempotent on retry. Multiple partial disbursements are allowed, but their non-voided total cannot exceed the amount due.
- Paid, partially paid and unpaid/building states are explicit. A missing weekly amount/payday produces a named setup warning for each affected child.
- An adult can correct a mistaken payment only by recording a reasoned, audited void. The original payment and void remain visible after restart, and retrying the same void request does not create another correction.
- Before payday, the payment control clearly warns that early recording is allowed.
- Star balances, per-chore points, reward choices and redemptions are absent from the active UI and API.

### Lists and meals

- Items can be checked with one obvious action.
- Voice addition handles exact duplicates and ambiguous list names safely.
- An authenticated adult can create, rename, type, colour, order, archive and
  restore a list from the phone, while the final active list is protected.
- An authenticated adult can edit an item's text and quantity, reorder or
  remove it, and clear checked items only through an explicit confirmation.
  These commands are idempotent, audited and survive restart.
- The television list surface does not expose dense administration controls.
- Today's meal is visible without entering the Meals module.
- The TV's meal actions reach real companion management destinations while keeping dense editing
  out of the television path.
- An authenticated adult can edit multiple dinners and optional notes in one phone-friendly weekly
  form; one save updates the displayed week atomically and survives restart.
- An adult can copy the previous week or clear the current week only through an explicit
  confirmation. Retrying the same request ID replays the original result without duplicate entries
  or audit events.
- Saved family meals can be created, searched, favourited, updated, archived and restored with
  optional preparation time and notes. Archived meals remain understandable in historical plans.
- Permission, invalid-week, copy-conflict and fail-next/retry paths return stable family-readable
  errors and leave the plan consistent.
- Long-form editing is comfortable from the phone companion; the primary seven dinner fields stay
  visible together while saved-meal and note controls expand only when needed.

### Notices and Today composition

- An authenticated adult can publish, edit and remove a notice with Standard or
  Important priority and a valid start/expiry window.
- Duplicate command request IDs replay the original result and do not create a
  second notice; each accepted write has an audit record.
- The server, not the browser, selects the eligible Important/most-recent notice
  shown on Today, and expiry/removal reveals the next eligible notice.
- Dinner, List summary, Notice, Daily Bible verse and Family photo can be independently shown or
  hidden from the companion without hiding plans or chores or creating a layout
  editor.
- The TV summary rebalances cleanly for one, two, three or four bands, with or without
  a photo; phone administration remains accessible and usable at 390×844.
- When Daily Bible verse is enabled, demo mode shows fictional copy and private mode shows an
  attributed ESV passage only when its server secret is configured. Select opens a Back-safe full
  reading; a missing key or provider outage cannot take down Today, and cached text is marked stale.
- Today & notices offers distinct TV and Phone previews using current household
  content. Switching optional sections updates the preview without navigating
  away, and two rapid changes cannot overwrite one another.
- A failed secondary preview read is family-readable and does not prevent an
  adult from changing or saving section visibility.
- Today displays no more than three event and three chore rows on television and
  exposes the exact hidden count through focusable links to Calendar Agenda and
  Chores; no returned item is silently concealed.
- A visible event opens family-readable details, Dinner/List/Photo open their
  real modules, an active Notice opens its full text, and Back restores the exact
  originating control using only remote-equivalent input.

Status as of 2026-08-09: fake/in-memory and durable SQLite command paths,
idempotency, permission/validation rejection, reset isolation, restart state,
realtime invalidation, accessibility and retained 390×844/1920×1080 renders are
implemented. Real household wording and expiry preferences remain pilot tuning,
not a deployment blocker.

Extension evidence as of 2026-08-10: overflow counts, event and notice details,
summary destinations, deterministic focus/Back restoration, TV and phone
responsive renders, automated accessibility checks and console-clean remote
flows are covered by `tests/e2e/today-polish.spec.ts`.

The same date's companion extension adds data-backed TV/Phone composition
previews and serialised optimistic visibility changes. Unit coverage exercises
both preview compositions, no-optional-section and unavailable states;
`tests/e2e/today-settings.spec.ts` covers the rapid-toggle race, responsive
renders and automated accessibility checks.

### Home Assistant and voice

- Voice Preview Edition and an iPhone can trigger the same typed Hearth actions.
- The configured chore-completion sentence updates the correct person/date/chore and returns confirmation for Home Assistant/Piper to speak.
- Ambiguous commands ask for clarification rather than guessing.
- Unlisted Home Assistant entities/services cannot be invoked through Hearth.
- A Home Assistant outage does not prevent reading local Hearth data.
- An adult can test, map, replace and remove one Home Assistant connection without returning its
  token, root URL or raw entity IDs to the browser, SQLite, receipts, audits or logs.
- The connection maps exactly four safety states and Evening, Goodnight and Screen off; the runtime
  reads only those states and invokes only the selected scripts through `script.turn_on`.

Local status as of 2026-08-10: fake and REST adapter contracts, external mode-`0600` secret writes,
safe SQLite metadata, adult/idempotency/audit enforcement, malformed/authentication/network errors,
managed activation/removal, responsive phone mapping, keyboard Back and serious/critical
accessibility checks pass. No real token was created and no live Home Assistant, Assist/Piper,
presence, television or IR test was run. Those live/hardware bullets therefore remain incomplete
until the approved commissioning and backup check.

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
- Automatic collage rotation can be paused and resumed using only the remote or touch, does not
  advance while the document is hidden, and remains still when reduced motion is requested.
- The normal gallery shows each visible photo once, fills its available screen region and chooses a
  stable composition from the featured photo's orientation. In a mixed five-photo set each automatic
  advance visibly changes the feature: a featured portrait becomes a useful tall anchor and a
  featured landscape becomes a wide anchor. Portrait support tiles remain substantial, with no
  skinny portrait column, shallow landscape ribbon or horizontal overflow. Rotation occurs every
  45 seconds, exposes subtle visible progress to the next composition and remains static under
  reduced motion. Phone landscape shows three
  substantial rotating occupants rather than five compressed strips.
- Remote/voice input exits ambient mode immediately.
- The same static dashboard is not left illuminated overnight.
- Missing/corrupt photos fail gracefully.
- An authenticated adult can choose multiple supported phone photos without first configuring a
  shared folder. Each image is capped at 25 MB, decoded server-side, orientation-corrected and
  stored with opaque paths; duplicate content is reported without creating another asset. A child,
  television credential, invalid format and duplicate request ID cannot create an unintended write.
- A batch may partially succeed and reports added, duplicate and failed counts. Client filenames,
  original bytes and private paths do not enter browser-safe responses, receipts, audits or logs.
- An authenticated adult can favourite, unfavourite, hide and restore an indexed photo using touch
  or D-pad only. Commands are validated, idempotent and audited; a hidden photo disappears from
  Today, the gallery and ambient mode without deleting its index or original.
- Favourite and hidden state survives optional incremental Synology folder checks. A missing import
  folder does not disable managed phone uploads or remove their assets. Hidden photos remain available
  in adult administration with a safe derivative preview, while private filesystem paths never
  reach any response or log. Synology metadata and recycle directories such as `@eaDir` and
  `#recycle` are ignored rather than making the approved-folder check fail.

Status as of 2026-08-20: the local browser/server slice passes a unique-image,
orientation-selected full-screen collage with bounded tile geometry, visible 45-second occupant
rotation and a reduced-motion pause, mixed landscape and portrait rendering, path-safe typed
responses, D-pad gallery selection,
immediate keyboard/Back-equivalent ambient exit, real offline cached content,
empty/unavailable/failure-retry states and a corrupt-derivative fallback at TV
and phone viewports. Managed upload tests cover portrait normalization, content deduplication,
decoded-format rejection, adult role enforcement, command replay, path-free audit creation and
persistence across service restart. The optional folder adapter additionally passes local mixed-orientation,
unsupported/corrupt/symlink, incremental-change, opaque-route and cached-unavailable tests, with an
adult-only audited manual scan contract. Adult favourite, unfavourite, hide and restore commands
additionally pass role rejection, validation, duplicate-request replay, audit projection, rescan
persistence, hidden-photo projection and D-pad/focus-restoration checks. Live managed upload,
encrypted data-directory restore, optional Synology folder check, voice exit and physical-TCL rendering
and Home Assistant presence/quiet-hours coordination are not run, so this
acceptance section and Phase 7 remain incomplete.

### Appearance and evening comfort

- Light, Dark and Automatic are selectable without touch and remembered separately on each display.
- A paired display or signed-in household viewer can open Appearance and change this device without
  an administrator passkey; all household-mutating Admin routes remain protected.
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
- A private non-Android television browser can replace unsupported passkey sign-in with a
  short-code pairing approved by an authenticated adult. The raw device secret is absent from the
  URL, rendered UI, local/session storage, response bodies and logs; after exchange it exists only
  in a `Secure`, `HttpOnly`, `SameSite=Strict` device cookie and grants television rather than Admin
  scope.
- Server-side secrets are absent from built JS and APK artefacts.
- Child/guest roles cannot access admin configuration.
- In private mode, an adult can create the first household only with the external one-time setup
  code and a user-verified passkey; Admin then requires a valid revocable `HttpOnly` companion
  session. The database stores public-key material and session hashes, never the setup code or raw
  session token.
- A signed-in administrator can enrol additional independently named passkeys for any active adult
  and revoke a lost credential. Hearth blocks removal of an adult's final passkey until recovery is
  configured. Recovery-code creation re-verifies the current passkey, displays a 128-bit code once,
  stores only its digest and expires it after 180 days. Successful one-time recovery creates a
  replacement passkey, consumes the code and revokes that adult's earlier credentials and sessions.
- After private first use, an unauthenticated browser cannot discover the household identifier or
  name through runtime bootstrap and receives `UNAUTHENTICATED` from household JSON, photo and
  event-stream routes. A same-household companion with `household.view` and a paired television
  with `household.read` can load the same routes; cross-household credentials fail closed.
- Television pairing still creates unique schema-valid six-character codes after more than 99
  retained requests. Passkey authentication options enforce per-client and global pending limits,
  and expired attempts are pruned so unauthenticated requests cannot grow memory without bound.
- Mutation audit records include actor, channel, target, time and result.
- A household administrator can review the latest family, planning, connection and system changes
  in a family-readable Recent activity screen. A child receives `FORBIDDEN`; the screen does not
  render opaque audit/request/target identifiers or provider secrets, and its filter, Back/focus
  restoration, empty, unavailable, phone landscape/portrait and dark presentations work without
  touch.
- Logs do not include tokens or full sensitive calendar content by default; calendar and Home
  Assistant connection tests explicitly redact their credential fields.
- Public internet exposure is absent unless separately reviewed and approved.

Adult-access evidence as of 2026-08-15: shared-schema, Fastify route, SQLite repository, migration
backfill, idempotent revocation and virtual-WebAuthn browser tests cover additional named-adult
passkeys, current-passkey confirmation, digest-only code rotation, one-time recovery and previous
session/credential revocation. The responsive Admin and signed-out recovery surfaces pass focused
390×844 and 844×390 renders, serious/critical accessibility checks and the complete 206-test
Playwright suite. Stable-hostname enrolment and recovery on the actual adult phones remain a live
commissioning acceptance gate.

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
readiness route, 20-migration database startup, unseeded first-use runtime, non-root/read-only
security settings and clean `SIGTERM` shutdown pass. These checks validate the scaffold only. The
online backup service now also creates mode-restricted, integrity-checked SQLite copies with
bounded retention; an automated clean-location restore reads the household successfully, and a
phone System Health surface reports database/version/backup state without exposing paths. The five
operations bullets above still require the actual Synology, Pi, TV, router and live restore drill,
so production acceptance remains incomplete.

## Release evidence

Before calling the first household release complete, retain:

- exact test/build command output
- rendered screenshots for 4K/1080 and iPhone states
- Android TV emulator or device test notes
- integration test results and intentionally untested items
- backup/restore evidence
- current deployment versions and rollback procedure
