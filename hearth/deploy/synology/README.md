# Synology deployment scaffold

This directory builds Hearth as two small, same-origin containers:

- `server`: the private Fastify service and SQLite database owner
- `web`: the static React application and `/api` reverse proxy

The web container binds only to Synology loopback. DSM Reverse Proxy must provide the stable private
HTTPS origin required by adult passkeys and the television release app. The repository deliberately
does not choose or create the household hostname, certificate, router rule or live Synology folders.
DSM Reverse Proxy and the bundled nginx container are the two trusted HTTP proxy hops. Fastify
trusts exactly those two hops so client-address rate limiting resolves the household device rather
than collapsing every request to DSM/nginx or accepting a longer arbitrary forwarding chain.

`compose.demo.yaml` remains available for temporary local or pre-commission television testing. It
contains fictional data and accepts no provider credentials. Do not keep that pilot running on a
commissioned household NAS unless a short, explicit test requires it; remove it again after the test.
The private instance is the only long-lived Synology deployment.

## Local validation

From `hearth/`:

```sh
docker compose \
  --env-file deploy/synology/.env.example \
  -f deploy/synology/compose.yaml \
  config

docker compose \
  --env-file deploy/synology/.env.example \
  -f deploy/synology/compose.yaml \
  -f deploy/synology/compose.build.yaml \
  config

docker build \
  --target server \
  -f deploy/synology/Dockerfile \
  -t hearth-v2-server:local .

docker build \
  --target web \
  -f deploy/synology/Dockerfile \
  -t hearth-v2-web:local .
```

The images use pinned Node 24 LTS and nginx stable tags, run application processes as non-root,
drop Linux capabilities, use read-only root filesystems in Compose, retain only bounded container
logs and expose separate liveness/readiness endpoints. SQL migrations are copied into the server
production build and run forward-only at startup. The native SQLite binding is compiled in the
pinned build image so it does not depend on a prebuilt binary from a different Linux runtime.

## Deployment inputs

The generic `.env.example` below describes a fresh or isolated deployment. It is not the live
household path. The commissioned private instance keeps its release source under
`/volume1/docker/hearth-v2` but keeps household state and secrets in the separate protected share
`/volume1/hearth-v2-private`:

```text
/volume1/docker/hearth-v2/source/hearth/deploy/synology/runtime/private-project/
  docker-compose.yml
  .env
/volume1/hearth-v2-private/
  data/
  secrets/
```

Its `HEARTH_SECRETS_DIR` is `/volume1/hearth-v2-private/secrets`, mounted inside the server as
`/run/hearth-secrets`. Do not create provider secrets under the source checkout or under the old
`/volume1/docker/hearth` deployment.

Before any approved Synology commissioning:

1. Copy `.env.example` to an access-restricted `.env` outside source control.
2. Set `HEARTH_IMAGE_REGISTRY` to the approved private package namespace and replace
   `HEARTH_VERSION` with the full 40-character verified Git commit.
3. Set `HEARTH_UID` and `HEARTH_GID` to a dedicated, non-root Synology service account.
4. Create the separate v2 data and secret directories described in `OPERATIONS.md`; grant only that
   service account read/write access and never use world-writable permissions.
5. Keep the secret directory writable by the server because approved Calendar and Home Assistant
   companion setup uses atomic `0600` writes. Never place either resulting JSON file in Compose,
   Git, an image or a command line.
6. Select one stable private hostname and a certificate trusted by both iPhone and Google TV.
7. Set `HEARTH_AUTH_RP_ID` to that hostname and `HEARTH_AUTH_ORIGIN` to its exact HTTPS origin.
   They are validated together at startup and must not be temporary addresses.
8. Generate the one-time local setup code as an access-restricted file named `first-use-code` in
   `HEARTH_SECRETS_DIR`. For example, from a shell already restricted to the Synology administrator:

   ```sh
   umask 077
   openssl rand -base64 32 > "${HEARTH_SECRETS_DIR}/first-use-code"
   ```

   Read that code locally during first setup; do not place it in Compose, Git, chat or a URL. Hearth
   consumes the file after the first adult passkey and household are created.

9. Configure DSM Reverse Proxy from that HTTPS origin to `http://127.0.0.1:8432`, preserving `Host`
   and `X-Forwarded-Proto`. Do not create a router port-forward or public DNS exposure.

