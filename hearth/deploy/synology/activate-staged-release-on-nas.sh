#!/bin/sh

set -eu

PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH

release_root=/volume1/docker/hearth-v2
staged_version="$release_root/staged-source-version"
active_version="$release_root/active-source-version"
previous_version="$release_root/previous-source-version"
config_root=/usr/local/etc/hearth-v2
project="$config_root/docker-compose.yml"
environment="$config_root/.env"
firewall_source="$config_root/ensure-docker-firewall.sh"
compose=/var/packages/ContainerManager/target/usr/bin/docker-compose
boot_hook=/usr/local/etc/rc.d/S99hearth-docker-firewall.sh
update_hook=/usr/local/etc/rc.d/S98hearth-v2-update-agent.sh

validate_installation() {
  test -x "$compose"
  test -x /usr/bin/sqlite3
  test -r "$project"
  test -r "$environment"
  test -r "$firewall_source"
  test -x "$boot_hook"
  test -x "$update_hook"
  test "$(grep -c '^HEARTH_VERSION=' "$environment")" -eq 1
  ! grep -q '^[[:space:]]*build:' "$project"
}

if [ "$#" -eq 1 ] && [ "$1" = '--check' ]; then
  validate_installation
  printf 'Hearth release helper is installed and ready.\n'
  exit 0
fi

if [ "$#" -ne 0 ]; then
  echo 'Usage: hearth-v2-activate-staged [--check]' >&2
  exit 64
fi

validate_installation
test -r "$staged_version"

release_commit=$(sed -n '1p' "$staged_version")
if [ "${#release_commit}" -ne 40 ] || [ -n "$(printf '%s' "$release_commit" | tr -d '0123456789abcdef')" ]; then
  echo 'The staged release must be a full lowercase Git commit hash.' >&2
  exit 64
fi

activation_environment="$config_root/.env.activation.$$"
rollback_directory="$release_root/update-rollbacks/$release_commit"
rollback_database="$rollback_directory/hearth.sqlite"
rollback_needed=0
server_stopped=0

wait_ready() {
  ready_environment=$1
  port=$(sed -n 's/^HEARTH_HTTP_PORT=//p' "$ready_environment")
  case "$port" in
    ''|*[!0-9]*) return 1 ;;
  esac
  attempt=0
  while [ "$attempt" -lt 30 ]; do
    if response=$(curl --fail --silent --show-error \
      "http://127.0.0.1:$port/api/v1/readiness" 2>/dev/null); then
      if printf '%s' "$response" | grep -q '"status":"ready"'; then
        printf '%s\n' "$response"
        return 0
      fi
    fi
    attempt=$((attempt + 1))
    sleep 2
  done
  return 1
}

restore_previous() {
  trap - EXIT HUP INT TERM
  if [ "$rollback_needed" -eq 1 ]; then
    printf 'New release failed. Restoring the previous Hearth release.\n' >&2
    "$compose" --env-file "$activation_environment" --file "$project" stop server >/dev/null 2>&1 || true
    data_directory=$(sed -n 's/^HEARTH_DATA_DIR=//p' "$environment")
    service_uid=$(sed -n 's/^HEARTH_UID=//p' "$environment")
    service_gid=$(sed -n 's/^HEARTH_GID=//p' "$environment")
    rm -f -- "$data_directory/hearth.sqlite-wal" "$data_directory/hearth.sqlite-shm"
    cp "$rollback_database" "$data_directory/hearth.sqlite"
    chown "$service_uid:$service_gid" "$data_directory/hearth.sqlite"
    chmod 0600 "$data_directory/hearth.sqlite"
    "$compose" --env-file "$environment" --file "$project" up -d --remove-orphans
    "$boot_hook" start
    "$update_hook" start || true
    if wait_ready "$environment"; then
      printf 'The previous Hearth release is ready again.\n' >&2
    else
      printf 'Automatic recovery also needs attention. Use the operator recovery runbook.\n' >&2
    fi
  elif [ "$server_stopped" -eq 1 ]; then
    "$compose" --env-file "$environment" --file "$project" up -d --remove-orphans || true
  fi
  rm -rf -- "$rollback_directory"
  rm -f -- "$activation_environment"
}

cleanup() {
  restore_previous
}
trap cleanup EXIT HUP INT TERM

sed "s/^HEARTH_VERSION=.*/HEARTH_VERSION=$release_commit/" \
  "$environment" > "$activation_environment"
chmod 0600 "$activation_environment"

HOME=/root
DOCKER_CONFIG=/root/.docker
export HOME DOCKER_CONFIG

printf 'Pulling verified Hearth %s images.\n' "$release_commit"
"$compose" --env-file "$activation_environment" --file "$project" pull

data_directory=$(sed -n 's/^HEARTH_DATA_DIR=//p' "$environment")
service_uid=$(sed -n 's/^HEARTH_UID=//p' "$environment")
service_gid=$(sed -n 's/^HEARTH_GID=//p' "$environment")
case "$data_directory" in
  /*) ;;
  *) echo 'HEARTH_DATA_DIR must be an absolute path.' >&2; exit 1 ;;
esac
case "$data_directory" in
  /|/volume1|/volume1/docker) echo 'HEARTH_DATA_DIR is too broad for safe recovery.' >&2; exit 1 ;;
esac
case "$service_uid:$service_gid" in
  *[!0-9:]*|:|*:|:*:*) echo 'HEARTH_UID and HEARTH_GID must be numeric.' >&2; exit 1 ;;
esac
test -f "$data_directory/hearth.sqlite"
rm -rf -- "$rollback_directory"
mkdir -p "$rollback_directory"
chmod 0700 "$rollback_directory"
"$compose" --env-file "$environment" --file "$project" stop server
server_stopped=1
checkpoint=$(/usr/bin/sqlite3 "$data_directory/hearth.sqlite" \
  'PRAGMA wal_checkpoint(TRUNCATE); PRAGMA quick_check;')
if [ "$(printf '%s\n' "$checkpoint" | tail -n 1)" != ok ]; then
  echo 'The pre-update database check failed.' >&2
  exit 1
fi
cp "$data_directory/hearth.sqlite" "$rollback_database"
chmod 0600 "$rollback_database"
rollback_needed=1

"$compose" --env-file "$activation_environment" --file "$project" up -d --remove-orphans
install -o root -g root -m 0755 "$firewall_source" "$boot_hook"
"$boot_hook" start
"$boot_hook" status
"$compose" --env-file "$activation_environment" --file "$project" ps

if ! wait_ready "$activation_environment"; then
  echo 'Hearth did not become ready within 60 seconds.' >&2
  exit 1
fi

"$update_hook" start
"$update_hook" status

current_version=$(sed -n 's/^HEARTH_VERSION=//p' "$environment")
if [ -n "$current_version" ] && [ "$current_version" != "$release_commit" ]; then
  printf '%s\n' "$current_version" > "$previous_version.tmp.$$"
  chmod 0644 "$previous_version.tmp.$$"
  mv -f "$previous_version.tmp.$$" "$previous_version"
fi

mv -f "$activation_environment" "$environment"
rollback_needed=0
server_stopped=0
trap - EXIT HUP INT TERM
printf '%s\n' "$release_commit" > "$active_version.tmp.$$"
chmod 0644 "$active_version.tmp.$$"
mv -f "$active_version.tmp.$$" "$active_version"
rm -f -- "$staged_version"
rm -rf -- "$rollback_directory"

printf 'Hearth %s is ready on Synology.\n' "$release_commit"
