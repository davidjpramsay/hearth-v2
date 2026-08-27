# Hearth v2 product specification

## Vision

Hearth should make the state of family life understandable at a glance and easy to change without finding a laptop or navigating an administrative system. From across the room it answers:

- What is happening today and this week?
- Who needs to do what?
- What are we eating and what do we need to buy?
- Is anything important waiting for attention?
- What should the room do next?

It should then allow a family member to act with a remote, an iPhone or natural speech.

## Product principles

1. **Glance first.** The default screen communicates more than it demands.
2. **One obvious next action.** Children and guests should not need training.
3. **Family truth, not another inbox.** Data remains in a clear system of record.
4. **Local and resilient.** Core household functions survive an internet outage.
5. **Power without visible machinery.** Home Assistant can be sophisticated behind a calm interface.
6. **Safe actions.** Voice and automation may simplify a command but do not bypass validation or auditing.
7. **Respect media boundaries.** Hearth remains a separate appliance surface. Normal browsing stays in native Google TV apps; Home Assistant may independently orchestrate voice-requested music without adding media controls to Hearth.

## Primary users

### Household administrator

Connects calendars, establishes people and permissions, creates recurring chores and routines, sets weekly pocket money and payday rules, records payments and configures Home Assistant actions.

### Adult household member

Views and changes events, completes or reassigns tasks, manages meals and lists, and controls permitted home scenes.

### Child household member

Sees a simple personal view, checks off assigned chores, sees weekly progress and the proportional pocket-money amount due, and cannot change household-wide configuration.

### Guest or casual viewer

Can understand the current household state and use clearly exposed room controls without gaining administrative access.

## Interaction surfaces

- The wall-mounted Google TV is the primary shared display.
- The included TV remote is the primary direct controller.
- Home Assistant Voice and iPhones provide speech input.
- A responsive web interface provides administration and on-the-go use.
- Touch is a progressive enhancement only. No required workflow may depend on it.

## Core capabilities

### 1. Shared calendar

- Merge multiple household calendars into one view while retaining source and owner identity.
- Today, week, month and agenda views. Month remains television-legible by pairing compact colour-coded event titles and deterministic overflow counts with one avatar/colour source key rather than repeating faces in every date cell.
- Person/source colour coding with accessible text/icon reinforcement.
- All-day and timed events, locations, notes and recurrence.
- Read-only cached display during provider outages.
- Event creation and editing only after a provider is selected and write scope is explicitly authorised.
- Conflict and sync-state visibility without exposing technical error noise to children.

### 2. Chores and routines

- Chore templates assigned to one or more people.
- One-off, daily, weekly and rule-based recurrence.
- Concrete daily occurrences so historical completion never changes when a template is edited.
- Optional household-local due time, snapshotted onto each occurrence with its title, description,
  routine and assignee.
- Complete and undo from the family surface. Adult skip, excuse and reassignment commands require a
  short reason, permission checks, idempotency and immutable occurrence history.
- Skipping leaves the chore due and incomplete; excusing removes it from the pocket-money
  denominator; reassignment moves an awaiting occurrence to the selected household member.
- Optional evidence/note support later; never required for ordinary chores.
- Morning, after-school, evening, bedtime and anytime chore grouping.
- Streaks and progress that encourage rather than shame.

### 3. Pocket money

- Every participating child has a required weekly amount in Australian dollars and a household-selected payday. These are standing rules that repeat until an adult changes them; they are not re-entered for each week.
- Weekly progress is the number of completed chore occurrences divided by all non-excused,
  non-cancelled occurrences scheduled across the complete Monday–Sunday week. Future scheduled
  chores therefore remain in the denominator until completed, excused or cancelled.
- The amount due is the same proportion of the weekly amount, rounded to the nearest cent. Skipped chores remain due and therefore reduce the proportion.
- A parent can record one or more partial disbursements, each with an optional note. Every payment stores a dated snapshot of the counts, percentage and amount so later chore/template edits do not rewrite payment history; active payments for a week may never exceed the amount currently due.
- Mistakes are corrected with a separate adult-authenticated void record and reason. Hearth never silently edits or deletes a payment, and paid, partially paid and unpaid states remain visible by child and week.
- Recording before the selected payday is allowed with an explicit warning rather than silently blocked.
- Only an adult administrator can change weekly amounts/paydays or record a payment. Chore completion uses the normal actor and permission rules.
- Hearth does not expose star balances, reward choices, redemptions or per-chore point values.

### 4. Lists

- Grocery, packing, shopping, wish and arbitrary custom lists.
- Fast check-off from television, voice and phone.
- Optional owner, colour and due date.
- Checked-item history with a simple clear/archive action.
- Voice ambiguity must be confirmed when two items share a name.

### 5. Reminders

