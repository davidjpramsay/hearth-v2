#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
environment_file="$script_dir/.env.example"
production_config=$(mktemp "${TMPDIR:-/tmp}/hearth-production-compose.XXXXXX")
fallback_config=$(mktemp "${TMPDIR:-/tmp}/hearth-fallback-compose.XXXXXX")

cleanup() {
  rm -f -- "$production_config" "$fallback_config"
}
trap cleanup EXIT HUP INT TERM

sh -n "$script_dir/stage-private-release.sh"
sh -n "$script_dir/activate-private-release.sh"
sh -n "$script_dir/activate-staged-release-on-nas.sh"
sh -n "$script_dir/appliance-update-agent-hook.sh"
sh -n "$script_dir/appliance-update-agent-on-nas.sh"
sh -n "$script_dir/ensure-docker-firewall.sh"
sh -n "$script_dir/install-release-helper-on-nas.sh"
sh -n "$script_dir/install-release-helper.sh"

grep -q 'test -s "$status_file"' "$script_dir/appliance-update-agent-hook.sh"
grep -q '/proc/$pid/cmdline' "$script_dir/appliance-update-agent-hook.sh"
grep -q 'stop_agents' "$script_dir/appliance-update-agent-hook.sh"
grep -q 'agents_running' "$script_dir/appliance-update-agent-hook.sh"
grep -q 'printf.*"\$\$".*"\$pid_file"' "$script_dir/appliance-update-agent-on-nas.sh"
grep -q '"$update_hook" start' "$script_dir/activate-staged-release-on-nas.sh"

docker compose \
  --env-file "$environment_file" \
  --file "$script_dir/compose.yaml" \
  config > "$production_config"

if grep -q '^[[:space:]]*build:' "$production_config"; then
  echo 'Production Compose must not contain a local build definition.' >&2
  exit 1
fi

grep -q 'ghcr.io/davidjpramsay/hearth-v2-server:' "$production_config"
grep -q 'ghcr.io/davidjpramsay/hearth-v2-web:' "$production_config"

docker compose \
  --env-file "$environment_file" \
  --file "$script_dir/compose.yaml" \
  --file "$script_dir/compose.build.yaml" \
  config > "$fallback_config"

grep -q '^[[:space:]]*build:' "$fallback_config"

docker compose \
  --env-file "$script_dir/demo.env.example" \
  --file "$script_dir/compose.demo.yaml" \
  config --quiet

printf 'Synology deployment configuration is valid.\n'
