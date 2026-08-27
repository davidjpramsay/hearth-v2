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

Before the first live iCloud read, use the full Apple Account email as the username and create a
dedicated revocable app-specific password under **Apple Account > Sign-In and Security >
App-Specific Passwords**. Apple requires two-factor authentication before it will issue one. Enter
that generated password in Hearth; never enter the main Apple Account password. Apple documents
this fallback for third-party Calendar access at
<https://support.apple.com/en-us/121539> and the generation/revocation steps at
<https://support.apple.com/en-au/102654>.

Approve the exact calendar names returned by discovery and save through the companion Calendar
page. Start Hearth in private mode, confirm all returned sources are read-only, then revoke the
app-specific password after validation if the deployment is not proceeding. No calendar write
method is present. This code path is covered against a deterministic CalDAV service, but the real
iCloud account remains unverified until the owner performs the first credentialed test.

After connection, change Calendar assignments directly on that same page. The
mapping save does not request an app-specific password: it retains the existing
credential, updates only the exact calendar/person allowlist and refreshes the
projection. Use Whole family for shared sources; a named person automatically
uses their current Hearth avatar and colour.

Open Today, Week and Month screens request current calendar data immediately,
then every five minutes while visible. They also refresh as soon as the browser
reconnects and whenever an adult saves, remaps or removes calendar settings.
The server attempts the bounded read-only CalDAV sync for each request. If
iCloud is temporarily unavailable, Hearth serves the last durable projection,
marks it stale and keeps the saved events on screen. Do not remove and recreate
the connection merely to force a refresh; first allow the next automatic cycle
or reconnect, then inspect the Calendar status and server logs if stale state
persists.

### Retired CalDAV Reminders capability probe (do not run)

This diagnostic has been removed from the server and archived with the Apple Reminders proof under
`hearth/archive/apple-reminders-bridge/`. The command below is retained only as historical evidence;
it must not be used as an operating procedure.

The former operator-only diagnostic tested whether the commissioned CalDAV account explicitly
advertised a `VTODO` collection. Its implementation and old command are retained only in the
archive; the active server contains no executable probe.

The sample limit accepts `0` through `10`; always begin with `0` for metadata-only discovery. If and
only if `taskCollectionCount` is greater than zero, the owner may approve a second bounded run with
`HEARTH_REMINDERS_PROBE_SAMPLE_LIMIT=3` to confirm that title, status and due/completion fields parse.
The result is
printed only to the interactive terminal and deliberately omits account details, private URLs, UIDs,
descriptions and raw DAV content. Collection names and sampled reminder titles are still household
information, so do not redirect the result into logs, source control or chat. If
`taskCollectionCount` is zero, stop: the current account has not advertised a standards-based task
collection and no unsupported iCloud endpoint should be tried. If a task collection is found,
review the bounded result before proposing a separately approved read-only product integration.
`ignoredCollectionResponseCount` records harmless `REPORT` responses that repeat the collection
URL rather than identifying a task object; it does not represent a reminder. Any different-origin
or outside-collection resource remains a hard failure.

The commissioned 2026-08-25 probe completed and did not expose the account's newly created current
Reminders through CalDAV. Do not repeat the probe as a routine health check or treat advertised
`VTODO` capability as proof of modern iCloud Reminders access. The direct CalDAV Reminders path is
closed unless Apple documents a supported change.

### Retired native Reminders bridge commissioning (historical)

The former SwiftUI iOS 17+ target and its contract are archived under
`hearth/archive/apple-reminders-bridge/`. They are excluded from current builds and must not be
commissioned without a new product/security decision. The following text records the completed
proof only.

The archived target was built locally with XcodeGen/Xcode using the
`HearthCompanion` scheme on a physical iPhone. The app's
`NSRemindersFullAccessUsageDescription` explains that the permission is used
only to read selected lists; the target contains no Apple ID, iCloud
app-specific password, private URL or NAS credential.