- Hearth owns household reminders directly. A household member may create, edit, complete, reopen
  and remove a reminder through the same private, authenticated command boundary as other Hearth
  content.
- Reminders support a title and optional due date. Date-only reminders remain date-only; Hearth does
  not invent a midnight time.
- The dedicated Reminders screen defaults to open items and can reveal completed items. Today shows
  a bounded summary ordered overdue, due today, undated and then future.
- Apple Reminders, EventKit, VTODO and companion-app synchronisation are not active product
  integrations. The retired proof is retained only under `hearth/archive/apple-reminders-bridge/`.

### 6. Meal planning

- Weekly breakfast/lunch/dinner plan, with dinner prioritised visually.
- The television presents tonight and a calm seven-night dinner strip; dense editing belongs in
  the authenticated phone companion.
- The companion can edit all seven dinners in one save, copy the previous week or explicitly clear
  a week. Saved-meal and note controls remain optional details rather than slowing the primary
  dinner-name path.
- Saved family meals support search, favourites, optional preparation time and notes, recoverable
  archive and restore.
- Meal-plan and saved-meal writes use the same validated, idempotent and audited command path as
  other household-owned data.
- Breakfast and lunch remain valid contract slots but do not receive a dedicated first-release UI
  until a real household need justifies the extra density.
- Link meal ingredients to the grocery list later.
- Do not require recipe management in the first implementation.

### 7. Photos and ambient display

- Let an authenticated adult choose one or more family photos directly from the phone companion.
  Hearth stores bounded, orientation-correct managed masters and display derivatives in its private
  Synology data directory. A separately approved read-only Synology folder may bulk-import an
  existing collection, but is not required for normal use.
- Let an authenticated adult select one or more indexed photos in companion administration, then
  favourite, unfavourite, hide or restore them. Favourites appear first; hidden photos remain
  indexed but never appear on Today, in the gallery or in ambient mode. Phone-managed uploads may
  also be permanently deleted after explicit confirmation. Hearth must never delete an original
  from the optional read-only Synology import folder: remove that original in Synology and run
  **Check folder**, or hide its Hearth projection instead.
- Preserve each image's native aspect ratio. Normal gallery and Today previews must not crop,
  stretch, frame or place a contrasting panel behind the photograph; rounded clipping and a
  temporary focus halo are allowed.
- Present the browsable Photos screen as a full-screen orientation-aware collage with no duplicate
  image and no narrow leftover strips. Compose the selected photo and up to four supports from their
  stored pixel dimensions: the selected image remains a substantial full-height anchor while the
  remaining images form one to three ratio-derived columns. Natural page background may remain as
  negative space when the source shapes cannot form the viewport exactly. Cycle occupants and
  selection calmly about every 45 seconds without turning portraits into landscape cells; pause automatic
  changes when the display requests reduced motion. On a phone held sideways, show three
  substantial rotating occupants instead of compressing all five into shallow strips.
- Overlay only minimal next-event or household information in ambient mode.
- Exit immediately on remote input, voice request or important alert.
- Never leave a static dashboard on overnight; allow Home Assistant to turn the panel off.

Member profile photos are separate from the ambient family-photo collection. An adult administrator
can choose a portrait or landscape image in People, directly drag and pinch/scroll a square crop,
replace it later or restore the member's original avatar. Hearth keeps only a bounded local
derivative; it does not retain or expose the selected original file.

Family-photo uploads are also distinct from Apple Photos or Synology Photos accounts. Hearth does
not accept an Apple shared-album URL, browse a personal library or retain the client filename. The
adult explicitly chooses the files to add and the managed collection is included in the private
Hearth data backup boundary.

### 8. Notices and household summary

- A dedicated Weather destination follows Calendar in primary navigation and presents current
  conditions, a single mode-switching 24-hour graph and a comparable seven-day forecast.
- The graph exposes temperature with apparent temperature, rain probability with expected amount,
  and sustained wind with gusts and direction. Television use requires only D-pad directions and
  Select; the phone uses the same information in a stacked touch-friendly layout.
- Seven-day and Calendar Week temperature bars share a scale within their displayed week, so their
  positions communicate relative warmth rather than acting as decorative progress bars.
- Keep the last successful forecast readable during a provider outage and show its age quietly.
- Brief announcements with expiry and priority.
- Optional household-local daily Bible verse from the ESV API. It is off by default,
  server-fetched, visibly attributed and read-only; provider failure must not affect other Today
  content.
- Current weather and basic room/home state where useful on Today.
- Avoid a dense sensor dashboard. Show only states that affect a family decision.

### 9. Home Assistant controls

- Launch allowlisted scenes and scripts such as Evening, Goodnight and Screen Off.
- Display selected door, climate, energy or presence states.
- No generic entity browser on the family screen.
- Dangerous actions require explicit confirmation and should normally remain outside Hearth.

### 10. Native media boundary