10. Family photos require no shared-folder setup. Authenticated adults use **More → Admin → Photos
    → Choose photos**; Hearth writes normalized managed masters under `/data/photo-uploads` and
    display/thumbnail WebPs under `/data/photo-derivatives`, both inside `HEARTH_DATA_DIR`. To bulk
    import an existing collection only, approve one exact Synology folder, set
    `HEARTH_PHOTO_HOST_DIR` to that host folder and set `HEARTH_PHOTO_SOURCE_DIR=/photos-source`.
    Production Compose always keeps this one narrow host path mounted read-only; set it to a
    dedicated empty folder when import is unused. The optional importer ignores symlinks and
    returns only opaque asset URLs. Never mount the Synology Photos library root. Leaving the source
    blank disables only optional folder import, not managed phone uploads.

11. Leave Home Assistant unconfigured until its current backup and rollback path are verified. An
    adult can then use **More → Connections → Home Assistant** to test the private root address and
    a dedicated long-lived access token, and map exactly four safety states plus Evening,
    Goodnight and Screen off. The browser receives only opaque choices and friendly labels; the
    resulting URL, token and raw entity IDs remain in `/run/hearth-secrets/home-assistant.json`.

12. Daily Bible verse is optional. After creating or rotating an ESV API token, put only the token
    in `${HEARTH_SECRETS_DIR}/esv-api-key`, set mode `0600` and ownership to the Hearth service
    UID/GID, then restart the Hearth server and enable it in **Today & notices**. The current server
    reads this optional secret at process startup. Never add the token to this Compose file, `.env`,
    Git, an image layer, logs or screenshots.

13. Keep `HEARTH_BACKUP_RETENTION=14` and `HEARTH_BACKUP_INTERVAL_HOURS=24` initially. The server
    writes consistent SQLite online backups under `/data/backups`; this directory is already inside
    the restricted data mount. Configure encrypted Synology Hyper Backup for the complete host data
    and secrets directories so a NAS-volume failure does not remove the database, managed photo
    files and every local copy. The Hearth backup button itself copies only SQLite: it does not copy
    managed image files, provider secrets, optional folder-import originals or the separate Home
    Assistant appliance.

The hostname and certificate mechanism are intentionally unresolved deployment inputs. The passkey
contract is implemented, but enrolment remains inert until those values and the first-use code file
are supplied. Changing the WebAuthn relying-party origin later invalidates the intended trust
boundary.

## Fictional-data M7 pilot

Use this path only for the temporary household-screen pilot. Copy `demo.env.example` to an
access-restricted `.env.demo` outside source control, set the immutable tested commit, the dedicated
Synology UID/GID, the Synology's exact LAN address and a separate demo data directory, then validate:

```sh
docker compose --env-file /volume1/docker/hearth-v2/env/hearth-demo.env \
  -f /volume1/docker/hearth-v2/source/hearth/deploy/synology/compose.demo.yaml \
  config --quiet
```

After explicit approval, start it with the same arguments plus `up --detach --build`. Open
`http://<synology-lan-address>:8432` in the M7 Internet app. The demo exposes its reset and visual
scenario controls to the local network, so it must stay fictional and LAN-only. Stop and delete the
pilot project and its separate data directory once private HTTPS is commissioned. Never copy the
private database, secrets or approved photo mount into a demo or local development environment.

## Updating the commissioned private instance

Private household state is not stored in an image or source checkout. Recreating `hearth-v2`
preserves `/volume1/hearth-v2-private`, including managed photo files, and the narrow read-only
`/volume1/hearth-photos` import mount.

### One-time GHCR authentication

The verified server and web packages are private. Create a separately revocable GitHub Personal
Access Token (classic) with only `read:packages`. In an interactive NAS administrator SSH session,
run the command below and enter the GitHub username and token only at its prompts:

```sh
sudo /var/packages/ContainerManager/target/usr/bin/docker login ghcr.io
```

Docker retains that reader under root's access-restricted configuration because private releases
run Compose through `sudo`. Never place it in `.env`, Compose, Git, a command argument, chat or a
screenshot. Do not make the packages public. Registry sign-in grants persistent package access and
therefore requires explicit owner confirmation when performed.

### Normal pull-only update

After the exact full commit has passed all hosted checks and the publish job has produced both
`linux/amd64` images, run this from the repository root:

```sh
hearth/deploy/synology/activate-private-release.sh <full-verified-commit>
```

The scripts use the `hearth-synology` SSH alias by default. If that alias needs a hostname override,
set `HEARTH_DEPLOY_SSH_HOSTNAME=<private-nas-hostname>` for the command. Synology may ask for the
administrator password interactively; Hearth never reads or stores it.

