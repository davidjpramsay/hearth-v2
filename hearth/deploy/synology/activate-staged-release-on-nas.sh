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

validate_installation() {
  test -x "$compose"
  test -r "$project"
  test -r "$environment"
  test -r "$firewall_source"
  test -x "$boot_hook"
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
cleanup() {
  rm -f -- "$activation_environment"
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
"$compose" --env-file "$activation_environment" --file "$project" up -d --remove-orphans
install -o root -g root -m 0755 "$firewall_source" "$boot_hook"
"$boot_hook" start
"$boot_hook" status
"$compose" --env-file "$activation_environment" --file "$project" ps

port=$(sed -n 's/^HEARTH_HTTP_PORT=//p' "$activation_environment")
case "$port" in
  ''|*[!0-9]*)
    echo 'HEARTH_HTTP_PORT must be numeric.' >&2
    exit 1
    ;;
esac

attempt=0
while [ "$attempt" -lt 30 ]; do
  if response=$(curl --fail --silent --show-error "http://127.0.0.1:$port/api/v1/readiness" 2>/dev/null); then
    if printf '%s' "$response" | grep -q '"status":"ready"'; then
      printf '%s\n' "$response"
      break
    fi
  fi
  attempt=$((attempt + 1))
  sleep 2
done
if [ "$attempt" -ge 30 ]; then
  echo 'Hearth did not become ready within 60 seconds.' >&2
  exit 1
fi

current_version=$(sed -n 's/^HEARTH_VERSION=//p' "$environment")
if [ -n "$current_version" ] && [ "$current_version" != "$release_commit" ]; then
  printf '%s\n' "$current_version" > "$previous_version.tmp.$$"
  chmod 0644 "$previous_version.tmp.$$"
  mv -f "$previous_version.tmp.$$" "$previous_version"
fi

mv -f "$activation_environment" "$environment"
trap - EXIT HUP INT TERM
printf '%s\n' "$release_commit" > "$active_version.tmp.$$"
chmod 0644 "$active_version.tmp.$$"
mv -f "$active_version.tmp.$$" "$active_version"
rm -f -- "$staged_version"

printf 'Hearth %s is ready on Synology.\n' "$release_commit"
