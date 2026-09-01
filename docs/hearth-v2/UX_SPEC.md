# Hearth v2 television and companion UX specification

## Design target

Hearth is viewed on a 65-inch landscape television from roughly two to four metres away. It is not a tablet interface enlarged onto a wall. The initial logical canvas is 1920×1080 and must scale cleanly to a 3840×2160 panel and to ordinary laptop/mobile browsers.

## Original design language

Use a calm domestic visual system rather than an enterprise dashboard or a copy of Skylight:

- warm off-white or deep charcoal surfaces depending on time of day
- charcoal primary text
- eucalyptus green for constructive actions and completion
- clear sky blue for calendar/navigation state
- ochre for attention, not generic decoration
- restrained person colours with labels or avatars as a second cue
- soft depth and grouping, with few large surfaces rather than many cards
- family photography as a first-class visual element

Do not use Skylight artwork, wording, proprietary icons or a screenshot as the implementation template.

## Readability and sizing

- Normal television body text: at least 28 logical px.
- Supporting text: at least 24 logical px when genuinely secondary.
- Major headings/time: 44–72 logical px depending on hierarchy.
- Focusable target height: at least 64 logical px; prefer 72–88 px for repeated rows.
- Maintain a television-safe inset of at least 48 logical px on every edge.
- Do not place essential text over detailed photos without an opaque or strongly graduated treatment.
- Use no more than two dense columns of actionable content on the Today view.

Exact numbers may be refined from real-TV testing, but may not be reduced merely to fit more data.

## Navigation model

Primary commands are Up, Down, Left, Right, Select and Back.

- A persistent navigation rail or dock exposes Today, Calendar, Weather, Chores, Lists, Reminders,
  Meals, selected Home actions and Photos, in that order; Week and Month are views inside Calendar
  rather than competing primary destinations. Reminders appears only after a source has produced
  its first usable snapshot; setup remains phone-first.
- Every household surface shows the live household-local time and date in shared application chrome: in the television rail and in a compact companion header on phone/admin layouts. Individual screens do not repeat their own clock. Pairing and pre-authentication setup remain uncluttered exceptions.
- The focused destination and focused action are always visually obvious.
- Moving between regions is deterministic; no focus trap or unpredictable jump is acceptable.
- Opening a detail page should place focus on its primary meaningful control.
- Back returns to the previous product surface; a second Back at the root may hand control to Google TV after a confirmation or normal Android behaviour.
- When normal Google TV app switching resumes Hearth, restore its prior screen and focus when possible.
- Focus state must not rely on colour alone. Use scale, outline, elevation or shape change with reduced-motion support.
- Long lists use page or controlled scroll behaviour and keep the focused row visible.

Touch, mouse and keyboard can work in companion/admin contexts but cannot be the only path.

## Screen map

### Today

The default shared overview:

- time, date, weather and household mode
- upcoming events grouped by time/person
- due-now and due-today chores
- dinner plan
- one active notice
- concise list summary
- an optional bounded summary of all incomplete reminders, ordered overdue, due today, undated and
  future
- one orientation-safe family-photo panel that is large enough to read from the sofa while
  remaining secondary to plans and chores; landscape and portrait sources must remain fully
  visible without distortion, and the photo sits directly on the page without a tinted or
  blurred backing panel
- quick access to selected Home scenes

