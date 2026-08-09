# Hearth v2 local environment and operations plan

## Verified environment snapshot

Checked read-only on 2026-08-03:

### Synology

- Model: DS920+
- DSM: 7.3.2
- CPU: Intel Celeron J4125, x86-64
- Memory: approximately 4 GB
- Storage: approximately 3 TB free at the time checked
- Container Manager installed
- Jellyfin 10.11.11 installed and running
- Existing media directories include music, movies and television content
- Existing `/volume1/docker/hearth` path exists and may belong to the old implementation

### Local workspace

- The repository root contains the Hearth v2 specifications, agent instructions and development prompt.
- No Git metadata was present when the handoff was prepared.
- The owner intentionally removed the former bargain-finder system; no Python regression suite is applicable.
- A root `AGENTS.md` and the `hearth/` pnpm application workspace are present.
- Phases 1–4 run entirely with fictional demo data and make no live Synology or household writes.
- Runtime mode is explicit: `demo` uses deterministic fictional data, `test`
  is reserved for deterministic automated harnesses, and `private` uses the
  real clock and does not seed a household. A new private database therefore
  opens on the setup-required surface rather than displaying demo family data.
- Demo calendar data remains fictional. Phase 3 now includes an inert read-only CalDAV/iCloud adapter, but no provider credential, approved live allowlist or event write exists in the workspace.
- Android command-line tools, platform 36, build-tools 36 and the Gradle 9.5
  wrapper are installed locally. Phase 6 produces verified debug and unsigned
  minified-release APKs. API 36 Google TV emulator lifecycle/navigation evidence
  is retained; the selected-TCL run remains outstanding.

### Other reusable hardware

- Raspberry Pi 5 from the current Hearth setup
- Existing PIR/IR components
- iPhones

Before changing any live component, refresh these facts. Versions, storage and service status are drift-prone.

## Target deployment roles

### Synology DS920+

- Continue existing Jellyfin/media service.
- Run Hearth v2 server/web containers.
- Store Hearth database on a local Docker volume/path.
- Hold backups from Hearth and Home Assistant.
- Do not run a general local LLM.

### Raspberry Pi 5

- Run Home Assistant OS on Ethernet.
- Run ESPHome and local voice apps.
- Run the Music Assistant Home Assistant OS app when live installation is
  approved; connect its official Home Assistant integration.
- Remain headless and outside the TV HDMI chain.
- Use NVMe if already available; otherwise begin with a quality A2 card and verified backups.

### Google TV

- Run the Hearth Android TV app and the independent native Jellyfin client; each connects directly to its own server.
- Expose its built-in Google Cast receiver to Music Assistant for
  voice-requested music; Cast playback is separate from the native Jellyfin UI.
- Use Home Assistant's Android TV Remote integration for power, volume and
  approved app launches rather than giving Hearth an Android intent bridge.
- Use network standby/Screenless Service where supported.
- Use HDMI eARC for optional soundbar.

## Pre-install preservation

Do not reimage the Pi until:

- its boot/data media is identified
- a full image or equivalent recoverable backup is created
- current Hearth configuration, scripts and GPIO mappings are exported or documented
- the backup is readable from another machine
- a rollback path is written down

The old Hearth source at `/Users/djpramsay@acc.edu.au/Documents/Code/Hearth` remains read-only reference unless the user asks for migration work.

## Proposed network/service names

Use reserved DHCP addresses and stable local DNS names where available. Suggested logical names:

- `hearth.local` or an internal equivalent for Hearth
- `homeassistant.local` for Home Assistant
- existing stable Synology/Jellyfin name

Do not hard-code LAN IPs in application bundles. Production configuration enters the TV through pairing or a controlled environment/build setting.

Companion passkeys require a stable private hostname with HTTPS before real household data is entered.
Set `HEARTH_AUTH_RP_ID` to that exact hostname, `HEARTH_AUTH_ORIGIN` to its exact HTTPS origin and
`HEARTH_FIRST_USE_CODE_PATH` to an external access-restricted secret file. All three values are
required together. The exact Synology/Tailscale hostname and certificate mechanism are deployment
inputs, not values to hard-code in application bundles.

