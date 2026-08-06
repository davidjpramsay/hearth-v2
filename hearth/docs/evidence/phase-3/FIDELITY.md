# Phase 3 fidelity ledger

Accepted visual references:

- `docs/design/phase-1/concepts/week.png`
- `docs/design/phase-1/concepts/phone-today.png`
- `docs/design/phase-1/concepts/states.png`

The references and their latest 4K, 1080p, 1366, phone portrait, phone
landscape and provider-outage counterparts were inspected with `view_image` at
original detail.

| Area              | Concept-to-render finding                                                                                                 | Resolution                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Copy              | `This week`, `3–9 August`, the seven dates, event titles and Earlier/Later week controls now match the concept hierarchy. | No unapproved above-the-fold explanatory copy was added.                                                  |
| Composition       | The legacy equal-height card columns did not match the approved time-axis schedule.                                       | Rebuilt TV Week as an open 8 am–8 pm timeline with time-positioned events and a bottom week-control band. |
| Typography        | Source Sans 3 remains local and the hierarchy is legible at 4K/1080.                                                      | Added a compact 1366 type treatment so complete two-line event titles remain visible.                     |
| Palette           | Warm ivory/canvas, sky focus, eucalyptus family and ochre source cues remain within the accepted Hearth tokens.           | Calendar colours now consistently identify the owning source rather than imitating provider styling.      |
| Icons/assets      | Weather, morning, navigation and chevrons use the established local SVG family; events use fictional local avatars.       | Added a matching sunrise glyph and small source avatars; no external or provider assets are shipped.      |
| Spacing/container | The timeline uses open ruled columns instead of the prior oversized enclosing card.                                       | Preserved the 48 px logical safe area and concept-like bottom navigation band.                            |
| Focus             | Initial focus remains on the first actionable school event with outline, colour, geometry and elevation.                  | Remote Today → Week → Chores → Back flow passed after the layout change.                                  |
| Responsive        | Seven columns would be unreadable on a phone.                                                                             | As specified, phone Week is a grouped single/two-column agenda with stable opaque bottom navigation.      |
| Degraded state    | The outage concept requires current content to stay visible under quiet status copy.                                      | The rendered unavailable state shows the three cached Today events and `Showing saved plans`.             |
| Motion            | Timeline placement is static and focus motion is restrained.                                                              | Reduced-motion Playwright coverage still passes.                                                          |

The only intentional concept deviation is the TV rail footer: it shows the
useful `Demo home` local-state indicator instead of a settings gear, because
dense administration belongs to the authenticated phone companion. No fixable
visual mismatch remained in the implemented Phase 3 surfaces after the
timeline and 1366 title repairs.
