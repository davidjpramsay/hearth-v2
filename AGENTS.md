# Hearth workspace agent instructions

## Mission

Build Hearth v2 as an original, reliable family command centre for a wall-mounted Google TV. It should deliver the useful family outcomes associated with Skylight Calendar—shared schedules, chores, routines, rewards, meal planning, lists and photos—then extend them through Home Assistant and local voice. Manual media browsing remains in the independent native Google TV apps. Separately from Hearth, Home Assistant may use Music Assistant to resolve voice-requested music from Jellyfin and cast it to approved household players.

The product must feel calm, obvious and dependable to every family member. It is a household appliance, not a developer dashboard.

## Workspace boundary

The Hearth v2 application belongs under `hearth/`. Root-level `docs/` and `prompts/` provide product context and handoff material; do not create a competing application at the workspace root.

The old Hearth implementation at `/Users/djpramsay@acc.edu.au/Documents/Code/Hearth` is reference material only. Do not copy it wholesale. Bring across a specific idea only after verifying that it still fits the v2 specifications.

## Required reading order

Before starting implementation, read these files completely:

1. `AGENTS.md`
2. `hearth/AGENTS.md`
3. `docs/hearth-v2/README.md`
4. `docs/hearth-v2/PRODUCT_SPEC.md`
5. `docs/hearth-v2/UX_SPEC.md`
6. `docs/hearth-v2/ARCHITECTURE.md`
7. `docs/hearth-v2/DATA_MODEL.md`
8. `docs/hearth-v2/INTEGRATIONS.md`
9. `docs/hearth-v2/ROADMAP.md`
10. `docs/hearth-v2/ACCEPTANCE.md`
11. `docs/hearth-v2/DECISIONS.md`
12. `docs/hearth-v2/OPERATIONS.md`

If two documents disagree, do not silently choose one. Report the contradiction and update the lower-level document to match the product spec and recorded decisions.

## Product invariants

- The primary display is a landscape 4K Google TV controlled by D-pad remote, voice and iPhone. Touch must never be required.
- Hearth is a product of its own. Do not reproduce Skylight names, branding, copy, artwork, screenshots or pixel-level layout.
- Layouts are code. Do not build a visual layout editor, layout DSL or user-configurable grid in the first release.
- Hearth owns household members, chores, routines, rewards, lists, meals, announcements and its own audit trail.
- The connected calendar provider remains the calendar source of truth. Hearth syncs through an adapter and does not invent a second authoritative calendar.
- Home Assistant owns physical devices, presence, scenes, television control and voice pipelines.
- The Synology Jellyfin server remains the media-library authority. The native Google TV Jellyfin client owns normal browsing and manual playback. Outside Hearth, Home Assistant may use Music Assistant to search the Jellyfin music library and cast voice-requested audio to a named television or speaker. Hearth does not connect to, control or launch Jellyfin, Music Assistant or Cast; it may receive only the generic media-active state needed to prevent unsafe television power automation.
- The television uses its native Google TV apps. The Raspberry Pi is a headless Home Assistant appliance and is not in the HDMI path.
- The first useful release must work without an LLM. Language models may later interpret requests, but can call only allowlisted actions and must never receive direct database or unrestricted Home Assistant access.
- LAN/Tailscale-first. Do not expose the application publicly without a separate security review and explicit user approval.

## Implementation expectations

- Start with one thin vertical slice that is genuinely usable on a television: household setup, a combined Today view, a Week view and chore completion.
- Use realistic seeded demo data, clearly isolated from production data, so the rendered product can be assessed before external credentials exist.
- Design the API contract and database migrations before spreading feature state through the UI.
- Keep server-only secrets out of browser bundles, Android resources, logs and source control.
- Treat all externally triggered writes as authenticated commands with validation, idempotency where relevant and an audit record.
- Prefer small, typed modules over broad abstractions. Do not generalise for hypothetical households until a real second use case requires it.
- Preserve existing user changes. This workspace may not be a Git repository, so verify changes by direct readback and tests rather than assuming Git is available.

## Verification requirements

Every implementation handoff must report the exact checks run and distinguish passed, failed, blocked and not run.

For web/server work, the eventual minimum gates are:

- type checking
- linting
- unit tests
- API/integration tests for changed behaviour
- production builds
- `git diff --check` when Git becomes available
- rendered inspection at television and mobile viewport sizes
- keyboard/D-pad-only navigation through changed screens

For Android TV work, also verify:

- Gradle build and unit tests
- launcher presence and TV manifest requirements
- Back/D-pad behaviour
- suspend/resume and network-loss recovery on an emulator or real device

Do not call a phase complete merely because source files exist. Completion requires its acceptance criteria in `docs/hearth-v2/ACCEPTANCE.md`.

## Approval and safety boundaries

- Read-only inspection of the local machine, Synology and Home Assistant is allowed when relevant.
- Ask before wiping or reimaging the current Raspberry Pi, installing or changing live Home Assistant apps/integrations/automations, changing live Synology containers, altering live calendars, pairing household devices, deploying publicly or sending notifications to real people.
- Never store passwords, tokens, certificates or private calendar URLs in this workspace.
- Use `.env.example` with placeholder names and document the required secret source.
- Do not use a smart plug to routinely hard-cut television power.

## Documentation discipline

Update the authoritative document in the same change whenever implementation changes a contract, decision, deployment requirement or acceptance criterion. Add substantive architecture changes to `docs/hearth-v2/DECISIONS.md`; do not leave important decisions only in chat.
