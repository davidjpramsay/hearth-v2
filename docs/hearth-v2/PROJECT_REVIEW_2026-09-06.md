# Hearth project review — 6 September 2026

Scope: local organization, contracts, dependencies, deployment configuration and functional/UI
regressions. Existing calendar changes were preserved. No push or live deployment was performed.
This is a project review, not an exhaustive security audit or physical-device certification.

## Fixed

- An installed update no longer blocks the next release or leaves a permanent 100% progress bar.
- Cancelling a passkey or rejecting an update leaves retry usable. A lost command response
  reconnects; retrying that release retains its request ID.
- Empty weeks retain navigation. Phones can now change weeks, and multi-day cards have unique
  per-date focus targets. The last TV event can move down to week controls.
- System Health reports the actual database fault instead of an unrelated backup message.
- Fixed the shared phone-admin dock's four-column/five-button mismatch, which clipped More below
  the screen. All five destinations stay on one row.
- Extracted the update card from System Health, shortened verification instructions, corrected
  obsolete external-reminder wording, and made tracked screenshot refreshes opt-in.
- Patched Fastify to 5.12.1 and both fast-uri branches to 3.1.6/4.1.3. The initial production audit
  reported 10 entries; the patched dependency tree reports none. CI now checks that audit.
- The broader audit also identified a build-tool-only nanoid advisory; its pinned patch is included.
- Replaced removed numeric proxy trust with explicit IP/CIDR configuration. See [D-083](DECISIONS.md#d-083--reverse-proxy-trust-requires-explicit-addresses).

The dependency changes follow the maintainers' [Fastify advisory](https://github.com/fastify/fastify/security/advisories/GHSA-3m5p-2c4r-xxw2)
and [fast-uri advisory](https://github.com/fastify/fast-uri/security/advisories/GHSA-5jgf-p345-68v8).
An affected dependency is not proof of an exploitable Hearth route.

## Organization

The existing app/server/TV/shared/core boundaries are appropriate. Retired Apple code remains
isolated from active builds. No wholesale folder moves are justified. Local link targets in all 57
Markdown files checked, including this report, resolved successfully.

Priority follow-ups:

1. **Calendar edge cases:** the Week timeline still assumes 8 am–8 pm. Source inspection shows
   early starts clamp to the same position, late events can extend past the timeline, and very
   dense simultaneous lanes become narrow. Define a readable off-hours/overflow presentation and
   add rendered early, late, overnight and crowded-day cases. Do not treat ordinary-week tests as
   acceptance of arbitrary calendar density.
2. **Large server modules:** split route registration in `app.ts` (~2,900 lines) and planning
   persistence in `planning-repository.ts` (~3,200 lines) by domain as those features change.
   Preserve shared transactions, authorization and idempotency. Avoid a cosmetic mass rewrite.
3. **Visual regression gates:** current captures are evidence, not pixel-diff assertions. Add a
   small set of deterministic layout baselines alongside geometry/interaction tests; retain
   deliberate review of font/raster differences.

## Verification

- Passed: complete `pnpm verify`, including 443 browser tests and the 384 Today layout combinations.
- Passed after final refinements: formatting, lint, type checks, 188 unit tests, 113 integration
  tests, 24 migration tests, deployment-script/Compose validation, and web/server production builds.
- Passed after final refinements: 76 admin, updater and Calendar browser tests, plus a final
  phone-dock rerun. TV/phone rendered views, keyboard focus and accessibility were checked.
- Passed: Android `pnpm verify:tv` (tests, debug/release lint and builds; most Gradle tasks cached).
- Passed: frozen-lockfile install and `pnpm audit:dependencies` — no known production or build
  dependency vulnerabilities in the final audit.
- Passed: `git diff --check`; routine browser verification left tracked screenshots unchanged.
- Failed checks remaining: none. Container builds are blocked as noted below, not verified.

The frontend debugging skill guided viewport, focus and accessibility checks. Browser tooling
was unavailable, so verification used the repository's Playwright workflow. This does not replace
an actual Safari, television or live appliance check.

## Live gates — not run

- Real Google TV launcher/remote/Back, standby/resume, network-loss recovery and panel readability.
- Physical iPad/iPhone Safari and passkey-prompt behaviour.
- Synology image activation, live update/rollback, private proxy-chain validation and restore drill.
- Live calendar/Home Assistant outages and recovery.
- Local container image builds: Docker daemon unavailable; Compose and script validation still run.

Existing Synology installs remain usable with blank trusted-proxy configuration, but clients behind
one proxy share the sign-in rate limit. Configure only verified proxy addresses if distinct client
throttling is needed. No permissions were broadened and no production data was touched.
