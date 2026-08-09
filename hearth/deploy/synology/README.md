# Synology deployment scaffold

This directory builds Hearth as two small, same-origin containers:

- `server`: the private Fastify service and SQLite database owner
- `web`: the static React application and `/api` reverse proxy

The web container binds only to Synology loopback. DSM Reverse Proxy must provide the stable private
HTTPS origin required by adult passkeys and the television release app. The repository deliberately
does not choose or create the household hostname, certificate, router rule or live Synology folders.
nginx is the single trusted HTTP proxy hop; Fastify uses that boundary for client-address rate
limiting rather than accepting arbitrary forwarding chains.

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
5. Keep the calendar secret directory writable by the server because approved companion setup uses
   an atomic `0600` write. Never place the resulting JSON in Compose, Git, an image or a command line.
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

The hostname and certificate mechanism are intentionally unresolved deployment inputs. The passkey
contract is implemented, but enrolment remains inert until those values and the first-use code file
are supplied. Changing the WebAuthn relying-party origin later invalidates the intended trust
boundary.

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

Do not enter real family or provider data yet. Real-device passkey enrolment, a second-adult recovery
path, online backup/restore tooling, the exact HTTPS origin and a focused security review remain
required before household use.
