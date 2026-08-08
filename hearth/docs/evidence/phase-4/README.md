# Phase 4 household-planning evidence

> Historical record: the star/reward screenshots and checks in this folder were superseded by the proportional pocket-money implementation and D-027 on 2026-08-06. They remain only as evidence of the earlier build. Current evidence is in `docs/evidence/pocket-money/`.

This folder retains code-rendered Playwright Chromium evidence. The available
toolset had no Browser/IAB controller, so the installed project Chromium was
used as the documented fallback.

## Television and companion screenshots

- `screenshots/lists-tv-4k.png`, `lists-tv-1080.png`, `lists-tv-1366.png`
- `screenshots/lists-phone-portrait.png`, `lists-phone-landscape.png`
- `screenshots/meals-tv-4k.png`, `meals-tv-1080.png`, `meals-tv-1366.png`
- `screenshots/meals-phone-portrait.png`, `meals-phone-landscape.png`
- `screenshots/admin-planning-phone-portrait.png`
- `screenshots/admin-routines-phone-portrait.png`
- `screenshots/admin-rewards-phone-portrait.png`

The 4K captures render a 1920×1080 logical television canvas at 2×. Phone
captures use 390×844 and 844×390. The 1366×768 captures verify the compact TV
breakpoint; overflowing list content remains reachable by deterministic focus
scrolling.

## State evidence

- `screenshots/lists-state-empty.png`
- `screenshots/lists-state-offline.png`
- `screenshots/lists-state-failure.png`

The retained Phase 1 evidence continues to cover loading, stale,
integration-unavailable and permission presentations shared across modules.