The activation first stages the exact source revision and copies the canonical pull-only production
Compose into the preserved private project. The staging guard also refuses a release whose Compose
file omits the server-side ESV secret path. It then pulls both images while the old containers are
still serving, recreates the project with the requested full commit and waits for the loopback
readiness route. Only a ready release becomes the recorded active version; the former active version
is then retained as the rollback image version. An image-authentication or download failure occurs
before replacement, so it does not deliberately stop the working release. Confirm the private
routes too:

```sh
curl --fail --silent --show-error \
  https://<private-hearth-origin>/api/v1/readiness
curl --fail --silent --show-error \
  https://<private-hearth-origin>/api/v1/runtime
```

Perform this from the home LAN or connected Tailscale because the private origin denies other
networks. Do not deploy an uncommitted working tree or automatically follow an unverified branch.
Do not choose Container Manager **Build** for an ordinary update; production Compose deliberately
contains no build context.

`stage-private-release.sh <full-verified-commit>` remains available when an operator intentionally
wants to stage without restarting. If the private registry is unavailable, a deliberately slow
source recovery build remains possible by combining `compose.yaml` and `compose.build.yaml`. This
is an explicit fallback only and must not occur automatically on the DS920+.

## Backup verification and clean-location restore

The Admin **System Health** page reports only safe database, backup and version state. An adult may
request a new online copy there. It never exposes a filename or downloadable household database.

From a restricted Synology administrator shell, choose one retained file and verify it inside the
server image. On the commissioned private instance, use the preserved private project paths:

```sh
docker compose \
  --env-file /volume1/docker/hearth-v2/source/hearth/deploy/synology/runtime/private-project/.env \
  -f /volume1/docker/hearth-v2/source/hearth/deploy/synology/runtime/private-project/docker-compose.yml \
  exec server \
  node dist/recovery-cli.js verify /data/backups/<backup-file>.sqlite
```

For the required drill, restore to a new location only:

```sh
docker compose \
  --env-file /volume1/docker/hearth-v2/source/hearth/deploy/synology/runtime/private-project/.env \
  -f /volume1/docker/hearth-v2/source/hearth/deploy/synology/runtime/private-project/docker-compose.yml \
  exec server \
  node dist/recovery-cli.js restore /data/backups/<backup-file>.sqlite \
  /data/restore-drill/hearth.sqlite
```

The tool verifies the source and restored database and refuses to overwrite any existing
destination or restore work file. Confirm the migration version and inspect the isolated database
before considering a live swap. Replacing the active database requires a stopped server,
preservation of the current file and explicit approval; it is deliberately not an Admin button.

## Start and inspect

Only after explicit approval to change the live Synology. On the commissioned private instance:

```sh
docker compose \
  --env-file /volume1/docker/hearth-v2/source/hearth/deploy/synology/runtime/private-project/.env \
  -f /volume1/docker/hearth-v2/source/hearth/deploy/synology/runtime/private-project/docker-compose.yml \
  up -d

docker compose \
  --env-file /volume1/docker/hearth-v2/source/hearth/deploy/synology/runtime/private-project/.env \
  -f /volume1/docker/hearth-v2/source/hearth/deploy/synology/runtime/private-project/docker-compose.yml \
  ps
```

Expected checks:

- `GET /api/v1/health` reports process liveness.
- `GET /api/v1/readiness` reports database and migration readiness.
- the private origin displays adult/household first-use setup, creates a named passkey and never
  seeds Ezra or Maya.
- stopping the service sends `SIGTERM` and closes Fastify/SQLite cleanly within 30 seconds.
- Admin → Photos accepts adult multi-select phone uploads, reports added/duplicate/failed counts and
  never reveals a client filename or storage path. If the optional folder is configured, **Check
  folder** creates an adult audit event and an import outage does not block managed uploads.
- Admin → Connections can test and save Home Assistant without returning the token, URL or raw
  entity IDs to the browser, SQLite, receipts or audit summaries.
- Admin → System Health reports migration, version and recovery-copy state; “Create backup now”
  creates an adult audit event and the chosen copy passes the clean-location restore command above.

Before relying on the appliance, complete real-device passkey enrolment, a second-adult recovery
path, encrypted off-device backup, an actual restore drill and a focused security review. The
private origin, certificate, service identity, data folders and network allowlist must be
commissioned before entering household or provider data.