Adults may independently show or hide Dinner, List summary, Notice, Reminders, Daily Bible verse
and Family photo from the phone-first **Today & notices** settings surface. The verse opens in a Back-safe
reading dialog so a full quotation and ESV attribution do not make Today dense; a missing server
key produces a calm unavailable band rather than a broken dashboard. Upcoming plans and due chores
remain the stable core. The remaining summary bands expand to
use the freed space; a photo-only configuration is centred rather than leaving
an unexplained empty column. Television Today is a single non-scrolling dashboard rather than a
vertical document. It selects a bounded composition from the enabled band count and the featured
photo's typed orientation: portrait photos use a substantial right-side rail, landscape and square
photos use a shorter wide panel, and no-photo layouts return the full lower width to summary bands.
The two core columns remain equal and share heading and first-card rails. Portrait media begins at
that core upper rail; landscape/square media and the enabled summary bands share one lower rail.
Collapsed modules reserve no track, and the lower content follows the actual core height rather than
floating at the bottom of a taller display.
The Today photo contract carries source dimensions when available, and the image itself sizes from that
native ratio with no persistent frame, crop, shadow or backing panel.
Landscape media receives a band-count-aware share of the lower rail: it grows when fewer summaries
need horizontal room and remains height-bounded on shorter televisions. Square media stays compact
enough to preserve the core dashboard, while portrait media continues to use the upper right rail.
One to four bands become compact tiles without reserving empty rows. The phone keeps its natural
single-column scroll because it is an editing and companion surface rather than a wall appliance.
When more than one approved family photo is available, the Today preview advances after about five
minutes of visible screen time. The Photos screen Pause/Resume control governs this preview for the
current display session as well as the gallery. A hidden document does not consume the interval, and
reduced-motion devices keep the preview static. A reload starts a fresh automatic display session.

The phone-first settings surface keeps this choice direct: it shows the six visibility switches and
notice administration without embedding a second simulated Today screen. Rapid changes are applied
optimistically and serialised so one switch cannot restore another switch's older value. The actual
Today destination remains the authoritative rendered result.

The first focus should usually be the most relevant actionable item, not the navigation chrome.
Today derives the visible event/chore capacity from the rendered composition. Full-height
landscape-photo television layouts may use four rows, while their compact-height counterpart and
compact-square television layouts retain three. Portrait, full-height square and no-photo television
layouts may use up to five when the complete dashboard remains inside one viewport. The phone keeps
three. A deterministic, focusable `+N more` action reports the complete hidden count and
opens the Calendar agenda or Chores screen. Event rows open the same detail dialog as the calendar
views. Dinner, List summary and the photo preview link to Meals, Lists and Photos; an active Notice
opens its full text in a Back-safe dialog. Back restores the exact originating row, overflow action
or summary band.

### Calendar

- **Week:** primary television planning surface; columns/days must remain legible.
- Week day headings include a compact, read-only forecast icon, rain probability, low/high and a
  miniature temperature-range bar when forecast data is available. Every bar uses the same weekly
  scale. The phone agenda carries a compact daily cue without compressing its event list. The
  grouped phone presentation replaces the timeline at narrow widths and must never render as a
  second block beneath the television Week timeline.
- **Agenda:** a chronological, rolling four-day view containing today and the next three calendar
  days. It never includes past dates or days beyond that window and therefore has no earlier/later
  period controls.
- **Today:** expanded day with person lanes where useful.
- **Month:** a Monday-first six-week grid beneath Week in the calendar hierarchy. Television date cells show compact event titles on substantial, readable calendar-colour tinted backgrounds and a deterministic `+N more` summary when the day is dense; faces and solid source colours appear once in a persistent Calendar key. Week event cards use the same deeper tinted-surface language rather than relying on a narrow edge stripe, while text and focus contrast remain accessible in both themes. The six Month rows grow to use the available television height, and the Earlier/current/Later month bar stays at the bottom with the same geometry as Week navigation. Today and keyboard/D-pad focus remain distinct, and each focusable date exposes every event title to assistive technology. The phone retains the grid and key through a Week/Month view switch, and focusing or selecting a date reveals its full titled agenda beneath the narrow grid.

Event cards must express start time, title, owner/source and conflicts. Location and notes appear in a focused detail surface.

### Weather

- Current conditions show temperature, apparent temperature, today's low/high, condition, rain
  likelihood and wind without exposing coordinates or provider machinery.