Before the first start, generate a high-entropy code into the configured first-use file with mode
`0600` or stricter and read it only on the local trusted administration path. Do not put it in an
environment variable, Compose, source, chat, logs, SQLite or a URL. Hearth rate limits invalid
attempts and consumes the file after the first adult passkey and household are committed. Keep the
origin stable after enrolment; changing the WebAuthn relying-party hostname requires new credentials.

The CalDAV adapter also fails closed without private configuration. In
non-demo mode, `HEARTH_CALENDAR_CONFIG_PATH` must point to a JSON secret mounted
outside the repository with mode similar to other container secrets. Required
fields are `version: 1`, `provider: "caldav"`, an HTTPS `serverUrl`, `username`,
`appPassword`, `householdTimezone`, and a non-empty `calendars` array of exact
`displayName` plus nullable `ownerMemberId`. Do not put those values in a Vite
variable, Compose file, image layer, source document or command line. Demo mode
rejects the path so visual/test runs cannot contact a live provider by accident.

The companion Calendar setup page is now the supported way to prepare that
same file. In demo mode it always uses fictional discovery and stores no
credential. In private mode, `HEARTH_CALENDAR_CONFIG_PATH` must already resolve
to an access-restricted secrets location writable by the Hearth server. After a
successful test and exact selection, Hearth writes the JSON atomically with
mode `0600` and activates it without restart. The page shows only the hostname
and a masked account hint after save. If the path is missing or unwritable, save
fails safely and the entered secret is not copied into SQLite or logs.

Before the first live read, the owner must create a dedicated revocable iCloud
app-specific password, approve the exact calendar names and place the secret
file through the deployment secret mechanism. Start Hearth in private mode,
confirm all returned sources are read-only, then revoke the password after the
validation if the deployment is not proceeding. No calendar write method is
present.

Set `HEARTH_MODE=private` only with a dedicated private database path. If
`HEARTH_DATABASE_PATH` is omitted, Hearth chooses `data/hearth-private.sqlite`
for private mode and `data/hearth-demo.sqlite` for demo/test. Do not point
private mode at a copied demo database. The adult first-use command is implemented but remains inert
without the approved private HTTPS origin and external one-time code. Do not enrol a real passkey or
enter household data until that origin/certificate is commissioned.

## Proposed Synology paths

Keep v2 separate from the old deployment:

```text
/volume1/docker/hearth-v2/
  compose.yaml
  env/                 secrets/production env, access-restricted and not in source
  data/                SQLite and application state
  backups/             consistent Hearth backups
  logs/                bounded/rotated logs if not using Container Manager logging
```

Deployment files belong in `hearth/deploy/synology`; live secrets never return to the workspace.

## Implemented container scaffold

As of 2026-08-09, `hearth/deploy/synology` contains the local production scaffold: a multi-stage
Dockerfile, two-service Compose definition, rootless nginx same-origin proxy, health checks, pinned
Node 24.18.0 and nginx 1.30.4 bases, read-only roots, dropped capabilities, bounded logs and an
ignored runtime directory template. The server production build includes all 12 forward migrations
and compiles `better-sqlite3` within the target Linux image.

Both native ARM64 development images and emulated `linux/amd64` images for the DS920+ were built and
started together in private mode. In both runs the server and web containers became healthy, the
proxied readiness endpoint returned `ready`, the runtime returned `household: null` and
`requiresSetup: true`, and no demo household was seeded. The ARM64 run also verified non-root users,
read-only roots, all Linux capabilities dropped, `no-new-privileges`, and clean Fastify shutdown on
`SIGTERM`. This is retained local evidence, not a claim that the live Synology has been changed.

Validation commands from `hearth/`:

```sh
docker compose --env-file deploy/synology/.env.example \
  -f deploy/synology/compose.yaml config --quiet
docker build --platform linux/amd64 --target server \
  -t hearth-v2-server:local-amd64 -f deploy/synology/Dockerfile .
docker build --platform linux/amd64 --target web \
  -t hearth-v2-web:local-amd64 -f deploy/synology/Dockerfile .
```

