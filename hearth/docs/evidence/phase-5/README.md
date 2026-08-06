# Phase 5 rendered evidence and fidelity ledger

## Evidence

Playwright Chromium was used because no Browser/IAB controller is available in
the current toolset. Screenshots are retained in `screenshots/` at:

- 3840×2160, 1920×1080 and 1366×768 television viewports
- 390×844 and 844×390 iPhone-equivalent viewports
- Home Assistant unavailable, protected native playback, command failure and
  Goodnight confirmation states

## Fidelity ledger

| Area                 | Accepted concept                                                                                   | Latest implementation                                                                                                                                                                   | Result                                     |
| -------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Copy                 | Home, Living room, the three status labels, Room actions and the three action labels/descriptions  | The healthy state matches that visible copy exactly. Runtime-only copy appears for loading, unavailable, protected playback, confirmation and failures.                                 | Match                                      |
| Composition          | TV uses a persistent rail with a left status block and right action stack                          | The 1080p/4K implementation uses the same two-column relationship and keeps all content inside the 48-pixel logical safe area.                                                          | Match                                      |
| Typography           | Heavy compact headings, calm readable body copy                                                    | Locally bundled Source Sans 3 uses 58-pixel TV H1, 30-pixel action labels and at least 22-pixel supporting copy; phone sizes are intentionally compact.                                 | Match                                      |
| Palette              | Warm ivory, charcoal, eucalyptus, sky focus, ochre actions                                         | Existing original Hearth tokens are reused; Goodnight and Screen Off receive restrained plum/brick semantic accents.                                                                    | Match with deliberate semantic extension   |
| Icons/assets         | Simple outline house/presence, TV, shield, sun, moon and power marks                               | Faithful local SVG paths and the standalone Hearth mark are used. No generated UI bitmap is shipped.                                                                                    | Match                                      |
| Focus                | Evening has unmistakable blue D-pad focus with geometry/elevation change                           | Blue outline, green outer geometry and raised shadow are visible; reduced-motion removes the transform.                                                                                 | Match                                      |
| Responsive behaviour | Portrait retains the three statuses, action hierarchy and Today/Week/Chores/More tabs              | Portrait retains the three-column status block and vertical actions. Landscape recomposes status and actions into two compact columns so all core controls remain above the fixed tabs. | Match; landscape adaptation is intentional |
| Container model      | Status is one calm grouped surface; actions are three large rows rather than a dashboard card grid | The implementation preserves one status container and three 72-pixel-plus actionable rows with no entity browser or widget grid.                                                        | Match                                      |
| Integration boundary | Home Assistant status only; no Jellyfin, Music Assistant or listening UI                           | Only the generic protected-playback guard appears. Home Assistant Assist is explained on Lists without an on-screen microphone/listening action.                                        | Match                                      |

## Copy difference inventory

- Healthy Home copy: no differences.
- Interaction-only additions: `Running…`, `Unavailable`, family-readable failure
  messages, and the explicit `Confirm Goodnight` dialog.
- Degraded-state additions are required product states rather than concept
  substitutions.

## Visual inspection result

Both accepted concepts and their latest 1920×1080 and 390×844 counterparts
were inspected at native size. The 844×390 landscape and protected-playback
renders were also inspected after the final responsive iteration. No remaining
fixable mismatch was found in copy, hierarchy, palette, focus or the
native-media boundary.
