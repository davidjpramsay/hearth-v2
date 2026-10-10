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
  rather than competing primary destinations. Reminders are native household records and remain
  available even before the first reminder is created; administration remains phone-first.
- Every household surface shows the live household-local time and date in shared application chrome: in the television rail and in a compact companion header on phone/admin layouts. Individual screens do not repeat their own clock. Pairing and pre-authentication setup remain uncluttered exceptions.
- Phone dates and event titles wrap within the available width. Keep automatic mobile text
  inflation at the authored responsive size while retaining user zoom. The phone navigation and
  page's trailing space share the full home-indicator safe-area allowance, including landscape
  side insets. Use a single fixed bottom anchor, not a competing viewport-height top calculation,
  so the bar stays at the browser's bottom edge as controls expand/collapse and the page scrolls;
  hide it only during focused editing with a keyboard-sized visual-viewport reduction, then restore
  it when that reduction ends. Native editing and pinch zoom remain available.
- The television rail starts with the time and date in place of the Hearth logo/title; no duplicate clock appears in its footer.
- The focused destination and focused action are always visually obvious.
- Television rail rows use a stable inset focus outline, without enlargement or an outer glow that
  the scrolling navigation clips. Apply the same bounded treatment to the rail's Appearance action.
  On short displays, scroll only the rail's navigation region to reveal the current destination
  without moving the clock, footer or page. On resize, a focused navigation row takes precedence
  over the active destination so the remote user's focus never disappears.
  Up/Down follows that single column's menu order through Games before the fixed Appearance footer;
  clipped rows are not skipped merely because the footer is geometrically closer.
- Moving between regions is deterministic; no focus trap or unpredictable jump is acceptable.
- Arrow navigation follows rendered control positions, not fixed cross-screen links; responsive
  reflow therefore changes direction naturally. Hidden, disabled and inert controls are skipped.
  Up/Down stays within the desktop navigation rail; Left/Right moves between rail and content.
  Movement continues through adjacent page content before entering the navigation rail or a fixed phone navigation bar.
  Clearly aligned neighbours take priority over header actions that only graze a row's edge.
  Text fields, selects and screen-specific widgets retain their native/custom arrow handling.
  Calendar views initially focus their selected Week/Month/Agenda selector, not an event; Enter
  opens details and Back restores the event that opened them. Arrows and Tab stay inside dialogs.
- Opening a detail page should place focus on its primary meaningful control.
- Back returns to the previous product surface; a second Back at the root may hand control to Google TV after a confirmation or normal Android behaviour.
- When normal Google TV app switching resumes Hearth, restore its prior screen and focus when possible.
- Focus state must not rely on colour alone. Use scale, outline, elevation or shape change with reduced-motion support.
- Long lists use page or controlled scroll behaviour and keep the focused row visible.
- Calendar Week keeps earlier/current/later controls available on television and companion screens,
  including empty weeks. Multi-day cards have distinct per-date focus targets.
- Week, Month and Agenda place the heading and displayed date range/year on one baseline when
  space permits, wrapping naturally on narrow screens rather than reserving a second header row.

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
- Week places all-day events in one shared-height band above the aligned hourly timeline. Timed
  cards whose readable rendered bounds would collide use deterministic side-by-side lanes; no card
  may paint over another. The shared clock axis starts with 8 am–8 pm and expands in two-hour steps
  for early/late plans, up to midnight-to-midnight. Overnight plans are clipped to each household-local
  day, with continuation labels and their full start/end range in details; a midnight end is exclusive.
- Week shows at most two all-day rows and two timed lanes per day. Extra events, including short
  late events that cannot fit a readable card before the axis ends, count towards `+N more` beneath
  that day. It opens the full day list with every event and source, not just the hidden events.
  The list scrolls within a focus-contained dialog; Select opens details, Back returns to the same
  list row, and a second Back restores the Week opener. Left/Right crosses non-empty day columns.
- Week day headings include a compact, read-only forecast icon, rain probability and low/high,
  without a temperature-range bar. Empty timeline days remain blank, without placeholder dashes.
  The phone agenda carries a compact daily cue without compressing its event list. The
  grouped phone presentation replaces the timeline at narrow widths and must never render as a
  second block beneath the television Week timeline.
- **Agenda:** a chronological, rolling four-day view containing today and the next three calendar
  days. It never includes past dates or days beyond that window and therefore has no earlier/later
  period controls.