- One large 24-hour chart switches between Temperature, Rain and Wind. Left/Right moves the selected
  hour; Up/Down changes the mode. Mode buttons remain directly selectable by touch and keyboard.
- Temperature plots actual and apparent temperature. Rain plots probability and reports expected
  millimetres for the selected hour. Wind plots sustained speed and gusts with direction arrows.
- The next seven days use one shared temperature domain. Each row carries day, condition, rain
  probability, low, range bar and high; Today also carries a current-temperature marker.
- Phone presentation stacks naturally without page-level horizontal overflow. A wide chart may
  scroll within its own bounded region, with explicit previous/next-hour controls.
- A stale or offline cached forecast remains visible with one quiet status cue. Provider
  attribution stays in the adult Weather location settings so household-facing Weather and Today
  remain clean.

The Calendar view switch is available on both television and phone. Week,
Month and Agenda keep their own stable URLs beneath `/calendar`; the previous
`/week` and `/month` paths redirect while preserving query parameters. Week and Month earlier,
current-period and later controls must perform real provider-neutral queries; Agenda is always
anchored to the household-local current date.
Calendar source setup is directly discoverable from the Calendar toolbar and
the phone More hub.

### Chores and routines

- The television family overview uses dynamic person columns. Three children produce three primary columns; children remain visible with their weekly pocket-money progress and a clear "No chores due today" state on unscheduled days. Additional assignees appear only when they have chores due.
- Keep ordinary daily workloads within one television viewport by tightening row density only as needed, never below the minimum remote target size. Exceptional workloads must not silently hide chores.
- Up/Down moves within one person’s chores and Left/Right moves to the nearest chore in an adjacent person column.
- Personal view with outstanding and completed items.
- One Select should complete an ordinary chore; undo remains available.
- Adults can open detail/reassignment functions; children see fewer controls.
- Completion feedback is satisfying but brief and respects reduced motion.
- Phone administration keeps active schedules compact, opens creation only on request and clearly
  distinguishes **One day only**, daily, weekdays and selected weekly days. Archiving requires a
  second explicit action and withdraws unfinished jobs already due today. Completed jobs remain
  visible; archived schedules can resume without filling the paused interval with new occurrences.
- The phone schedule editor uses an explicit multi-person picker. Selecting several people creates
  one separately completable occurrence for each selected person; summaries name the full assignee
  set rather than implying that one shared completion satisfies everyone.
- The phone schedule editor lets an adult move active schedules earlier or later with substantial,
  labelled controls. That explicit top-to-bottom order is the television order; drag, touch or
  hidden heuristics are never required. New schedules append to the end.
- The schedule editor labels its grouping field **Time of day** and uses one native selector with
  exactly **Morning**, **After school**, **Evening**, **Bedtime** and **Anytime**. Adults do not type
  arbitrary group names; the fixed vocabulary keeps phone authoring and television grouping clear.
- An optional **Available from** and **Due by** pair forms a household-local time window. Either end
  may be used independently; when both are present, the start must be earlier than the due time.
  Previously generated occurrences keep the window and order they were created with.
- A separate phone-first **Today’s chores** surface opens one occurrence at a time. It shows the
  snapshotted description and due time, requires an adult reason before Skip, Excuse or Reassign,
  explains the pocket-money consequence in family language and keeps newest-first history visible.
- The television shows a compact time window such as **7:00–7:30 am**, **From 4:00 pm** or
  **Due 6:30 pm** as quiet secondary metadata. Rows follow the adult-defined schedule order and
  retain one-Select completion/undo; the television does not expose ordering, exception forms or an
  audit timeline.

### Lists

- List chooser plus focused list.
- Large checkable rows and visible item count.
- Home Assistant Assist can add items through Hearth's typed command API; Hearth does not show a listening control.
- Editing long text is primarily a phone/admin-web action.
- The phone Family Planning surface can create, rename, type, colour, order,
  archive and restore lists; it can edit quantities, order or remove items and
  clear checked history only after explicit confirmation. The television keeps
  only the family check/undo interaction.

