# Hearth v2 specification index

Status: **Phases 0–5 are implemented and locally verified. Phase 6 source,
pairing contracts, Android builds and emulator lifecycle evidence are implemented; selected-TCL
evidence is still required. Phase 3 includes the first read-only CalDAV/iCloud adapter. Phase 5
includes fake and private REST Home Assistant contracts plus an adult connection/mapping workflow;
the private deployment now also has integrity-checked online database backups, fail-safe restore
tooling, a calm adult System Health surface, and named-adult multi-passkey access with one-time
local recovery. No live credential, calendar write, restore or
household automation was used. The separate Music
Assistant/Jellyfin/Cast voice-music workstream is planned but not installed or verified.**

## Product statement

Hearth is an original family command centre for a wall-mounted Google TV. It brings together calendars, chores, routines, proportional pocket money, meals, lists, photos and household notices, and extends those features through Home Assistant and local voice. The native Jellyfin Google TV app independently handles normal movie, television and music browsing from the Synology server. A separate Home Assistant/Music Assistant path may search that Jellyfin music library and cast voice-requested audio to the television without making media part of Hearth.

The reference class is the family organiser represented by Skylight Calendar. Hearth should match the useful household outcomes, not copy the product's identity or interface.

## Authoritative documents

| File                    | Controls                                                              |
| ----------------------- | --------------------------------------------------------------------- |
| `PRODUCT_SPEC.md`       | Users, outcomes, scope and functional requirements                    |
| `UX_SPEC.md`            | Screens, navigation, television ergonomics and visual principles      |
| `ARCHITECTURE.md`       | Runtime topology, package boundaries, security and deployment shape   |
| `DATA_MODEL.md`         | Domain entities, ownership and persistence rules                      |
| `INTEGRATIONS.md`       | Calendar, Home Assistant, voice, photos and the native-media boundary |
| `ROADMAP.md`            | Ordered implementation phases and delivery boundaries                 |
| `ACCEPTANCE.md`         | Definition of done and system-level acceptance tests                  |
| `DECISIONS.md`          | Durable architectural and product decisions                           |
| `OPERATIONS.md`         | Verified local environment, proposed deployment and backup model      |
| `REFERENCE_SKYLIGHT.md` | Publicly documented reference features and the non-copying boundary   |

## Confirmed target environment

- Landscape 65-inch 4K Google TV, with TCL 65C7L as the current preferred
  target; 65C8K is the picture-upgrade alternative and 65C6K only a value
  fallback if suitable clearance stock appears
- Normal TV remote and microphone remote
- Home Assistant Voice Preview Edition and iPhone Companion apps
- Existing Raspberry Pi 5 running Home Assistant OS, headless and off the HDMI path
- Existing Synology DS920+ running Jellyfin and storing family media
- Optional Sonos Beam through HDMI eARC
- Existing PIR/IR hardware, preferably connected through an ESPHome node near the television

## Known decisions still requiring user input

These are intentionally deferred and should not block the first rendered prototype:

- Exact iCloud calendar read allowlist and any future calendars that may be modified
- Household member names, colours and permissions beyond the known example of Ezra
- Real child weekly pocket-money amounts and preferred payday; demo mode uses A$12 each Friday for Ezra
- Exact Home Assistant script/entity mappings plus the presence grace period, quiet hours and protected-playback signal source
- Exact Home Assistant Voice satellite-to-player mapping, the final `Hearth TV`
  Cast entity and a dedicated least-privilege Jellyfin account for Music
  Assistant; the read-only Synology music-share fallback is used only if the
  best-effort Jellyfin provider fails household reliability testing
- Initial photo source folder/album
- Final TV and audio purchase

Use typed provider interfaces and seeded demo data until these choices are supplied. Do not invent live credentials or mutate a real calendar to unblock development. D-012 selects iCloud through CalDAV as the first read provider, but the adapter fails closed until an exact external allowlist is approved.

## Immediate next step

Phase 7 is active: the path-safe Photos gallery, mixed-orientation demo source
and immediate-exit ambient mode now run in the web product, while the exact
approved Synology folder, live indexing, presence/quiet-hours coordination and
live operations commissioning remain open. Configure the implemented backup service only inside
the approved private Synology deployment, copy it off-device with encrypted Synology tooling and
perform the clean-location restore drill. Repeat the Phase 6 launcher, pairing,
D-pad/Back, app switching, standby/resume and outage-recovery checks on the
selected TCL television. In a separate live-system
workstream, and only after approval and backup, commission Music Assistant on
Home Assistant OS, connect Jellyfin as its music source, expose the television
through Google Cast and configure the explicit custom voice intents/player
mapping described in `INTEGRATIONS.md` and `OPERATIONS.md`. None of that media
orchestration belongs in Hearth. A one-time live CalDAV read also remains a
separately approved action and does not grant calendar write scope.