The simulator run is a presentation and fake-adapter check only. For the live
proof, the owner selects the physical iPhone, grants Reminders access, chooses
the current `Reminders` and `Family Reminders` lists and confirms the prepared
test reminders' titles, due values and completion states. Check the native
Reminders app before and after to confirm Hearth made no changes. Record the
iPhone model, iOS version, selected lists and visible test-reminder titles in
the phase-8 evidence note. Do not claim the native EventKit proof until this
run is completed; do not place any Apple credential or private device detail in
source control or chat.

Do not reuse the calendar app-specific password. On the private HTTPS/Tailscale Hearth origin, the
iPhone companion generates its own 32-byte secret, stores it in Keychain and displays the
server-issued six-character code. A signed-in adult approves that code in Hearth; no operator edits
an environment file or database row. The app then exchanges and uploads through the distinct
`HearthReminderSource` authorization scheme described in
`REMINDERS_COMPANION_CONTRACT.md`.

Before enabling the household surfaces, verify all of the following without printing the secret or
raw EventKit identifiers:

1. the selected lists survive iPhone terminate/relaunch;
2. the current source session reports the expected household/source and next sequence;
3. one full snapshot succeeds and the household read endpoint returns the expected safe titles,
   due semantics and completion states;
4. an exact upload replay reports `replayed: true`;
5. disconnect/revoke makes the source credential return `UNAUTHENTICATED` while unrelated Hearth
   health, calendar and household data remain available.

Do not script the source secret into Compose, shell history or Synology files. The app must stop and
offer fresh pairing after revocation. A temporary stale source is not an operator incident: Hearth
keeps cached reminders and the user can foreground or manually refresh the iPhone bridge. The
paired app also requests a best-effort iOS background refresh no earlier than fifteen minutes after
it is suspended. Keep Background App Refresh enabled for Hearth Companion, but do not diagnose a
stale badge as a server fault merely because iOS delayed the task; Apple controls its actual launch
time. After installing a build that changes this path, verify it on the physical iPhone before
claiming background latency.

The Home Assistant REST adapter likewise remains inert unless private mode sets
`HEARTH_HOME_ASSISTANT_CONFIG_PATH` to an access-restricted, writable file outside the repository.
Do not place the URL, token or entity IDs in `.env`, Compose values, source, SQLite, logs, chat or a
command line. After a current Home Assistant backup and rollback path are verified, an adult uses
**Connections > Home Assistant** to test the server-reachable private root address and a dedicated
long-lived token. The browser receives only opaque choices and friendly labels. Save maps exactly
occupancy, television power, Hearth foreground, protected playback, Evening, Goodnight and Screen
off; the server atomically writes the raw JSON with mode `0600` and activates it without restart.
Removal deletes that file and returns the provider to the explicit unconfigured state.

Commission the three scripts and four helper/state entities in Home Assistant before saving the
mapping. Confirm the generic protected-playback helper covers native Google TV and Cast playback,
then exercise each Hearth Home action while watching the actual device. Hearth makes no arbitrary
service call and has no Jellyfin, Music Assistant or Cast control. If validation does not proceed,
remove the connection through Admin and revoke the dedicated token. Take a fresh Home Assistant
backup only after the verified mapping/hardware test.

The optional Today daily verse remains inert unless `HEARTH_ESV_API_KEY_PATH` points to an
owner-readable server file containing only an active ESV API token. In the Synology Compose layout,
create `${HEARTH_SECRETS_DIR}/esv-api-key`, make it readable only by the configured Hearth UID/GID
and restart the Hearth server before enabling **Daily Bible verse** in **Today & notices**. The
current server reads this optional secret at process startup. Never place the token in Compose,
`.env`, a Vite variable, source, logs or screenshots. If a token is disclosed, revoke/regenerate it at
<https://api.esv.org/account/> before commissioning.

