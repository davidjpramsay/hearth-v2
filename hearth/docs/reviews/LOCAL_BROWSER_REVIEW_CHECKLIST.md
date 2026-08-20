# Hearth local browser review checklist

Date reviewed: ____________________

Reviewer: ____________________

Browser: ____________________

This is a product-review checklist for the fictional demo household. Nothing in
this review connects to a real calendar, Home Assistant or household account.

## How to record a finding

Use one short entry for each thing you want changed:

```text
Screen:
Type: bug / change / add / remove / wording / visual / question
Priority: must fix / should fix / idea
What I saw:
What I expected or would prefer:
Screenshot, if useful:
```

Do not worry about proposing the technical solution. Comments such as “this is
too small from the couch”, “I do not understand this label” and “I expected my
shopping list here” are the most useful feedback.

## Start the review

- [ ] Open [Today](http://127.0.0.1:4320/today) at 100% browser zoom.
- [ ] Open [Admin](http://127.0.0.1:4320/admin) in a second tab.
- [ ] Confirm the demo date is Monday 3 August 2026; this is intentionally fixed.
- [ ] If Hearth is not running, open Terminal, change to the `hearth/` directory
      and run `pnpm dev`.
- [ ] Keep the browser console closed for the first pass; judge it like a family
      appliance.
- [ ] Note the first three things that feel good.
- [ ] Note the first three things that feel confusing, unnecessary or missing.

## Whole-product first impression

- [ ] Does it feel like a calm household product rather than a technical dashboard?
- [ ] Can you understand the purpose of the current screen in under five seconds?
- [ ] Is the most important information the first thing your eye finds?
- [ ] Is anything visually shouting when it should be quiet?
- [ ] Is anything too subtle to notice from a couch?
- [ ] Does the wording sound natural for your family?
- [ ] Are “Hearth”, “Home”, “Today” and “Admin” clearly distinct concepts?
- [ ] Identify anything that feels like unnecessary duplication.
- [ ] Identify information that you expected but cannot find.
- [ ] Identify anything you would never use and would prefer removed.

## Television layout and remote-equivalent keyboard test

Use only Arrow keys, Enter and Escape. Avoid the mouse for this section.

- [ ] Start on Today and confirm focus lands on the first relevant chore.
- [ ] Confirm focus is always visible through colour, outline and shape/elevation.
- [ ] Press Left until focus reaches the navigation rail.
- [ ] Move through every rail item with Up and Down.
- [ ] Enter Photos and confirm the selected family image and five favourites appear.
- [ ] Enter Today, Week, Chores, Lists, Meals, Photos and Home from the rail.
- [ ] Confirm each screen focuses its most meaningful first control.
- [ ] Confirm Arrow movement feels spatially predictable.
- [ ] Confirm focus never disappears into the page background.
- [ ] Confirm focus never lands on non-interactive text.
- [ ] Confirm long pages scroll to keep the focused row visible.
- [ ] Press Escape after moving between screens and confirm it returns through
      history rather than unexpectedly closing or jumping.
- [ ] Confirm Back restores the previously focused control where practical.
- [ ] Hold an Arrow key briefly and check that focus remains controllable.
- [ ] Decide whether the blue focus treatment is prominent enough from two to
      four metres away.
- [ ] Decide whether rail icons and labels are large enough.
- [ ] Decide whether the rail should always be visible or become quieter.

Recommended browser viewport checks:

- [ ] 1920×1080 television layout.
- [ ] 1366×768 smaller desktop/television layout.
- [ ] 3840×2160 if your browser/device can emulate it.
- [ ] Confirm there is comfortable safe space around every edge.
- [ ] Confirm no titles, times, names or buttons are clipped.

## Today

- [ ] Is Today the right default screen for the television?
- [ ] Is the date/time/weather area useful and correctly prioritised?
- [ ] Decide whether weather belongs here, should be smaller or should be removed.
- [ ] Are upcoming events ordered and grouped as you expect?
- [ ] Are event time, title, owner and colour easy to distinguish?
- [ ] Are three events the right number before the Week screen becomes necessary?
- [ ] Do long event titles truncate gracefully without losing essential meaning?
- [ ] Is “Due now & today” the right label for chores?
- [ ] Is it obvious which person owns each chore?
- [ ] Complete a chore with Enter.
- [ ] Confirm the progress/status changes immediately.
- [ ] Confirm focus remains on the same chore and exposes Undo.
- [ ] Undo the chore and confirm the original state returns.
- [ ] Decide whether completed chores should remain visible, move down or disappear.
- [ ] Decide whether the compact weekly pocket-money total should also appear on Today or stay on Chores only.
- [ ] Review Dinner, List summary and Notice for usefulness and prominence.
- [ ] Decide what the Notice panel should eventually contain and who can edit it.
- [ ] Identify any missing “at a glance” information needed each morning.
- [ ] Check whether the screen feels too empty or too busy.

## Week

- [ ] Can you understand the seven-day view without instructions?
- [ ] Is today sufficiently obvious?
- [ ] Are weekday/date headings readable from the couch?
- [ ] Are the visible hours appropriate for your household?
- [ ] Are event cards readable without becoming visually crowded?
- [ ] Can you distinguish Ezra, Maya and family events quickly?
- [ ] Are recurring events presented naturally?
- [ ] Check overlapping events and decide how you expect them to behave.
- [ ] Check long titles and owner names for clipping.
- [ ] Decide whether all-day events need a separate band.
- [ ] Decide whether meals, birthdays or school-day markers belong here.
- [ ] Decide whether Earlier week/Later week controls are understandable.
- [ ] Use Escape to return and confirm prior Today focus is sensible.
- [ ] Review Week on a narrow phone and confirm the agenda format is preferable to
      squeezed columns.

## Chores and routines

- [ ] Is the household progress indicator motivating or unnecessary?
- [ ] Is grouping by person the right default?
- [ ] Can every family member identify their column/list quickly?
- [ ] Are routine labels such as Morning and Before school helpful?
- [ ] Complete and undo chores assigned to both fictional members.
- [ ] Confirm completed, pending and skipped treatments are unambiguous.
- [ ] Decide whether completed chores should show the completion time/person.
- [ ] Decide whether locked/adult-only chores need a different visual treatment.
- [ ] Confirm chores stay focused on completion rather than showing points or monetary values per task.
- [ ] Decide whether chores need due times, reminders or a “do next” order.
- [ ] Decide whether recurring routines and one-off chores should look different.
- [ ] Check whether six chores fit comfortably without scrolling.
- [ ] Note how you want overdue or missed chores to work.
- [ ] Note whether children should be able to undo their own completion and for how long.

## Lists

- [ ] Is it obvious which list is active?
- [ ] Is adding an item fast and understandable?
- [ ] Add several short items and one deliberately long item.
- [ ] Check and uncheck an item using keyboard only.
- [ ] Confirm focus stays on the changed item.
- [ ] Decide whether checked items remain, collapse or disappear.
- [ ] Decide whether quantities and categories are necessary.
- [ ] Decide whether the television should permit adding items or only checking them.
- [ ] Decide which lists you actually need: groceries, hardware, packing, jobs or others.
- [ ] Decide whether list ownership/privacy is ever necessary.
- [ ] Check that empty and offline messages feel helpful.

## Meals

- [ ] Can you see tonight’s dinner immediately?
- [ ] Is a full week of meals useful or too much?
- [ ] Add or change a fictional dinner from the phone layout.
- [ ] Create a saved meal and reuse it.
- [ ] Decide whether breakfast and lunch are needed or dinner alone is enough.
- [ ] Decide whether notes, recipes, ingredients or preparation reminders belong here.
- [ ] Decide whether choosing a meal should offer to add grocery ingredients.
- [ ] Decide whether dietary tags or family preferences are necessary.
- [ ] Check long meal names and empty days.
- [ ] Decide who can edit meals from the television versus companion.

## Home

Home is intentionally a small curated surface over Home Assistant, not a second
Home Assistant dashboard.

- [ ] Is the living-room presence status understandable?
- [ ] Is TV power/status useful or redundant?
- [ ] Are Evening, Goodnight and Screen Off the correct first actions?
- [ ] Decide which fixed household scenes should replace or supplement them.
- [ ] Confirm Goodnight requires explicit confirmation.
- [ ] Cancel the confirmation with Escape and confirm focus returns correctly.
- [ ] Check the protected-playback message and confirm it makes sense.
- [ ] Decide whether family members should see device detail or only simple states.
- [ ] Identify any Home Assistant control that genuinely belongs on Hearth.
- [ ] Identify controls that should remain only in Home Assistant.
- [ ] Confirm nothing suggests Hearth owns voice capture or media playback.

## Admin and setup

Admin is intended primarily for a phone or computer, not routine television use.

- [ ] Open the Admin overview and confirm the categories make sense.
- [ ] Household: review name, timezone and setup wording.
- [ ] People: add a fictional member and check role/capability wording.
- [ ] People: try all 12 curated colours and confirm the palette feels harmonious and distinct
      enough for your household.
- [ ] People: decide what profile information and avatar controls are needed.
- [ ] People: confirm archiving is clearly different from deleting history.
- [ ] Routines: create and edit a recurring chore.
- [ ] Routines: check weekday selection, assignee and start date.
- [ ] Pocket money: set a required weekly amount and payday for each child.
- [ ] Pocket money: complete and undo a chore; confirm the weekly percentage and amount due change proportionally.
- [ ] Pocket money: record the week's payment; confirm the amount/count/percentage snapshot stays visible after reload.
- [ ] Televisions: review pairing, connected and revoked wording.
- [ ] Connections: confirm it lists only Calendar and Home Assistant.
- [ ] Confirm Jellyfin and music do not appear as Hearth-owned integrations.
- [ ] Decide whether settings are organised around household tasks rather than
      technical services.
- [ ] Identify any setup step that needs clearer explanation.
- [ ] Check every form for sensible validation and recovery after a mistake.
- [ ] Confirm child/guest concepts do not expose Admin controls.

## Phone companion

Use browser device emulation at 390×844 portrait and 844×390 landscape.

- [ ] Bottom navigation remains visible and does not cover content.
- [ ] Today is a clear single-column hierarchy.
- [ ] Week becomes a readable grouped agenda.
- [ ] Chores become one scrollable list.
- [ ] Lists and Meals are comfortable to edit with touch-sized controls.
- [ ] More leads naturally to Admin.
- [ ] Text inputs do not cause horizontal scrolling.
- [ ] Buttons are large enough and not crowded together.
- [ ] Modal/confirmation content fits when the on-screen keyboard would be open.
- [ ] Landscape phone layout remains useful rather than merely compressed.
- [ ] Decide which information/actions should exist only on the companion.
- [ ] Decide whether the companion should eventually be an installed PWA or stay
      as a private web app.

## Intentional loading, empty and failure states

These demo URLs change shared server state. Finish by reopening the Healthy URL.

- [ ] [Loading](http://127.0.0.1:4320/today?scenario=loading): calm and clearly temporary.
- [ ] [Empty](http://127.0.0.1:4320/today?scenario=empty): useful first action, not a dead end.
- [ ] [Stale calendar](http://127.0.0.1:4320/today?scenario=stale): explains age without alarming the family.
- [ ] [Calendar unavailable](http://127.0.0.1:4320/today?scenario=unavailable): cached plans remain useful.
- [ ] [Offline presentation](http://127.0.0.1:4320/today?scenario=offline): clear but not overwhelming.
- [ ] [Permission denied](http://127.0.0.1:4320/today?scenario=permission): tells the person what to do next.
- [ ] [Chore mutation failure](http://127.0.0.1:4320/today?scenario=fail-next): complete a chore, confirm rollback and Try again.
- [ ] [Empty list](http://127.0.0.1:4320/lists?scenario=empty).
- [ ] [Offline list](http://127.0.0.1:4320/lists?scenario=offline).
- [ ] [List mutation failure](http://127.0.0.1:4320/lists?scenario=fail-next).
- [ ] [List permission denial](http://127.0.0.1:4320/lists?scenario=permission).
- [ ] [Home Assistant unavailable](http://127.0.0.1:4320/home?scenario=unavailable).
- [ ] [Protected playback](http://127.0.0.1:4320/home?scenario=protected-media).
- [ ] [Home action failure](http://127.0.0.1:4320/home?scenario=fail-next).
- [ ] [Return to healthy demo](http://127.0.0.1:4320/today?scenario=healthy).

For a real browser-offline check, first load healthy Today, open browser
developer tools, set Network to Offline without refreshing, and confirm the
already-loaded plans remain visible. Restore Network before continuing.

## Dark mode and evening presentation — implemented

Open **More → Appearance** on phone, or move below Home to **Appearance** on the
television rail. These preferences are deliberately saved on this display only.

- [x] Provide Light, Dark and Automatic.
- [x] Make Automatic follow this device's operating-system/browser theme.
- [x] Remember television and phone choices separately.
- [x] Expose the control in More/Admin and as a quick TV rail action.
- [x] Use warm charcoal/ink rather than harsh pure black.
- [x] Keep event/member colours distinguishable in dark mode.
- [x] Keep the blue remote focus ring obvious on dark surfaces.
- [x] Retain contrast for completed chores, controls and status banners.
- [x] Keep normal photos untinted and let optional evening dimming reduce their glare.
- [x] Keep evening dimming separate from Dark and Home Assistant's Evening scene.
- [x] Apply evening dimming to ambient photo mode too.
- [x] Retain reduced-motion support and pass automated dark-mode accessibility checks.
- [x] Render dark mode at TV 4K/1080p/1366 and both phone orientations.
- [ ] Judge comfort, bloom and brightness on the selected TCL in the actual room.

## Photos and ambient mode — Phase 7 decisions

- [x] Use direct adult phone uploads as the normal family-photo path.
- [ ] Decide whether an optional Synology bulk-import folder is useful for this household.
- [x] If enabled, use only an explicitly approved read-only folder; never scan all household photos.
- [ ] Decide how recent photos, favourites and exclusions should work.
- [x] Contain portrait photos in the selected/ambient view rather than distorting them.
- [x] Show family-readable captions in the gallery; dates and locations remain undecided.
- [x] Exit the slideshow immediately on any remote/keyboard input.
- [ ] Decide quiet hours and how presence starts/stops ambient mode.
- [x] Replace a missing/corrupt photo with a plain `Photo unavailable` surface.
- [x] Confirm no Synology filesystem path appears in the browser contract or screen.

## Accessibility, comfort and polish

- [ ] Check text at normal, increased and reduced browser text size.
- [ ] Check browser zoom at 80%, 100% and 125% for catastrophic clipping.
- [ ] Check with reduced motion enabled in browser developer tools.
- [ ] Confirm meaning is never conveyed by colour alone.
- [ ] Confirm focus outline is never clipped by a panel or viewport edge.
- [ ] Confirm every icon has understandable accompanying text where needed.
- [ ] Check contrast in sunlight and in a dark room if practical.
- [ ] Check whether animations feel calm and fast rather than decorative.
- [ ] Listen for any screen-reader announcement that is repetitive or confusing,
      if you use VoiceOver.
- [ ] Check spelling, punctuation, capitalisation and Australian wording.
- [ ] Check that errors use family-readable language rather than technical terms.

## Reliability and recovery

- [ ] Refresh each main route directly and confirm it loads correctly.
- [ ] Open `/week`, `/chores`, `/lists`, `/meals`, `/home` and `/admin` in new tabs.
- [ ] Complete a chore in one tab and confirm another open Today tab updates.
- [ ] Confirm accidental double-click/Enter does not create duplicate changes.
- [ ] Confirm Try again does not duplicate an already completed command.
- [ ] Stop and restart `pnpm dev`; confirm the fictional Admin/planning state survives.
- [ ] Confirm no real household or provider data appears anywhere.
- [ ] Confirm browser history and refresh never expose a credential in the URL.

## Final review questions

- [ ] What are the five must-fix items before installing on the TCL?
- [ ] What are the five should-fix items after seeing it on the TCL?
- [ ] What should be removed?
- [ ] What should be renamed?
- [ ] What should be larger or smaller?
- [ ] What is missing from the family’s real morning routine?
- [ ] What is missing from the family’s real evening routine?
- [ ] Which additions belong in Hearth, and which belong in Home Assistant or a
      separate native TV app?
- [ ] Which ideas can wait until after the first household pilot?

## Optional demo reset

Admin and planning changes in demo mode persist locally. Only reset after you
have recorded everything you want to keep. Resetting also invalidates paired
demo televisions.

```sh
curl -X POST http://127.0.0.1:4310/api/v1/demo/reset
```