- **Today:** expanded day with person lanes where useful.
- **Month:** a Monday-first six-week grid beneath Week in the calendar hierarchy. Television date cells show compact event titles on substantial, readable calendar-colour tinted backgrounds and a deterministic `+N more` summary when the day is dense; faces and solid source colours appear once in a persistent Calendar key. Week event cards use the same deeper tinted-surface language rather than relying on a narrow edge stripe, while text and focus contrast remain accessible in both themes. The six Month rows grow to use the available television height, and the Earlier/current/Later month bar stays at the bottom with the same geometry as Week navigation. Today and keyboard/D-pad focus remain distinct, and each focusable date exposes every event title to assistive technology. The phone retains the grid and key through a Week/Month view switch, and focusing or selecting a date reveals its full titled agenda beneath the narrow grid.

Event cards must express start time, title, owner/source and conflicts. Location and notes appear in a focused detail surface.
Calendar event fills are opaque in both themes, retaining source-colour tints without showing grid
lines or other cards through them. Agenda rows likewise use solid surfaces.

### Weather

- Current conditions show temperature, apparent temperature, today's low/high, condition, rain
  likelihood and wind without exposing coordinates or provider machinery.
- One daily midnight-to-midnight chart switches between Temperature, Rain and Wind. The axis stays
  fixed throughout the household-local day; its right-hand midnight starts the next day. A filled
  dot follows the shared household clock each minute, on the forecast curve rather than claiming
  a new observation. Left/Right inspects another hour with a distinct hollow marker; Up/Down changes
  mode. **Now** or remote Select returns to following time without removing the live dot. A new day's forecast resets
  old-day inspection; an old cached day never receives a misleading current-time dot.
- Temperature plots temperature and apparent temperature. Rain uses two aligned lanes in the one
  active daily graph: a purple probability line on a fixed 0–100% scale, and blue expected-rain
  bars on a separately labelled, zero-based millimetres-per-hour scale. Colour is redundant with
  line/bar shape, explicit lane labels and units. The selected probability and expected amount
  remain visible on phones. Wind plots sustained speed and gusts from zero with direction arrows.
- The next seven days use one shared temperature domain. Each row carries day, condition, rain
  probability, daily maximum wind speed with prevailing direction, low, range bar and high; Today
  also carries a current-temperature marker. Wind wraps to a second line on phones. Missing wind
  reads **Wind unavailable**, not zero; a reported zero reads **Calm**.
- Phone presentation stacks naturally with the full day visible and no horizontal graph scrolling.
  Recompute geometry from the actual plot width and height rather than stretching a desktop SVG;
  labels, icons and round markers retain their proportions. Use fewer ticks/icons on a narrow phone,
  with explicit previous/next-hour controls. Missing samples leave gaps, never fabricated data.
- A tap inspects the nearest available hour without capturing a pointer or taking over page scroll;
  hour buttons and D-pad remain equivalent paths. **Now** restores following. Geometry is measured
  before painting a mode-height change and pointer positions account for the 4K shell's CSS zoom.
  Current low/high labels and the visible Seven days heading clarify the reading order; wide
  weekly rows label rain chance, maximum wind and the shared low–high temperature comparison.
- A stale or offline cached forecast remains visible with one quiet status cue. Provider
  attribution stays in the adult Weather location settings so household-facing Weather and Today
  remain clean.
  Saved/offline status occupies the normal header freshness line, with the saved forecast age
  beside the hour controls; it does not add a banner that pushes days off a compact television.

The Calendar view switch is available on both television and phone in Agenda, Week, Month order.
The Calendar navigation destination and `/calendar` open Agenda by default. Agenda, Week and
Month keep their own stable URLs beneath `/calendar`; the previous
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
  New chores start with nobody selected; editing starts with the saved assignee set. Every People
  checkbox can be freely selected or deselected, including the last one. Saving with nobody selected
  shows **Choose at least one person.** beside People, moves focus to the picker and sends no command.
  Choosing a person clears that error without discarding the rest of the draft. Focus alone never
  selects a person; there is no first-child or adult fallback assignment.
- The phone schedule editor lets an adult move active schedules earlier or later with substantial,
  labelled controls. That explicit top-to-bottom order is the television order; drag, touch or
  hidden heuristics are never required. New schedules append to the end.
- The schedule editor labels its grouping field **Time of day** and uses one native selector with
  exactly **Morning**, **After school**, **Evening**, **Bedtime** and **Anytime**. Adults do not type
  arbitrary group names; the fixed vocabulary keeps phone authoring and television grouping clear.
- An optional **Available from** and **Due by** pair forms a household-local time window. Either end
  may be used independently; when both are present, the start must be earlier than the due time.
  Previously generated occurrences keep the window and order they were created with.