Weather is independent of Home Assistant. Use **Hearth settings → Household →
Weather location** on a phone to search a suburb/postcode or use the phone's
current location, test the displayed conditions and save. Suburb precision is
sufficient; Hearth stores coordinates locally and does not need a street
address. `HEARTH_WEATHER_LATITUDE` and `HEARTH_WEATHER_LONGITUDE` remain an
optional backwards-compatible fallback only when no household location has
been saved. Both fallback variables must still be set together and in range.
The server calls Open-Meteo for search/forecast and uses Nominatim only for a
direct user-triggered phone reverse-label request.

Set `HEARTH_MODE=private` only with a dedicated private database path. If
`HEARTH_DATABASE_PATH` is omitted, Hearth chooses `data/hearth-private.sqlite`
for private mode and `data/hearth-demo.sqlite` for demo/test. Do not point
private mode at a copied demo database. The adult first-use command is implemented but remains inert
without the approved private HTTPS origin and external one-time code. Do not enrol a real passkey or
enter household data until that origin/certificate is commissioned.

## Synology paths

Keep the v2 source/release area separate from the private household state and from the old
deployment:

```text
/volume1/docker/hearth-v2/
  source/              exact staged Hearth source tree
  staging/             temporary release staging
  staged-source-version       candidate copied but not yet activated
  active-source-version       last release that passed readiness
  previous-source-version     retained rollback image version

/volume1/hearth-v2-private/
  data/                SQLite, managed photos, derivatives and online backups
  secrets/             external runtime secrets, mode-restricted
```

The commissioned private project is
`/volume1/docker/hearth-v2/source/hearth/deploy/synology/runtime/private-project/`. Its `.env`
points `HEARTH_DATA_DIR` to `/volume1/hearth-v2-private/data` and `HEARTH_SECRETS_DIR` to
`/volume1/hearth-v2-private/secrets`. The generic `./runtime/data` and `./runtime/secrets` values
in `hearth/deploy/synology/.env.example` are only for a new isolated deployment. Live secrets
never return to the workspace.

### NAS firewall compatibility

If Synology network hardening inserts a `FORWARD_FIREWALL` chain before Docker's own forwarding
chains, permit only packets that originated on a Docker bridge to continue to Docker's own
`DOCKER-USER`, isolation and published-port policy. Do not move Docker ahead of the firewall and do
not add an output-interface exception, because either could bypass the inbound WAN boundary. The
repository helper `hearth/deploy/synology/ensure-docker-firewall.sh` adds one idempotent
input-interface `docker+` `RETURN` rule and removes the superseded Hearth-subnet/DNS exceptions. It
does not open a host port or permit unsolicited inbound WAN traffic. The commissioned NAS installs it as the root-owned
`/usr/local/etc/rc.d/S99hearth-docker-firewall.sh`. Its boot action applies the rules once after
Docker/firewall startup; no polling monitor runs. The private release activator also refreshes the
hook from root-owned configuration and reapplies the rules after recreating the Hearth containers.

This compatibility rule is required because DSM mirrors its host-oriented catch-all drop into
`FORWARD_FIREWALL` before Docker's generated forwarding rules. Without it, containers cannot use
their normal bridge, DNS or outbound path; Hearth's static web shell can load while nginx's API
proxy times out connecting to the server container. Packets arriving from LAN, Tailscale or WAN
still meet the existing source/port rules before Docker. Docker's own bridge-isolation rules remain
active, and qBittorrent continues to share Gluetun's network namespace and kill switch. After an
explicit DSM firewall reload, run the hook's `start` action once, confirm its `status` action, then verify the
container-to-container readiness request and the public `/api/v1/readiness` route.

For pre-commission television testing, `compose.demo.yaml` provides a separate LAN-bound pilot with
fictional data only. It does not mount the secrets directory, calendar/Home Assistant configuration
or a Synology photo source. Its bind address must be the NAS's exact private LAN address; never add a
router port-forward or public reverse proxy. This pilot is not the private household deployment.
Once the private instance is commissioned, stop and remove the NAS demo project and its separate
data. Continue routine UI work in local demo/test mode; never copy the private database, secrets or
approved photo mount into development.

