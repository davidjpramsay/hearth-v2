# Phase 1 rendered evidence and fidelity ledger

Captured with Playwright Chromium because this environment exposed no Browser
or in-app-browser controller. The Chromium fallback exercises the same browser
keyboard events used by a controlled TV WebView.

## Retained viewports and states

- Today: 3840×2160, 1920×1080, 1366×768, 390×844 and 844×390
- Week and Chores: 1920×1080
- states: loading, empty, stale calendar, unavailable integration, offline
  cached content, permission and mutation failure

Files are in `screenshots/`. Each concept and its latest rendered counterpart
was inspected with `view_image` after capture.

## Fidelity ledger

| Area              | Comparison and disposition                                                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copy              | Today event/chore/meal/list/notice copy matches the approved concepts. The implementation says `6 items left` to make list state explicit. `1 of 6 complete` is intentionally data-accurate; the Chores concept's `3 of 6` conflicts with the two visibly completed rows. |
| Composition       | The warm persistent rail, paired Today columns, summary strip, seven-day Week surface and person-grouped Chores hierarchy are retained. The concept-only Music/Movies/Evening strip is omitted because complete Media/Home modules are explicitly out of Phase 1.         |
| Typography        | Source Sans 3 is bundled locally. TV body/action text is at least 28 logical pixels at the 1920 canvas; the 4K capture uses browser layout zoom to preserve that canvas at two times size without transforming a completed application bitmap.                            |
| Palette           | Warm off-white, charcoal, eucalyptus, sky and ochre tokens match the approved source. Brick is isolated to the affected failed command. No gradients or screenshot-backed UI are used.                                                                                    |
| Icons/assets      | Rounded local SVG icons, the generated transparent Hearth sprig and fictional Ezra/Maya portraits replace concept placeholders. No Skylight or external household asset is present.                                                                                       |
| Spacing/container | 48-pixel 1080p safe inset, open two-column fields, restrained hairlines/shadows and 72-pixel minimum actions are retained. Week uses readable day columns instead of literal time-positioning so long titles remain legible at 1366px.                                    |
| Focus             | Initial focus lands on Pack school bag. Focus combines blue outline, green halo, elevation and geometry; it survives complete/undo/failure and route Back. Reduced motion removes transforms.                                                                             |
| Responsive        | At 900px and below the rail becomes stable bottom navigation. Today and Chores are single-column in portrait, Week becomes an agenda, and 844×390 uses a compact two-column continuation with scrolling.                                                                  |

## Inspection findings resolved

1. Replaced the first chroma-keyed Hearth mark after its edge inspection found a
   magenta fringe.
2. Corrected Today to show exactly the three approved upcoming events; dinner
   remains a separate summary.
3. Corrected Week day headers to display date numbers rather than a repeated
   `Aug` label.
4. Removed opacity from reserved rail items after automated contrast inspection
   found it below WCAG AA.
5. Kept pending mutation focus on the same enabled control; `aria-disabled`
   communicates the transient state without forcing browser focus away.
6. Simplified the permission row to the single family action `Ask an adult`.

No remaining mismatch is both fixable and in scope without reintroducing a
deferred module or making displayed data inaccurate.
