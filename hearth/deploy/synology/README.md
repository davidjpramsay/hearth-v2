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

`compose.demo.yaml` is a separate, LAN-only pilot for television layout and remote testing before
private HTTPS is commissioned. It contains fictional data, accepts no provider credentials, mounts
no household photo folder and deliberately exposes the web container only on the exact Synology LAN
address supplied in `.env.demo`. Do not add a DSM public reverse proxy or router port-forward for the
demo pilot, and never enter real family information into it.

## Local validation

From `hearth/`:

```sh
docker compose \
  --env-file deploy/synology/.env.example \
  -f deploy/synology/compose.yaml \
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

Before any approved Synology commissioning:

1. Copy `.env.example` to an access-restricted `.env` outside source control.
2. Replace `HEARTH_VERSION` with the exact tested release or commit identifier.
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
   openssl rand -base64 32 > /volume1/docker/hearth-v2/secrets/first-use-code
   ```

   Read that code locally during first setup; do not place it in Compose, Git, chat or a URL. Hearth
   consumes the file after the first adult passkey and household are created.

9. Configure DSM Reverse Proxy from that HTTPS origin to `http://127.0.0.1:8432`, preserving `Host`
   and `X-Forwarded-Proto`. Do not create a router port-forward or public DNS exposure.

10. For family photos, first create or approve one dedicated Synology folder. Only after that
    explicit selection, uncomment the `/photos-source:ro` volume in `compose.yaml`, set
    `HEARTH_PHOTO_HOST_DIR` to the exact host folder and set
    `HEARTH_PHOTO_SOURCE_DIR=/photos-source`. The server ignores symlinks, creates orientation-
    corrected WebP display copies and thumbnails under `/data/photo-derivatives`, and returns only
    opaque asset URLs. It never sends the mounted path or original bytes to the browser. Leave
    `HEARTH_PHOTO_SOURCE_DIR` blank to keep Photos safely unconfigured.

11. Leave Home Assistant unconfigured until its current backup and rollback path are verified. An
    adult can then use **More → Connections → Home Assistant** to test the private root address and
    a dedicated long-lived access token, and map exactly four safety states plus Evening,
    Goodnight and Screen off. The browser receives only opaque choices and friendly labels; the
    resulting URL, token and raw entity IDs remain in `/run/hearth-secrets/home-assistant.json`.

12. Keep `HEARTH_BACKUP_RETENTION=14` and `HEARTH_BACKUP_INTERVAL_HOURS=24` initially. The server
    writes consistent SQLite online backups under `/data/backups`; this directory is already inside
    the restricted data mount. Configure encrypted Synology Hyper Backup for the host data and
    secrets directories so a NAS-volume failure does not remove both the live database and every
    local copy. The Hearth backup button does not copy provider secrets, photo originals or the
    separate Home Assistant appliance.

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
scenario controls to the local network, so it must stay fictional and LAN-only. It may remain
available alongside the commissioned private instance only when all of the following stay
separate: Compose project name, host port, database/data directory, secrets directory and photo
mount. The private web service remains loopback-only behind DSM HTTPS; the demo remains bound only
to the exact LAN address and must never receive household information or provider credentials.

## Backup verification and clean-location restore

The Admin **System Health** page reports only safe database, backup and version state. An adult may
request a new online copy there. It never exposes a filename or downloadable household database.

From a restricted Synology administrator shell, choose one retained file and verify it inside the
server image:

```sh
docker compose --env-file /volume1/docker/hearth-v2/env/hearth.env \
  -f /volume1/docker/hearth-v2/compose.yaml exec server \
  node dist/recovery-cli.js verify /data/backups/<backup-file>.sqlite
```

For the required drill, restore to a new location only:

```sh
docker compose --env-file /volume1/docker/hearth-v2/env/hearth.env \
  -f /volume1/docker/hearth-v2/compose.yaml exec server \
  node dist/recovery-cli.js restore /data/backups/<backup-file>.sqlite \
  /data/restore-drill/hearth.sqlite
```

The tool verifies the source and restored database and refuses to overwrite any existing
destination or restore work file. Confirm the migration version and inspect the isolated database
before considering a live swap. Replacing the active database requires a stopped server,
preservation of the current file and explicit approval; it is deliberately not an Admin button.

## Start and inspect

Only after explicit approval to change the live Synology:

```sh
docker compose --env-file /volume1/docker/hearth-v2/env/hearth.env \
  -f /volume1/docker/hearth-v2/compose.yaml up -d

docker compose --env-file /volume1/docker/hearth-v2/env/hearth.env \
  -f /volume1/docker/hearth-v2/compose.yaml ps
```

Expected checks:

- `GET /api/v1/health` reports process liveness.
- `GET /api/v1/readiness` reports database and migration readiness.
- the private origin displays adult/household first-use setup, creates a named passkey and never
  seeds Ezra or Maya.
- stopping the service sends `SIGTERM` and closes Fastify/SQLite cleanly within 30 seconds.
- Admin → Photos reports the approved folder index without revealing its path; “Scan now” creates
  an adult audit event and the gallery keeps its last safe derivatives if the NAS is temporarily
  unavailable.
- Admin → Connections can test and save Home Assistant without returning the token, URL or raw
  entity IDs to the browser, SQLite, receipts or audit summaries.
- Admin → System Health reports migration, version and recovery-copy state; “Create backup now”
  creates an adult audit event and the chosen copy passes the clean-location restore command above.

Do not enter real family or provider data yet. Real-device passkey enrolment, a second-adult recovery
path, the exact HTTPS origin, encrypted off-device backup, an actual restore drill and a focused
security review remain required before household use.