## Implemented container scaffold

As of 2026-08-09, `hearth/deploy/synology` contains the local production scaffold: a multi-stage
Dockerfile, two-service Compose definition, rootless nginx same-origin proxy, health checks, pinned
Node 24.18.0 and nginx 1.30.4 bases, read-only roots, dropped capabilities, bounded logs and an
explicit two-hop DSM Reverse Proxy → nginx → Fastify trust boundary for client-address throttling,
and an ignored runtime directory template. The server production build includes all 25 forward migrations
and compiles `better-sqlite3` within the target Linux image.

As of 2026-08-21, ordinary production updates no longer execute that build on the DS920+.
GitHub Actions builds and caches the native `linux/amd64` server/web targets, then publishes them to
private GitHub Container Registry packages only after every verification job passes. Production
Compose contains immutable image references and no build instructions. `compose.build.yaml` keeps
the same Dockerfile available as an explicit recovery fallback, not the normal release path.

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
docker compose --env-file deploy/synology/.env.example \
  -f deploy/synology/compose.yaml \
  -f deploy/synology/compose.build.yaml config --quiet
docker build --platform linux/amd64 --target server \
  -t hearth-v2-server:local-amd64 -f deploy/synology/Dockerfile .
docker build --platform linux/amd64 --target web \
  -t hearth-v2-web:local-amd64 -f deploy/synology/Dockerfile .