- A separate phone-first **Chores this week** surface opens today's occurrences one at a time. It
  shows the snapshotted description and due time, requires an adult reason before Skip, Excuse or
  Reassign, explains the pocket-money consequence in family language and keeps newest-first history
  visible. Below it, earlier current-week occurrences are grouped by day so an adult can complete a
  missed chore or undo an incorrect completion. The visible correction list starts fresh each
  Monday; occurrence and audit history remain stored.
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
- Open/All sits directly above the list, below the creation form, so the form cannot block
  the remote's path back to the filters. Entry focuses Open rather than starting text editing.
  Both filters use the same loaded projection; switching never removes the focused button.
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
- Ambient photos have one content-width clock/date and **Back** control, bounded by the safe insets
  rather than a full-width background strip. It reads the shared household clock. Keyboard/remote
  focus is visible on that compact control, never as an outline around the whole photograph or
  viewport. The full-image pointer dismiss area is not a second keyboard/screen-reader stop.
- Immediate remote exit.
- Photo storage/import errors should never reveal filesystem paths or technical details to the household.
- Phone-first Photos administration begins with **Add photos**, opens the native
  multi-select photo picker and reports added, duplicate and failed counts without sending client
  filenames to the server. Each file is limited to 25 MB and uploads run sequentially so a partial
  failure does not discard successful additions.
- Phone navigation names the two photo intents explicitly: **Photos** opens the gallery
  and ambient display, while a direct **Manage photos** row under Manage Hearth opens upload,
  curation and removal. Adults should not have to enter the display gallery to discover the upload
  surface. Its row, text and icon use the same colours as peer settings in light and dark themes;
  photo management has no special purple emphasis.
- The same surface shows orientation-safe thumbnails, capture date when available and clear
  Favourite, Hide and Restore actions. Selection mode supports bulk hide, restore and managed-upload
  deletion without turning ordinary browsing into a destructive surface. Cards identify whether
  the photo was **Added in Hearth** or came from the **NAS folder**. Permanent deletion is available
  only for Hearth-managed uploads, requires a focused confirmation dialog and removes the managed
  master plus its derivatives. Imported originals remain read-only: the surface explains that they
  must be removed from the approved Synology folder and followed by **Check folder**, or hidden in
  Hearth. Every action is D-pad reachable, reports its result inline and restores focus. The optional
  Synology folder-import row is secondary and absent as a prerequisite for normal phone uploads.

### Games

- Games opens Word groups, with a four-column board, a clear selected state and explicit Submit.
  Selecting four tiles never submits automatically. Correct groups replace their row; four misses
  reveal the remaining answers. Repeating the same group does not consume another mistake.
- Shuffle preserves tile identity and selections. A three-correct guess reports **One away**.
  Solved groups show their category and all four tiles, not just a colour.
- Earlier/later and Archive select numbered, dated puzzles. Archive supports search and bounded
  pages, with contained D-pad/Tab/Back navigation and opener focus restoration.
- Start at puzzle #1 after the requested reset. Later visits resume the earliest uncompleted
  puzzle, while an explicit archive selection remains available. Browse in ascending puzzle order.
  Completed puzzles have a visible archive marker/count and a **Next puzzle** action after a win;
  the win remains visible until the player chooses to continue. Replaying does not erase completion.
- Progress survives reload on this device; a fresh puzzle never inherits another puzzle's guesses.
  A completed game can be replayed. Restarting unfinished progress requires confirmation.
- Keep the original Hearth design, no newspaper images, logos, screenshots or replica interface.
  A fixed snapshot never implies a live daily subscription. An unavailable import fails only Games;
  cached boards remain playable offline. No external website is contacted during play.

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
- Paired displays and recognized television browsers expose no administration links, chrome,
  sign-in prompts or recovery controls. This covers Calendar Sources, empty-calendar guidance,
  Lists/Meals management, unconfigured Weather, More/System and the private pairing shortcut.
  Empty calendar/weather/photo states ask an adult to finish setup from their phone. Direct,
  restored, encoded, case-varied and history navigation to administration returns to Today before
  admin chrome or child screens mount. `/admin/appearance` remains a compatible alias to the
  harmless device-local Appearance screen. Phone/desktop controller navigation remains available.