Live commissioning remains blocked on an owner-approved private hostname/certificate, dedicated
Synology service UID/GID and folders, real-device passkey enrolment plus second-adult recovery,
backup/restore tooling and a focused security review. Do not enter real household or provider data
before those controls are complete.

## Backup design

### Hearth

- Daily consistent SQLite backup using the SQLite backup mechanism, not a casual copy of an active WAL database.
- Retain a practical rolling set, for example 7 daily and 4 weekly copies, subject to final household policy.
- Back up deployment configuration excluding renewable/cache content.
- Perform a restore into an isolated test location before production acceptance.

Phase 2 development evidence closes the database, copies it, opens the copy in an isolated location and verifies both Admin and completed chore state. Production still requires the SQLite online-backup mechanism above because copying a live WAL file is not an acceptable operational backup.

The same database now contains the calendar projection cursor, bounded sync
window, source mappings, normalized events and tombstones. A restore drill for
a real deployment must verify that cached events remain available while the
provider is deliberately unreachable.

### Home Assistant

- Automated encrypted Home Assistant backups copied to a restricted Synology destination.
- Retain at least one known-good pre-upgrade backup.
- Test restoring onto spare/test media before calling operations complete.
- Include Music Assistant app/integration configuration and the custom voice
  intent/player mapping in the post-commission backup; keep Jellyfin credentials
  in Home Assistant's supported secret/configuration mechanism, not this repo.

### Photos/media

- Hearth photo derivatives are disposable; original approved photos remain governed by the Synology's existing backup strategy.
- Mount only the explicitly approved family-photo folder into the server at `/photos-source` with
  read-only permissions. Leave `HEARTH_PHOTO_SOURCE_DIR` blank until approval; never mount the
  Synology photo-library root. Derivatives live under `/data/photo-derivatives` and may be rebuilt
  with the adult Admin scan command.
- Photo index responses, audit summaries and logs must remain free of host/container source paths.
  A temporary NAS outage should preserve and serve the last safe derivative set as stale content.
- Member profile-photo derivatives are identity settings stored inside Hearth SQLite and are covered
  by the normal database backup/restore drill. The chosen original file is not retained by Hearth.
- Do not imply that Hearth backups protect the entire media library.

## Update and rollback

- Build immutable versioned container images.
- Record deployed image/version and migration number.
- Take a current database backup before migrations.
- Use health checks before switching/declaring success.
- Retain the prior compatible image for rollback.
- Database rollback is restore-based unless a specific migration has a verified reverse path.

Android TV releases should be signed consistently, versioned and initially
sideloaded. Preserve the signing key outside the repository with a secure
recovery record. `apps/tv/local.properties` is an ignored machine-local SDK path;
never place signing configuration or passwords there.

The release shell accepts only an entered HTTPS Hearth origin. Debug cleartext
is restricted to `10.0.2.2`, `127.0.0.1` and `localhost`; use the emulator host
alias or `adb reverse tcp:4320 tcp:4320` rather than permitting arbitrary LAN
HTTP. Pair from the phone Admin television list. Revocation is independently
checked by the native shell and clears the encrypted local credential.

Build and inspect before sideloading:

```sh
cd hearth
pnpm verify:tv
apkanalyzer manifest permissions apps/tv/app/build/outputs/apk/release/app-release-unsigned.apk
```

The repository intentionally contains no release keystore. Emulator pairing,
remote navigation, Back, switching, sleep/wake, server recovery and revocation
results are recorded under `hearth/docs/evidence/phase-6`. Release signing and
the selected-TCL install/lifecycle run remain separate release steps.

## Monitoring

Monitor locally:

- Hearth process/database readiness
- time since successful calendar sync
- Home Assistant availability
- Music Assistant availability and last successful Jellyfin/player discovery
- Synology capacity
- TV availability only during expected hours

Notify an adult only for persistent or actionable failures. Do not generate household noise for transient restarts.

## Power automation safety

- Do not hard-cut mains power during normal operation.
- Turn off only after a presence grace period and only when protected media
  states are false for both native-app and Music Assistant/Cast playback.
