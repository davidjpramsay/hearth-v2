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

Connects calendars, establishes people and permissions, creates recurring chores and routines, manages rewards and configures Home Assistant actions.

### Adult household member

Views and changes events, completes or reassigns tasks, manages meals and lists, and controls permitted home scenes.

### Child household member

Sees a simple personal view, checks off assigned chores, sees progress and rewards, and cannot change household-wide configuration.

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
- Complete, undo, skip and reassign with permission checks.
- Optional evidence/note support later; never required for ordinary chores.
- Morning, after-school, evening and bedtime routine grouping.
- Streaks and progress that encourage rather than shame.

### 3. Rewards

- Optional points/stars per completed chore.
- Household-configured rewards and redemption targets.
- Reversal-safe ledger rather than a single mutable total.
- Adults can adjust or approve rewards; child actions cannot silently alter balances.

### 4. Lists

- Grocery, packing, shopping, wish and arbitrary custom lists.
- Fast check-off from television, voice and phone.
- Optional owner, colour and due date.
- Checked-item history with a simple clear/archive action.
- Voice ambiguity must be confirmed when two items share a name.

### 5. Meal planning

- Weekly breakfast/lunch/dinner plan, with dinner prioritised visually.
- Saved family meals and notes.
- Link meal ingredients to the grocery list later.
- Do not require recipe management in the first implementation.

### 6. Photos and ambient display

- Rotate approved family photos from a designated Synology source.
- Preserve aspect ratio and use tasteful cropping/background treatment.
- Overlay only minimal next-event or household information in ambient mode.
- Exit immediately on remote input, voice request or important alert.
- Never leave a static dashboard on overnight; allow Home Assistant to turn the panel off.

### 7. Notices and household summary

- Brief announcements with expiry and priority.
- Weather and basic room/home state where useful.
- Avoid a dense sensor dashboard. Show only states that affect a family decision.

### 8. Home Assistant controls

- Launch allowlisted scenes and scripts such as Evening, Goodnight and Screen Off.
- Display selected door, climate, energy or presence states.
- No generic entity browser on the family screen.
- Dangerous actions require explicit confirmation and should normally remain outside Hearth.

### 9. Native media boundary

- The Jellyfin server on the Synology remains authoritative for the household media library.
- The native Jellyfin Google TV app connects directly to it for normal movie, television and music browsing and manual playback.
- Outside Hearth, Home Assistant may use Music Assistant to search the Jellyfin music library and stream a requested track to the television's Google Cast receiver or another approved player.
- Voice music should target the resolved Cast/player entity; it does not need to open or automate the native Jellyfin interface.
- Hearth has no Jellyfin or Music Assistant connection, library browser, playback controls or app-launch shortcut.
- Switching between Hearth, Jellyfin and other services uses normal Google TV behaviour.
- Home Assistant provides Hearth only a generic active-media signal so presence automation cannot turn off the television during native or Cast playback.

### 10. Voice

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
4. Dinner and the most relevant list summary.
5. One concise household notice.
6. Home-scene shortcuts in the navigation rail/dock.
7. One optional, orientation-safe preview from the approved family photo source. It should be large enough to appreciate from the sofa while remaining secondary to plans and chores; Today does not become a slideshow or replace ambient mode.

It must not become a grid of tiny widgets. Information can be prioritised and paged rather than simultaneously exposed.

## Initial release scope

The first household release includes:

- Household and member setup
- Seeded demo mode plus migration to real household data
- Today, Week, Month and Agenda calendar views
- Chores/routines and completion history
- Lists
- Photo ambient mode
- Responsive administration
- Home Assistant connection with a small allowlist
- Voice completion of a chore
- Android TV shell
- Synology deployment and backup

Rewards and meal planning should have schema-ready boundaries but may follow the first vertical release if schedule or quality would otherwise suffer.

## Explicit non-goals for the first release

- A visual dashboard/layout editor
- Pixel-identical imitation of Skylight or any other commercial product
- A general Home Assistant dashboard/entity browser
- Connecting to, controlling or hosting Jellyfin, Music Assistant or Cast inside Hearth; the separately approved Home Assistant deployment may run Music Assistant outside Hearth
- Audio or video playback inside Hearth
- Social feeds, web browsing or advertising
- Public multi-tenant SaaS
- Native iOS application before the responsive web companion proves insufficient
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
