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
- `screenshots/admin-pocket-money-phone-portrait.png`

The 4K captures render a 1920×1080 logical television canvas at 2×. Phone
captures use 390×844 and 844×390. The 1366×768 captures verify the compact TV
breakpoint; overflowing list content remains reachable by deterministic focus
scrolling.

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
- The implementation was inspected at 390×844 and 1920×1080 using Playwright Chromium because no
  Browser/IAB controller was available.

## State evidence

- `screenshots/lists-state-empty.png`
- `screenshots/lists-state-offline.png`
- `screenshots/lists-state-failure.png`

The retained Phase 1 evidence continues to cover loading, stale,
integration-unavailable and permission presentations shared across modules.
