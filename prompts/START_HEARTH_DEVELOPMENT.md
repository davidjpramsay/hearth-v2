# Fresh-chat Hearth continuation prompt

Copy everything below the divider into a fresh Codex chat opened in this
project. The filename is retained for compatibility; Hearth is no longer an
empty project and must not be scaffolded again.

---

Continue development of Hearth v2 from the existing implementation in this
workspace. Preserve all completed work and verify actual state before changing
anything.

Hearth is an original, television-first family command centre inspired by the
useful household outcomes of Skylight Calendar—shared calendars, chores and
routines, rewards, meals, lists and photos—but it must not copy Skylight
branding, assets, text or interface. Hearth's defining extensions are
television-scale D-pad operation, Home Assistant control and local voice,
presence-aware power and local ownership on the existing Synology/Pi
environment.

Before changing anything, read these local files completely in the exact order
required by `AGENTS.md`:

1. `AGENTS.md`
2. `hearth/AGENTS.md`
3. `docs/hearth-v2/README.md`
4. every authoritative document listed by that index

Then inspect the actual workspace, current evidence and available toolchain.
All Hearth application code belongs under `hearth/`. Do not recreate the
workspace, discard implemented phases or inspect/copy the old
`/Users/djpramsay@acc.edu.au/Documents/Code/Hearth` implementation unless a
specific verified gap requires comparison.

Current documented state:

- Phases 0–5 are implemented and locally verified using demo/fake-first
  boundaries.
- Phase 3 includes an inert read-only CalDAV/iCloud adapter; no live credential
  or calendar write is approved.
- Phase 5 includes the Hearth-side Home Assistant projection and typed Assist
  command API using a fake adapter; live Home Assistant entity mapping is not
  configured.
- Phase 6 source, Android builds and API 36 emulator evidence are implemented.
  Phase 6 remains incomplete until the selected TCL passes the retained
  physical-device checklist.
- Phase 7 photos, ambient mode and production operations remain next.

Use the relevant installed frontend skills when changing or visually testing
the React television interface. Do not invoke them merely for server-only,
documentation-only or Android-only work.

Immediate sequence:

1. Reconcile the live workspace with the documented Phase 6 evidence.
2. If the selected TCL is available and the owner authorises device pairing,
   run the physical launcher, pairing, D-pad/Back, switching, standby/resume,
   network-loss, recovery, revocation and native-app coexistence checks in
   `hearth/docs/reviews/TCL_INSTALL_GUIDE.md`.
3. Record exact passed, failed, blocked and not-run physical evidence. Do not
   call Phase 6 complete without the selected-TCL criteria.
4. Continue Phase 7 only after preserving the approved Synology photo-source
   boundary and deployment safety approvals. Implement one coherent vertical
   slice at a time, update authoritative documents with contract/decision
   changes and satisfy `docs/hearth-v2/ACCEPTANCE.md`.

Maintain this media and voice boundary:

- The native Jellyfin Google TV app remains the normal manual browser/player
  for the Synology media library.
- Separately from Hearth, the planned Home Assistant deployment may run Music
  Assistant, search Jellyfin music and send voice-requested audio to the TCL's
  Google Cast player named `Hearth TV`.
- Arbitrary music-starting by Home Assistant Assist currently requires Music
  Assistant's community voice-support blueprints/custom intents plus an
  explicit Voice-satellite/area-to-player mapping. Do not describe it as
  built-in or already installed.
- Music Assistant disables television/video Cast players by default, so the
  selected TCL must be explicitly enabled. Its Jellyfin source is maintained on
  a best-effort basis; test it properly and use the documented, separately
  approved read-only Synology music-share fallback only if needed.
- Hearth must not connect to, browse, launch or control Jellyfin, Music
  Assistant, Google Cast or Android media apps. It receives only a generic
  protected-media boolean for safe screen-off automation.
- Do not add Jellyfin UI keypress/ADB automation. Voice music should resolve the
  track through Music Assistant and stream it to the Cast receiver.
- Installing Music Assistant, changing Home Assistant, creating a Jellyfin
  account, pairing the TV or changing live Synology containers requires owner
  approval and a verified backup first.

Do not add a layout editor, general Home Assistant entity browser, unrestricted
LLM tools, public deployment or real household credentials. Keep the first
useful flows deterministic, typed, authenticated, idempotent where retries are
possible and audited where Hearth owns the command.

Work autonomously within the approved local-code scope. First report any
material contradiction or blocker found in the authoritative documents;
otherwise proceed. Keep the plan current and finish with exact commands and
results, rendered/device evidence, files changed, remaining approvals and the
next incomplete acceptance boundary.
