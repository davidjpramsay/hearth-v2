# Synology deployment

Hearth runs as two pull-only containers:

- `server` — private Fastify service and SQLite owner
- `web` — static React app and same-origin `/api` proxy

The web port binds to Synology loopback. DSM Reverse Proxy supplies the stable private HTTPS origin
used by passkeys and the TV app. Hearth is LAN/Tailscale-first; do not add router port forwarding or
public exposure.

## Private data

Keep source and household state separate:

```text
/volume1/docker/hearth-v2/source/hearth/deploy/synology/runtime/private-project/
  docker-compose.yml
  .env
/volume1/hearth-v2-private/
  data/
  secrets/
```

Never copy the private directory, credentials or photos into Git, images, commands, chat or another
household. Calendar, Home Assistant and ESV secrets remain external files. Managed photos and
SQLite backups live under the restricted data directory.

## Validate locally

From `hearth/`:

```sh
docker compose --env-file deploy/synology/.env.example   -f deploy/synology/compose.yaml config

docker build --target server -f deploy/synology/Dockerfile -t hearth-v2-server:local .
docker build --target web -f deploy/synology/Dockerfile -t hearth-v2-web:local .
```

Images run as non-root with read-only root filesystems, dropped capabilities and bounded logs.
Forward-only SQL migrations run at server startup.

## Commission once

Before entering household data:

1. Create the dedicated non-root service account, private folders and exact DSM permissions.
2. Configure the stable private hostname, trusted certificate and DSM Reverse Proxy.
3. Set `HEARTH_AUTH_RP_ID` and `HEARTH_AUTH_ORIGIN` to that exact hostname/origin.
4. Create the one-use `first-use-code` file inside the restricted secrets directory.
5. Configure only approved optional provider files and one narrow read-only photo import folder.
6. Install the fixed Hearth release helper from an owner-controlled terminal:

   ```sh
   hearth/deploy/synology/install-release-helper.sh
   ```

The helper grants passwordless access only to the fixed Hearth activation command. It also installs
the one-shot Docker firewall hook required by the hardened Synology network. It is not a watchdog
and does not grant a root shell.

Detailed commissioning, firewall and recovery requirements are authoritative in
[`../../../docs/hearth-v2/OPERATIONS.md`](../../../docs/hearth-v2/OPERATIONS.md).

## Release

Only deploy a full commit whose hosted verification and GHCR images are complete:

```sh
hearth/deploy/synology/activate-private-release.sh <full-verified-commit>
```

Use `HEARTH_DEPLOY_SSH_HOSTNAME=<tailscale-or-lan-host>` only when the saved SSH alias needs an
explicit host override. Activation stages the exact revision, pulls both images before replacement,
runs the fixed helper, waits for readiness and preserves the previous image version for rollback.
The Synology does not compile ordinary releases.

Verify both internal state and the private origin:

```sh
curl --fail --silent --show-error https://<private-origin>/api/v1/readiness
curl --fail --silent --show-error https://<private-origin>/api/v1/runtime
curl --fail --silent --show-error https://<private-origin>/api/v1/health
```

A source build is a slow, explicit recovery fallback only. Do not deploy an uncommitted tree, use
Container Manager **Build**, follow an unverified branch or leave temporary root tasks behind.

## Backup and recovery

Hearth creates integrity-checked SQLite backups under the private data directory. Synology Hyper
Backup must also protect the complete data and secrets directories because SQLite copies do not
include photos or provider files.

Use the built server recovery command to verify a retained copy and restore only to a new location:

```sh
node apps/server/dist/recovery-cli.js verify /absolute/path/to/backup.sqlite
node apps/server/dist/recovery-cli.js restore /absolute/path/to/backup.sqlite   /absolute/new/location/hearth.sqlite
```

Replacing the active database requires a stopped server, preservation of the current file and
explicit approval.