### Reminders

- The television and phone show the same Hearth-owned reminder list. Open items are the default;
  **All** may reveal completed items.
- A household member can add a reminder quickly, optionally choose a due date, edit it later and use
  one clear control to complete or reopen it. Removal requires explicit confirmation.
- Date-only reminders never acquire a misleading midnight time. Open reminders sort overdue, due
  today, undated and then future, with deterministic title ordering within each group.
- Today shows a compact summary and honest overflow link into Reminders. It never consumes all
  lower-band space or causes the appliance dashboard to scroll.
- There is no Apple pairing, selected-list or source-freshness UI.

### Meals

- Seven-day dinner strip or week plan.
- Today's meal receives priority on Home.
- The TV's **Saved family meals** and **Plan another night** actions open real authenticated
  companion destinations; they are not acknowledgement-only controls.
- Phone administration keeps all seven dinner-name fields visible together for rapid planning.
  Saved-meal selection and a note expand per night only when needed.
- Saved meals are searchable, show favourites first, expose optional preparation time/notes and use
  recoverable archive/restore rather than destructive deletion.
- Copying or clearing a week requires an explicit confirmation. One **Save week** action commits the
  displayed seven-night plan together and reports failure without silently dropping entered data.
- Breakfast/lunch and grocery linkage remain available future extensions without cluttering the
  dinner-first television or phone paths.

### Photos

- Full-screen ambient slideshow.
- The normal Photos screen is an orientation-aware full-screen collage rather than a large image
  plus a duplicated thumbnail. The selected or automatically advanced photo remains present while
  Hearth chooses the visible occupants and geometry from every photo's stored width and height.
  The selected photo is a substantial full-height anchor and up to four supports form ratio-derived
  vertical columns. Each leaf retains its exact native ratio; the gallery accepts calm negative
  space instead of cropping, stretching or placing photos in framed cards. A focus halo exists only
  while navigating. Phone portrait uses an orientation-aware mosaic so landscape files span both columns
  while portraits remain tall, rather than stacking several narrow strips. Phone
  landscape shows three substantial images at a time and lets rotation bring the remaining photos
  through, rather than squeezing the five-image television composition into shallow ribbons.
- The collage advances its selected photo and visible occupants every 45 seconds with a restrained
  image settle while recomputing the orientation-aware composition.
  A compact refresh symbol and progress line make the next automatic arrangement legible without
  repeating collection/storage or timing copy on the dashboard; the combined state remains
  available to assistive technology. Manual D-pad/touch selection restarts that interval. A clearly labelled Pause/Resume
  control is reachable by remote and touch, hidden tabs do not consume rotations, and reduced-motion
  mode leaves the collage static.
- Optional minimal overlay: time, next event and discreet notification badge.
- Immediate remote exit.
- Photo storage/import errors should never reveal filesystem paths or technical details to the household.
- Phone-first Photos administration begins with **Add photos**, opens the native
  multi-select photo picker and reports added, duplicate and failed counts without sending client
  filenames to the server. Each file is limited to 25 MB and uploads run sequentially so a partial
  failure does not discard successful additions.
- Phone navigation names the two photo intents explicitly: **Photos** opens the gallery
  and ambient display, while a prominent **Manage photos** row under Manage Hearth opens upload,
  curation and removal. Adults should not have to enter the display gallery to discover the upload
  surface.
- The same surface shows orientation-safe thumbnails, capture date when available and clear
  Favourite, Hide and Restore actions. Selection mode supports bulk hide, restore and managed-upload
  deletion without turning ordinary browsing into a destructive surface. Cards identify whether
  the photo was **Added in Hearth** or came from the **NAS folder**. Permanent deletion is available
  only for Hearth-managed uploads, requires a focused confirmation dialog and removes the managed
  master plus its derivatives. Imported originals remain read-only: the surface explains that they
  must be removed from the approved Synology folder and followed by **Check folder**, or hidden in
  Hearth. Every action is D-pad reachable, reports its result inline and restores focus. The optional
  Synology folder-import row is secondary and absent as a prerequisite for normal phone uploads.