```

On 2026-08-16 the private Synology service was commissioned at the allowlisted HTTPS origin recorded
in the private commissioning runbook. It uses a dedicated non-root service identity, source/release
files under `/volume1/docker/hearth-v2`, private data under `/volume1/hearth-v2-private/data`,
private secrets under `/volume1/hearth-v2-private/secrets`, and a separate read-only photo share.
The temporary fictional NAS demo was then stopped and removed at the owner's request. First-adult
enrolment, second-adult recovery validation, an encrypted off-device backup, an actual clean-location
restore drill and a focused security review remain operational acceptance work.

### Image-registry visibility and one-time private setup

Repository visibility and GHCR package visibility are independent. The source repository became
public on 2026-08-21, but that did not make the existing server and web packages public. GitHub
Actions publishes those packages with its short-lived `GITHUB_TOKEN`; no repository secret is
required and the workflow cannot contact the Synology.

When the packages are private, the NAS needs one separately revocable Personal Access Token
(classic) with only `read:packages`, as currently required by GitHub Container Registry. Keep them
private unless the owner separately approves publishing the image artifacts. Never grant
`write:packages`, `delete:packages` or unrelated account scopes merely to deploy Hearth.

From an interactive administrator SSH session on the NAS, run the Container Manager Docker client
and enter the GitHub username plus the token only at its password prompt:

```sh
sudo /var/packages/ContainerManager/target/usr/bin/docker login ghcr.io
```

The credential belongs to root's access-restricted Docker configuration because the release command
runs Compose through `sudo`. Never put it in `.env`, Compose, a shell argument, source, chat or the
GitHub workflow. Revoke the token in GitHub and run `docker logout ghcr.io` on the NAS if the reader
is retired. This one-time persistent-access setup requires explicit owner confirmation when it is
performed.

Public packages need no NAS registry credential. Publishing them is reasonable only when the exact
images have been verified to contain no household data, credentials, private URLs or commissioned
configuration. The production images are designed to satisfy that boundary; private state is
mounted at runtime rather than baked into an image.

### Normal private release

Promote only an exact full Git commit whose hosted workflow has completed successfully and published
both packages. The commissioned NAS uses one root-owned Hearth-only release helper so normal Codex
deployments never need to surface or store the Synology administrator password. Install that helper
once, from a visible owner-controlled terminal:

```sh
hearth/deploy/synology/install-release-helper.sh
```

This is the final interactive privilege step. A genuine `sudo` prompt echoes no characters. The
installer copies the fixed production Compose and runtime environment into root-only configuration,
installs `/usr/local/sbin/hearth-v2-activate-staged` plus the root-owned one-shot Docker-firewall
boot hook, and grants the named deployment user
passwordless access to that command only. It does not grant a passwordless shell, Docker client or
general `sudo`. If the canonical production Compose changes, rerun the one-time installer before
activating that release so the root-owned copy is deliberately refreshed.

For every subsequent verified release, run from the repository root:

```sh
hearth/deploy/synology/activate-private-release.sh <full-verified-commit>
```

The activation script stages that exact source/Compose revision and pulls both images while the
existing containers remain running. It recreates the project with an explicit full immutable commit
tag, waits up to 60 seconds for the loopback readiness route, and only then records the new active
version plus the previous rollback version in atomically replaced runtime metadata. The activation
uses `sudo -n` and fails closed with an installation instruction if the fixed helper or its sudo
policy is missing. The database, managed photos, optional read-only import and integration secrets
stay in their existing external mounts.

`stage-private-release.sh` remains available when an operator deliberately wants to stage without
restarting. Do not choose Container Manager **Build** for a normal update: production Compose has no
build context. If GHCR is unavailable and an operator explicitly accepts a slow NAS recovery build,
combine `compose.yaml` with `compose.build.yaml`; never silently fall back to compilation.

### Root-owned release-helper boundary

The NAS no longer compiles Hearth during a normal release. GitHub Actions builds both `linux/amd64`
images, and the Synology only downloads and recreates containers. The remaining friction comes from
two intentional boundaries: Docker on DSM is root-controlled, and private GHCR packages require a
root-owned registry login. Codex must not read, type or store the DSM password or registry token.

The owner enters the DSM password once when installing the fixed helper; normal releases then use
its exact no-argument activation command through `sudo -n`. The deployment account may stage only
a 40-character version marker. It cannot replace the root-owned Compose, environment, helper or
firewall hook. The helper refreshes and reapplies the root-owned hook from its root-only copy, pulls only the two
fixed Hearth image names, recreates only the fixed
`hearth-v2` project, waits for readiness and atomically records the active version. A public source
repository does not remove the registry step while its packages remain private.

If the one-time installation prompt is unavailable, the supported Safari fallback is:

1. Stage the exact green commit and transfer a short, inspectable release script to the NAS.
2. Create a **disabled**, root-owned DSM Task Scheduler task that runs only that file.
3. Let the owner submit the DSM password when DSM saves the task, then run it manually.
4. Verify the exact container image tags, loopback readiness and private origin.
5. Delete the task, release script and task log after verification.

Do not paste a long release program into DSM's script text area: browser editing has previously
mutated shell text. Do not leave a reusable root deployment task behind. The permanent helper above
is the explicitly approved alternative: it is root-owned, argument-bounded, configuration-pinned
and validated with `sudo -n` after installation.

### Additional household Synology installations

A second household may use the same verified public source and container images, but it is a new
commissioned instance—not a clone of the first household. Give it a distinct HTTPS origin, service
identity, runtime path, database, photo store, secrets, passkeys/recovery material and registry
reader if packages remain private. Never copy another household's database, calendar credentials,
Home Assistant token, photos or authentication material. Confirm the NAS architecture, Container
Manager version, storage paths and private LAN/Tailscale reachability before activation.

## Backup design

### Hearth

- The implemented private service uses SQLite's online backup mechanism, not a casual copy of an
  active WAL database. `HEARTH_BACKUP_DIR` must be absolute; Compose sets it to `/data/backups`.
- `HEARTH_BACKUP_INTERVAL_HOURS` defaults to 24 and `HEARTH_BACKUP_RETENTION` defaults to 14.
  The first scheduled check runs after startup, skips a still-current copy and retries later after
  a family-safe failure. An adult may also choose **System Health → Create backup now**.
- Every copy is verified with SQLite `quick_check`, foreign-key checks and a schema-version read,
  retained as one mode-`0600` database file inside a mode-`0700` directory and pruned to the
  configured count. The browser sees only status, time, size and retention—not a path or download.
- Back up deployment configuration excluding renewable/cache content.
- Perform a restore into an isolated test location before production acceptance.

The repository integration test now creates three online backups while the source database is open,
proves idempotency/audit records and retention, verifies the latest copy, restores it to a new clean
path and reads the household from that restored database. `node apps/server/dist/recovery-cli.js
verify …` validates one copy; `restore … <new-destination>` writes only to a path that does not
already exist. This is strong local tooling evidence, not the required live Synology restore drill.

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

- Adult phone uploads are the primary photo path. The server writes normalized managed masters to
  `/data/photo-uploads` and display/thumbnail WebPs to `/data/photo-derivatives`; both locations are
  inside the restricted `HEARTH_DATA_DIR` mount. The browser never supplies a server destination.
- Include the complete host `HEARTH_DATA_DIR` in encrypted Synology Hyper Backup. The in-app online
  SQLite backup protects photo metadata and curation, not the managed image files; a valid photo
  recovery drill must restore the database, managed masters and derivatives together to a clean
  location and confirm the opaque asset routes still resolve.
- Optionally mount one explicitly approved family-photo folder at `/photos-source` read-only for
  bulk import. Leave `HEARTH_PHOTO_SOURCE_DIR` blank when it is not useful; never mount the Synology
  photo-library root. Admin **Check folder** rebuilds imported derivatives without affecting managed
  uploads.
- Admin Photos identifies **Added in Hearth** and **NAS folder** assets. Selection mode can hide or
  restore either source in bulk. **Delete uploads** permanently removes only Hearth-managed masters
  and derivatives after confirmation. To remove an imported asset, delete its original from the
  approved Synology folder and run **Check folder**; Hearth must not receive write access to that
  source. Existing backup snapshots can retain deleted managed photos until their configured
  retention expires, even though the active library no longer serves them.
- Photo responses, command receipts, audit summaries and logs must remain free of client filenames
  and host/container paths. A temporary optional-import outage should preserve and serve the last
  safe derivative set while managed uploads continue to work.
- Member profile-photo derivatives are identity settings stored inside Hearth SQLite and are covered
  by the normal database backup/restore drill. The chosen original file is not retained by Hearth.
- Do not imply that Hearth backups protect the entire media library or an optional import folder;
  those originals remain governed by the Synology's existing backup strategy.

## Update and rollback

- Publish immutable full-commit images only after the complete hosted verification gate.
- Pull both target images before recreating either running container.
- Record deployed image/version and migration number.
- Take a current database backup before migrations.
- Use health checks before switching/declaring success.
- Retain the prior image and `previous-source-version`; do not prune them as part of deployment.
- Database rollback is restore-based unless a specific migration has a verified reverse path.
- Do not automatically start an older image after a forward migration. Verify compatibility or
  restore the matching pre-update database through the documented operator recovery path.

## Continuous verification

`.github/workflows/verify.yml` is the merge gate for `main` and pull requests. It uses pinned
full-commit action references and no household secrets. Three independent verification jobs run the
complete pnpm/Playwright gate on Node 24.18.0, the Android TV test/lint/debug-and-release build on
Java 21 plus SDK 36, and both Synology production image builds after validating pull-only and
fallback Compose configuration. On a non-pull-request run, a fourth job receives only
`contents: read` and `packages: write`; it waits for all three verification jobs, reuses the Buildx
cache and publishes the server/web `linux/amd64` images under the exact full commit tag. It never
deploys, signs an APK, contacts a provider or gains access to the private household network.

Keep local verification authoritative while changing the workflow itself, then confirm the first
GitHub run before requiring it in branch protection. Retain Playwright's single CI worker for
deterministic demo/reset state.

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