- Signed-out browsers clearly separate **Phone or computer** (adult passkey sign-in) from
  **Shared screen** (TV or wall tablet approved from an adult phone). Neither path starts
  automatically. **Connect shared screen** shows three short steps and a six-character code;
  phone More → **Phones & screens** contains the matching **Connect screen** action. Approval
  exchanges only the display's private local proof and opens the family dashboard without adult
  settings access. Expired codes disappear, retry is explicit, and Cancel/Back restores the opener
  without resuming a late request. Recovery stays under **Trouble signing in?**, with its replacement
  consequences stated; it is never a screen sign-in mechanism.
  First household setup is available on passkey-capable phones and desktop computers; a wide
  window alone never hides it. Actual television browsers are directed to that companion setup.
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
  so it cannot be confused with the Home Assistant action surface. **Phones & screens** is one
  connection hub: personal-device address/sign-in and adult passkey management are separate from
  shared-screen code approval and confirmed disconnection. Show compact adult rows first, with
  one named-phone setup action per adult. Keep address help, key details and recovery collapsed;
  optional recovery must not show a "Recovery needed" warning on ordinary controller rows.
  Keep existing `/admin/televisions` and
  `/admin/access` links compatible. Pairing previews are explicitly fictional demo-only content;
  they are not a second production connection route.
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
  Progress appears only during an active update. Completion shows a concise installed state;
  a newer release remains installable after that. Cancelling passkey confirmation or rejecting a
  command leaves retry available; only a lost installation response starts reconnecting.
- Today & notices lets an adult publish, edit and remove concise notices, choose
  Standard or Important priority, choose a bounded expiry or keep-until-removed,
  and see which eligible notice currently wins. It also owns the six optional
  Today summary switches; on a phone these are full-width joined rows with a compact icon, title and
  trailing switch. It is not a general layout editor.
- Adult access shows each named adult's sign-in setup, with key details and optional recovery under
  **Advanced sign-in & recovery**. Never render a dead Remove button for the final protected key;
  explain visibly how to add another key or configure recovery instead. An administrator
  can enrol another passkey on that adult's phone, revoke a lost credential and, after confirming
  their current passkey, rotate a one-time recovery code that is displayed only once. The signed-out
  recovery surface explains that recovery replaces the passkey and signs out that adult's older
  sessions; no shared password or invitation URL is exposed.
- Phones & screens leads with **Adult phones**, the signed-in adult and the existing controller
  permissions for each adult. Phone access is personal passkey sign-in; only a TV/wall display uses
  a six-character connection code. Synced passkeys are not a connected-phone inventory. Enrol a
  new adult's key on that adult's own phone/password manager. **Set up this phone** explicitly
  signs this browser in as the chosen adult after verified registration, replacing only the helper's
  current browser session and clearing its private caches. Existing permissions remain unchanged.
  Keep recovery distinct from normal phone setup. List authorized screens with paired and
  last-contact times, without calling them online. Collapse disconnected screen history, preserve
  its records and require explicit confirmation for a currently authorized screen's revocation.

### Appearance and evening comfort

- Offer Light, Dark and Automatic themes as a per-display preference. Automatic follows that
  display's browser/operating-system colour scheme; changing a phone does not silently restyle the
  television.
- Use a warm charcoal canvas and softened surfaces in Dark rather than pure black. Preserve
  member/event identity colours, semantic states and the high-contrast blue D-pad focus treatment.
- Provide Appearance as a device-local control in companion More and as a small remote-reachable
  television rail utility. It must not require administrator authentication because it changes only
  that browser or paired display and cannot mutate household data.
- Appearance uses the normal responsive family-screen shell, not a capped phone/admin column.
  Wide displays keep the television rail and one household clock, with large side-by-side theme
  choices and readable evening-comfort controls; phone widths keep stacked choices and bottom
  navigation. Width determines presentation only, never adult or screen authority. Preserve
  D-pad movement, Back/focus restoration and the compatible `/admin/appearance` redirect.
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

Admin loading and initial failures retain the page title and Back control; recoverable failures
offer an inline **Try again**. A background read failure does not hide available settings or drafts.
Loading chrome remains keyboard-accessible but does not take automatic focus ahead of the loaded
screen's meaningful entry control.
Retry restores a usable screen control after the error node disappears. A short burst of remote
directions through a lazy route load is applied once its controls arrive; activation is not replayed.
Short request deadlines replace endless startup loading with recovery, without bypassing sign-in.

Meal-week, household, pocket-money-rule, list-add and reminder-create drafts warn before route/history
navigation or page exit. Automatic release reloads wait while a registered draft exists. Successful
list/reminder submission clears only the matching submitted draft, not newer typing. Failed or
unanswered commands keep their original request ID and values when retried.

Incoming meal-plan updates refresh untouched days but preserve edited days. Conflicting days show
**Use latest dinners** / **Keep my edits**, with Save blocked until a choice is made. Pending week
saves temporarily disable dinner inputs. Meals follows the current week through Monday rollover
unless the user intentionally browses; **This week** returns to following. Other weeks use a selected
day label rather than calling a different date's meal Tonight.

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
  Each person's palette, including Add someone, starts collapsed behind a compact Colour row
  showing the current named swatch. Open it only to change colour; collapsing retains the selected
  form value. Native keyboard disclosure/radio interaction and form reset remain supported.
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