### Home

- A deliberately curated set of scenes and important states.
- No raw entity IDs.
- Initial actions: Evening, Goodnight and Screen Off.
- Security-sensitive controls are omitted or require adult confirmation.

### Settings/admin

- Household, member, integration and permissions management.
- Optimised for the companion browser rather than the family TV.
- Visible copy is task-first. A heading or control label is not followed by text that merely repeats
  it. Keep explanations only when they affect a decision, explain state, or protect privacy,
  recovery or an irreversible action.
- The TV may show connection status and pairing QR/code but should not expose secrets.
- A non-Android television browser that cannot complete passkey authentication offers **Pair this
  screen as a television**. It creates a short-lived six-character code for approval in phone More
  → Televisions, then opens the family dashboard with television scope rather than adult Admin
  scope. Recovery codes are never a television sign-in mechanism.
- Connections > Calendar offers an adult-only, phone-first setup sequence: enter
  an HTTPS CalDAV address/account/app-specific password, test, review the
  discovered names, select the exact calendars, optionally map each to a person,
  then save. Clear the password field immediately after testing. Connected state
  shows only hostname, masked account, selected calendars, owner cues and
  read-only status. Every connected source permanently presents **Calendar
  name → Assigned person → Display colour**. An adult may change those
  assignments at any time without reconnecting or re-entering a password; a
  person assignment uses that member's current avatar and Hearth colour, while
  Whole family uses Hearth's fixed green household mark and family colour rather
  than a member photo. **Edit calendars** securely rediscovers the account using
  its saved server-side sign-in, allowing calendars to be added or removed
  without returning or re-entering the password. **Replace connection** is used
  only when the account, server address or app-specific password changes;
  removal remains a separate explicit action.
- Household keeps timezone and weather location as separate settings. Weather
  setup searches by suburb/postcode or requests this phone's location once,
  shows a family-readable place label, hides coordinates under **Advanced**,
  and requires a successful current-conditions test before Save is enabled.
- Phone More is a genuine hub rather than a direct jump into settings: family
  destinations appear first, followed by a clearly labelled Manage Hearth group and device-local
  appearance. Display and administration verbs stay distinct, including **Photos** and
  **Manage photos**. Navigation rows use their self-explanatory titles without repeated descriptive
  subtitles, keeping each bar slim and scannable. The administration root is named Hearth settings
  so it cannot be confused with the Home Assistant action surface. Television pairing is one
  row/action inside Televisions, not a duplicate call to action on the settings root.
- Hearth settings groups destinations by family content, household and access, connections and
  displays, then system. Each group is one joined list with a continuous remote-focus order rather
  than a collection of visually unrelated cards. Joined groups use restrained, slightly squared
  corners and title-only rows; detailed explanation belongs inside the destination screen. System
  Health combines database/backup state with path-free Calendar, Home Assistant
  and Photos setup status; it links to the dedicated setup screen instead of
  exposing credentials or raw provider details. When an appliance update is available it appears
  immediately after the health summary, shows the actual blocking action instead of an inert
  button, and uses short release identifiers. Update and scheduled backups are automatic; the
  uncommon manual copy action stays collapsed under **Advanced recovery**.
- Today & notices lets an adult publish, edit and remove concise notices, choose
  Standard or Important priority, choose a bounded expiry or keep-until-removed,
  and see which eligible notice currently wins. It also owns the six optional
  Today summary switches; on a phone these are full-width joined rows with a compact icon, title and
  trailing switch. It is not a general layout editor.