- The Jellyfin server on the Synology remains authoritative for the household media library.
- The native Jellyfin Google TV app connects directly to it for normal movie, television and music browsing and manual playback.
- Outside Hearth, Home Assistant may use Music Assistant to search the Jellyfin music library and stream a requested track to the television's Google Cast receiver or another approved player.
- Voice music should target the resolved Cast/player entity; it does not need to open or automate the native Jellyfin interface.
- Hearth has no Jellyfin or Music Assistant connection, library browser, playback controls or app-launch shortcut.
- Switching between Hearth, Jellyfin and other services uses normal Google TV behaviour.
- Home Assistant provides Hearth only a generic active-media signal so presence automation cannot turn off the television during native or Cast playback.

### 11. Voice

Home Assistant owns the microphone, wake word, speech recognition, intent
handling and Piper response. Hearth does not listen or speak; it validates the
structured request, performs the household command and returns text that Home
Assistant can speak.

- Read today/tomorrow summaries.
- Complete chores and list items.
- Add permitted list items and events.
- Open Hearth.
- Trigger allowlisted Home Assistant scenes.
- Route music requests outside Hearth to the separately configured Home Assistant/Music Assistant intent flow.
- Confirm ambiguous or consequential changes.
- Work for core deterministic commands without an LLM.

Music playback by voice is not a Hearth `/assist` command. As of 2026-08-04,
initiating arbitrary music from Home Assistant Assist requires Music
Assistant's additional community voice-support blueprints/custom intents;
pause, resume, next, previous and volume have core Home Assistant intent
support. The deployment must not describe song-starting as available until
that custom flow and its target-player mapping have been installed and tested.

## Television home screen

The default Today screen should include, in order of prominence:

1. Current time/date, weather and a quiet connectivity indicator when needed.
2. The next few household events and each person's day.
3. Chores/routines due now or today.
4. An optional bounded summary of all incomplete reminders.
5. Dinner and the most relevant list summary.
6. One concise household notice.
7. Home-scene shortcuts in the navigation rail/dock.
8. One optional, orientation-safe preview from the approved family photo source. It should be large enough to appreciate from the sofa while remaining secondary to plans and chores. When multiple approved photos exist, the preview may advance at a calm five-minute visible-screen cadence; Today does not become a rapid slideshow or replace ambient mode.

It must not become a grid of tiny widgets. Information can be prioritised and paged rather than simultaneously exposed.
When a television column contains more plans or chores than its calm visible limit, Today shows an
honest `+N more` action into the full Calendar agenda or Chores module instead of silently dropping
items. Visible event rows open their real details; Dinner, List summary, Notice and Family photo
lead to their corresponding useful destination or full notice text.

## Initial release scope

The first household release includes:

- Household and member setup
- Seeded demo mode plus migration to real household data
- Today, Week, Month and Agenda calendar views; Agenda is a rolling window containing today and the
  next three calendar days only.
- Read-only calendar connection plus editable person/avatar/colour assignments
- Chores/routines, weekly pocket-money progress and payment history
- Lists
- Household-owned reminders with create, edit, complete, reopen and remove actions
- Photo ambient mode
- Responsive administration
- Tested household weather location, configured separately from timezone
- Home Assistant connection with a small allowlist
- Voice completion of a chore
- Android TV shell
- Synology deployment and backup

Meal planning may follow the first vertical release if schedule or quality would otherwise suffer.

## Explicit non-goals for the first release

- A visual dashboard/layout editor
- Pixel-identical imitation of Skylight or any other commercial product
- A general Home Assistant dashboard/entity browser
- Connecting to, controlling or hosting Jellyfin, Music Assistant or Cast inside Hearth; the separately approved Home Assistant deployment may run Music Assistant outside Hearth
- Audio or video playback inside Hearth
- Social feeds, web browsing or advertising
- Public multi-tenant SaaS
- Replacing the responsive web companion with a full native iOS client before feature parity and
  migration evidence exists
- Apple Reminders, EventKit or VTODO synchronisation without a new product/security decision
- Local general-purpose LLM as a launch requirement
- Biometric surveillance or camera-based person identification

## Non-functional requirements

- Common television navigation should feel responsive within 150 ms after local data is loaded.
- The Today screen should become usable within 3 seconds after a cold TV-app launch on the target device and within 1 second after normal resume where cached data is valid.
- Core local screens must remain readable when calendar, Home Assistant or internet services are unavailable.
- All household mutations must be authenticated and auditable.
- Time calculations must use `Australia/Perth` as the household default while storing instants in UTC.
- Recurrence, daylight-saving imports and all-day events require automated tests even though Perth itself does not observe DST.
- No static display should remain illuminated indefinitely without presence or an explicit media session.
- The product must be usable with D-pad only and meet WCAG 2.2 AA contrast and reduced-motion expectations where applicable.
