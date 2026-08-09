# Phase 4 household-planning evidence

> Historical reward screenshots in this folder were superseded by the proportional pocket-money implementation and D-027 on 2026-08-06. List, meal and current list-administration evidence remains active; current pocket-money evidence is in `docs/evidence/pocket-money/`.

This folder retains code-rendered Playwright Chromium evidence. The available
toolset had no Browser/IAB controller, so the installed project Chromium was
used as the documented fallback.

## Television and companion screenshots

- `screenshots/lists-tv-4k.png`, `lists-tv-1080.png`, `lists-tv-1366.png`
- `screenshots/lists-phone-portrait.png`, `lists-phone-landscape.png`
- `screenshots/meals-tv-4k.png`, `meals-tv-1080.png`, `meals-tv-1366.png`
- `screenshots/meals-phone-portrait.png`, `meals-phone-landscape.png`
- `screenshots/admin-planning-phone-portrait.png`
- `screenshots/admin-lists-phone-portrait.png`
- `screenshots/admin-meals-phone-portrait.png`
- `screenshots/admin-meals-dark-phone-portrait.png`
- `screenshots/admin-routines-phone-portrait.png`
- `screenshots/routines-one-off-phone.png`, showing the compact active schedule after one-off
  create/archive/restore
- `screenshots/chores-one-off-tv-1080.png`, showing the restored job in the normal television column
- `screenshots/routines-multi-assignee-phone.png`, showing the multi-person picker and grouped
  schedule summary
- `screenshots/chores-multi-assignee-tv-1080.png`, showing separate Ezra/Alex occurrences from one
  shared schedule
- `screenshots/admin-pocket-money-phone-portrait.png`

The 4K captures render a 1920×1080 logical television canvas at 2×. Phone
captures use 390×844 and 844×390. The 1366×768 captures verify the compact TV
breakpoint; overflowing list content remains reachable by deterministic focus
scrolling.

## Multi-assignee fidelity ledger

| Area         | Finding                                                                                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copy         | **People** and “Each selected person gets their own chore” state the consequence before an adult saves.                                                                     |
| Composition  | Phone editing remains one vertical form; avatar tiles form a compact responsive grid. Television keeps one person column per assignee rather than adding shared-job chrome. |
| Typography   | Existing Source Sans 3 hierarchy and companion field sizes remain unchanged. Names, roles and the schedule summary stay legible at 390 pixels.                              |
| Palette      | Selected people reuse the established eucalyptus confirmation surface; plum remains reserved for primary administration actions.                                            |
| Icons/assets | Existing household avatars and the local check icon are reused; no new external asset or concept screenshot ships in the interface.                                         |
| Spacing      | Tiles preserve 66-pixel targets and existing 8/12/16-pixel form rhythm. The summary avatar stack does not widen the schedule card beyond its container.                     |
| Focus        | Native checkboxes retain keyboard focus through the full-tile hit target; television occurrences enter the existing deterministic column/row focus graph.                   |
| Responsive   | The picker uses two useful phone columns where space permits and collapses naturally; the TV render retains three balanced person columns with no page scroll.              |

## Chore scheduling fidelity

- Active schedules remain a compact, person-led list; the dense creation form opens only after the
  explicit **New chore** action.
- The schedule control uses household language: **One day only**, **Every day**, **Weekdays** and
  **Selected days each week**. A one-off summary includes its readable due date.
- Archive requires a second named confirmation, preserves generated occurrence history and moves
  the schedule into a recoverable archived section. Restore begins again from the current local
  date through the same typed, audited contract.
- A restored one-off appears as an ordinary actionable job on the television and participates in
  the same proportional pocket-money denominator. No separate one-off completion path exists.
- The People picker uses substantial avatar/name tiles at 390×844. Selecting several people keeps
  one compact schedule row with a readable avatar stack and names; each person receives a separate
  television occurrence and completing Alex's copy leaves Ezra's copy pending.
- The three-column television render preserves the accepted person-led hierarchy, 72-pixel action
  targets, due-time metadata, pocket-money bands and deterministic per-column focus graph. The new
  feature changes assignment semantics without introducing a second visual language.
- The implementation was inspected at 390×844 and 1920×1080 using Playwright Chromium because no
  Browser/IAB controller was available.

## State evidence

- `screenshots/lists-state-empty.png`
- `screenshots/lists-state-offline.png`
- `screenshots/lists-state-failure.png`

The retained Phase 1 evidence continues to cover loading, stale,
integration-unavailable and permission presentations shared across modules.
