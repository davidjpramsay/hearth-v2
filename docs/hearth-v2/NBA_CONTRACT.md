# NBA module — first slice

NBA is an optional, initially **off** household module. An adult enables it in
More → Modules and chooses up to five standout teams in More → NBA teams.
Preferences survive disabling/re-enabling and server restarts. No team selected
means equal focus, not an empty league. Shared screens can read, never edit.

## Data and presentation

- `GET /api/v1/households/{householdId}/nba` returns this and next Monday–Sunday
  week in the household IANA timezone, season/phase, conference standings and
  current-week best **single-game** points, rebounds and assists (including ties).
  These are not weekly totals, averages or an all-player leaderboard.
  Schedules cover games between the 30 NBA clubs, not All-Star or overseas exhibition opponents.
- `GET/PUT /api/v1/households/{householdId}/nba/settings` reads/saves
  `{standoutTeamIds}`; PUT also requires an actor-scoped `requestId`. Exact retries
  replay; changed reuse conflicts. Saves are atomic and audited.
- View, team filter, conference and page are URL state. Pagination bounds the TV
  surface; the phone reflows cards, never shrinks a desktop table. Controls remain
  remote/keyboard reachable with a route back to the rail.
- Source, fetch time, household timezone and preseason/regular/playoff phase are
  explicit. Empty games are different from unavailable data. Retained data is
  labelled stale after a failed refresh. No per-second/live-score promise.

## Provider boundary

The server alone reads ESPN's public NBA standings and monthly scoreboard feeds
over fixed HTTPS URLs. Month requests (not unsupported date ranges) cover the
local fortnight, with UTC-edge padding. Requests are coalesced and cached for
15 minutes; only two fortnight keys are retained in memory, no historical sports
database. No timer/background fetch, and disabled modules gate before I/O.
Each response is timeout/decoded-byte bounded and parsed/projected into typed
DTOs. A truncated/malformed feed fails safely rather than claiming completeness.
No browser third-party requests, odds, advertising, streaming,
credentials or arbitrary provider URLs. Demo/test data is deterministic and
explicitly fictional. The public feed is undocumented and has no SLA; a supported
licensed provider and terms review are required before commercial distribution.

## Optional artwork (D-114)

- `GET /api/v1/households/{householdId}/nba/media/{kind}/{id}` is household-authenticated and
  module-gated before I/O. `teams` admits only the fixed 30 team IDs; `players` admits numeric
  IDs (one to ten digits) already present in that household's current fortnight highlights.
  Unknown IDs are not an open image proxy. Missing optional artwork returns 204.
- The public projection adds nullable `playerId`, defaulting to null for older responses and
  demo players. Invalid/missing provider identity disables only the portrait, never scores.
  No provider image URL, credential, binary or player history is persisted in the database.
- `EspnNbaMedia` uses only fixed HTTPS paths on `a.espncdn.com`, rejects redirects, accepts PNG
  content/signature and raster-decodes with Sharp. Four-second download timeout, one-MiB decoded
  response bound, one-million input-pixel bound and two-second image-processing timeout (excluding
  the libuv queue). Strip metadata; resize inside 96×96 team / 320×232 player pixels and emit WebP.
- Coalesce exact requests; at most 16 in-flight operations and 64 cached entries / eight MiB of
  retained image bytes. Success lasts six hours; missing/error lasts one minute. No timer,
  persistent asset store, browser CDN fetch, dependency addition or CSP relaxation. Responses
  are `private, no-store`, vary on Cookie/Authorization and use `nosniff`.
- Fixed artwork slots preserve the six-game/highlight and eight-standings-row TV surface, with
  phone reflow. Crests use an ivory backing so black marks work in dark mode. Portraits/crests
  are decorative beside full player/team labels; failed images reveal initials/abbreviations
  without changing geometry. Team colour is ornamental, not the only score/state/focus cue.
  Attribution is “Data & images: ESPN”. `NoNbaMedia` keeps the fictional demo network-free.
- Artwork outages never make otherwise available NBA scores unavailable. Provider/asset terms
  and commercial licensing remain a separate required review, not implied by this implementation.

## Availability and Home Assistant

Migration 0033 adds NBA without changing existing flags or access. Older payloads
and receipts default the missing NBA flag to off. The module disable lease also
covers NBA settings and waits for in-flight reads/commands. Data/preferences stay.
Existing Home Assistant grants retain their original eleven-module scope. A new
adult approval explicitly freezes the current module IDs; only such approval can
grant NBA's module switch. This slice does not grant HA sports-data access or add
NBA screen-navigation commands. Existing TV/HA behaviour remains unchanged.

## Acceptance

Test timezone boundaries/DST, complete next week, standings phase, leaders/ties,
malformed/truncated/oversized/timeout feeds, coalescing/cache/stale recovery,
settings validation/replay/conflict/restart/isolation, module-off no I/O, and old
HA grants. Render TV and narrow phone; exercise pagination, filters, empty/error
states, D-pad escape and accessibility. Browser/public-feed checks are not
physical TV or production deployment evidence.
Also test malformed/oversized/redirected artwork, identity validation, cache/concurrency bounds,
module/auth rejection before media I/O, loaded and missing assets, six tied highlights and
dark/light rendered TV/phone fit. Real public-data artwork smoke must not use fictional identities.