- Keep quiet hours and a manual override.
- Test network wake after an overnight standby before relying on it.
- Use existing IR through ESPHome only as a controlled fallback.

## Planned Music Assistant and voice commissioning

This work has not been performed on the live Pi, Synology or TCL. It requires
approval because it changes the existing Home Assistant appliance and creates a
new Jellyfin credential.

### Preserve first

1. Create a current Home Assistant backup and copy it to the restricted
   Synology backup location.
2. Verify the backup can be opened and record the running Home Assistant,
   ESPHome and voice-pipeline versions.
3. Record current television, presence and IR entity/script mappings so the
   change can be reversed without guessing.

### Install and connect

1. Install Music Assistant from the Home Assistant App Store. Home Assistant OS
   is the recommended deployment because the app and local-player networking
   are handled together.
2. Confirm the official Music Assistant integration is discovered under
   **Settings → Devices & services**.
3. Create a dedicated least-privilege Jellyfin user for music access and add the
   Jellyfin music provider in Music Assistant. Do not reuse an administrator
   credential or store it in this workspace.
4. Confirm Music Assistant discovers the TCL through its native Google Cast
   provider. Television/video Cast players are disabled by default in Music
   Assistant, so explicitly enable only the selected TCL. Add the same
   television to Home Assistant through Android TV Remote for
   power/volume/app control.
5. Give the resolved Cast player the household-facing name `Hearth TV`.
6. Install Music Assistant's documented community voice-support repository and
   its local play-media blueprint/custom sentences. Starting an arbitrary song
   from Assist is not currently a built-in Home Assistant core intent.
7. Map the living-room Voice Preview Edition/area to `Hearth TV` when the voice
   command has no explicit player. Keep other player targets allowlisted and
   explicitly named.

### Validate on the household network

- “Play Dreams by Fleetwood Mac” selects the expected track and `Hearth TV`.
- An explicit different room/player overrides the implicit living-room target.
- Cast wakes/switches the TCL where supported and shows usable metadata.
- Pause, resume, next, previous, stop and volume work from Voice Preview Edition
  and iPhone Assist.
- Ambiguous titles do not silently select an unsafe or obviously wrong result.
- The Voice Preview Edition hardware button/push-to-talk path remains usable
  during loud music or a movie when wake-word detection is unreliable.
- eARC audio, TV standby, Screenless Service/network standby and recovery after
  Pi/TV/router restart are reliable.
- The Home Assistant protected-media helper remains true throughout native and
  Cast playback, so presence automation cannot switch the television off.
- Hearth remains completely usable if Music Assistant is stopped.

The current Music Assistant documentation warns that its Jellyfin music source
has no dedicated developer and is maintained on a best-effort basis. Before
household acceptance, test library refresh, search, playlists and sustained
playback. If the provider is unreliable, stop and obtain approval for the
fallback: expose only the Synology music folder as a read-only network-storage
source through the supported Home Assistant OS mechanism. Do not add broad
container mount privileges merely to make the fallback work, and retain
Jellyfin as the native television browsing server.

After validation, create a fresh Home Assistant backup and retain the exact
Music Assistant, Home Assistant and Jellyfin versions plus rollback notes.

Official setup references:

- <https://www.music-assistant.io/installation/>
- <https://www.home-assistant.io/integrations/music_assistant/>
- <https://www.music-assistant.io/music-providers/jellyfin/>
- <https://www.music-assistant.io/integration/voice/>
- <https://www.home-assistant.io/integrations/androidtv_remote/>

## Purchases still external to software work

- Preferred TV direction: TCL 65C7L. Consider 65C8K when the verified delivered
  price is only modestly higher; use 65C6K only as the value fallback if
  suitable clearance stock appears. No model, retailer, price or stock is
  confirmed until rechecked at purchase time.
- Home Assistant Voice Preview Edition.
- Professional VESA 300×300 mounting, recessed power and preferably Cat6.
- Speaker only after testing the TV; Sonos Beam Gen 2 is the clean preferred upgrade.
- Optional ESP32 and later Zigbee/Thread or mmWave hardware.

These are planning assumptions, not confirmed purchases. Recheck current price, stock and exact final TV model before writing model-specific automation.
