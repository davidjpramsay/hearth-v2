# Today detail and overflow evidence

The Today polish was rendered with Playwright Chromium because the Build Web Apps Browser/IAB
controller is not exposed in this workspace. The retained evidence covers 1920×1080 television and
390×844 phone presentation, including event details, honest event/chore overflow and the actionable
summary region.

## Fidelity ledger

| Area         | Finding                                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copy         | Existing `Today`, `Upcoming` and `Due now & today` language is retained. Compact `+N more` actions state exact hidden counts and use family destinations rather than technical paging copy. |
| Composition  | The accepted two-column TV hierarchy remains intact. Full-height landscape layouts use four calm rows, compact landscape uses three, and phone keeps a single readable stack.               |
| Typography   | Local Source Sans 3, the existing header scale and sofa-readable row labels remain unchanged. Overflow actions are prominent without competing with section headings.                       |
| Palette      | Warm ivory, eucalyptus and sky focus colours remain consistent with the accepted Hearth tokens.                                                                                             |
| Icons/assets | Existing direct local SVG icons and original fictional household assets are reused; no concept screenshot is shipped as interface.                                                          |
| Focus        | Overflow, event details, summary bands, notice details and photo preview all combine outline, halo, elevation and colour. Back restores the exact origin.                                   |
| Responsive   | TV exposes three to five rows according to photo orientation and screen height without scrolling; phone stays at three and keeps summary/photo content full width below the core rows.      |
| Behaviour    | Events and notices expose details; overflow opens Agenda/Chores; Dinner, List and Photo open their real modules. No returned plans or chores disappear silently.                            |

No fixable copy, composition, typography, palette, focus or responsive mismatch remained in the
final inspected renders. The intentional difference from the original Phase 1 concept is the compact
overflow and chevron affordance required by real household data and useful destinations.

## Retained renders

- `today-overflow-tv-1080.png`
- `today-event-detail-tv-1080.png`
- `today-overflow-phone-portrait.png`
- `today-destinations-phone-portrait.png`

## Verification

`tests/e2e/today-polish.spec.ts` exercises the complete D-pad/keyboard flow, exact focus restoration,
responsive captures, serious/critical axe checks and console warning/error cleanliness. On
2026-08-10, `pnpm verify` passed formatting, lint, strict type checking, 120 unit tests, 86 server
integration tests, 18 migration tests, web/server production builds and 198 Playwright Chromium
tests.