- Adult access shows every named adult's enrolled passkeys and recovery readiness. An administrator
  can enrol another passkey on that adult's phone, revoke a lost credential and, after confirming
  their current passkey, rotate a one-time recovery code that is displayed only once. The signed-out
  recovery surface explains that recovery replaces the passkey and signs out that adult's older
  sessions; no shared password or invitation URL is exposed.

### Appearance and evening comfort

- Offer Light, Dark and Automatic themes as a per-display preference. Automatic follows that
  display's browser/operating-system colour scheme; changing a phone does not silently restyle the
  television.
- Use a warm charcoal canvas and softened surfaces in Dark rather than pure black. Preserve
  member/event identity colours, semantic states and the high-contrast blue D-pad focus treatment.
- Provide Appearance as a device-local control in companion More and as a small remote-reachable
  television rail utility. It must not require administrator authentication because it changes only
  that browser or paired display and cannot mutate household data.
- Keep evening dimming independent of theme and Home Assistant's Evening scene. It reduces Hearth's
  overall rendered glare, including photos and ambient mode, but does not claim to change panel
  hardware brightness.
- Apply the saved appearance before React renders to avoid a bright startup flash.

## Responsive companion

The same web application may present a phone-oriented shell for:

- adding/editing events
- managing one-off and recurring chores, weekly pocket-money amounts, paydays and payment records
- maintaining meals and lists
- uploading/approving photos
- reviewing connection problems
- configuring Home Assistant actions
- managing named adult passkeys and one-time local recovery

The companion is responsive, not a shrunken TV canvas. Phone, tablet and television use the same
components and data, with deliberate responsive compositions rather than duplicated screens. Tablet
household views retain companion navigation and use one or two content columns according to
orientation. At desktop widths, administration uses a persistent settings rail and a wider content
canvas. Phone widths retain the compact bottom navigation and single-column flow.

Pocket-money administration separates standing **Weekly settings** from **Weekly progress**. Each
child's amount and payday are configured once and repeat until changed. A labelled **Week to review**
selector defaults to this week and offers past weeks only; it never makes the standing settings look
week-specific. The screen provides named setup warnings, paid/partially-paid/unpaid states and a
recent payment history. Adults may record a full or partial amount with an optional note. Before
payday the interface warns that early recording is allowed. A mistake opens a reason form and
creates a visible void record; no interface offers silent payment editing or deletion.

## Required UI states

Every data-driven surface needs intentional states for:

- first-use/empty
- loading
- stale cached data
- integration unavailable
- permission denied
- offline
- optimistic mutation in progress
- mutation failure with safe retry
- destructive or ambiguous confirmation

Do not substitute raw JSON, spinners without context or toast-only errors.

## Accessibility

- WCAG 2.2 AA contrast for text and controls.
- Visible focus with at least a 3:1 contrast change against adjacent colours.
- Colour is never the only person/calendar/status signal.
- People setup offers a curated twelve-colour Hearth palette. Every swatch has a visible name,
  native radio semantics, and a checked/focus treatment so colour is never the only selection cue.
- Each existing person has a clearly labelled profile-photo control. After choosing any
  browser-decodable portrait or landscape image, an accessible modal previews the square crop and
  lets the companion user drag to position and pinch or scroll to zoom. Do not expose three
  technical range controls for this phone-first task. The crop surface itself remains keyboard
  operable: arrows move the image, plus/minus change zoom and Home resets it. Save, cancel, replace
  and restore-original states remain usable on a 390-pixel companion; failure stays inline with
  retry.
- Respect reduced-motion settings.
- Avoid time-limited interaction.
- Announce important state changes to assistive technology in the web companion.
- Use plain, family-readable language rather than home-automation jargon.

## Render verification viewports

At minimum inspect:

- 3840×2160 at target TV scale
- 1920×1080
- 1366×768 for constrained testing
- 820×1180 iPad portrait
- 1180×820 iPad landscape
- 390×844 iPhone portrait
- 844×390 iPhone landscape

The decisive check is real-TV or Android TV emulator navigation using only D-pad and Back.
