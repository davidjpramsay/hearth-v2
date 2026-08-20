#!/bin/sh

set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <verified-git-commit>" >&2
  exit 64
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
requested_ref=$1
release_commit=$(git -C "$script_dir" rev-parse --verify "${requested_ref}^{commit}")

deploy_target=${HEARTH_DEPLOY_SSH_TARGET:-hearth-synology}
deploy_hostname=${HEARTH_DEPLOY_SSH_HOSTNAME:-}
remote_runtime=/volume1/docker/hearth-v2/source/hearth/deploy/synology/runtime/private-project
remote_project="$remote_runtime/docker-compose.yml"
remote_environment="$remote_runtime/.env"
remote_compose=/var/packages/ContainerManager/target/usr/bin/docker-compose

if [ -n "$deploy_hostname" ]; then
  case "$deploy_hostname" in
    *[!A-Za-z0-9.-]*)
      echo "HEARTH_DEPLOY_SSH_HOSTNAME contains unsupported characters." >&2
      exit 64
      ;;
  esac
fi

run_ssh() {
  if [ -n "$deploy_hostname" ]; then
    ssh -o "Hostname=$deploy_hostname" "$deploy_target" "$@"
  else
    ssh "$deploy_target" "$@"
  fi
}

run_ssh_tty() {
  if [ -n "$deploy_hostname" ]; then
    ssh -t -o "Hostname=$deploy_hostname" "$deploy_target" "$@"
  else
    ssh -t "$deploy_target" "$@"
  fi
}

"$script_dir/stage-private-release.sh" "$release_commit"

printf 'Pulling verified images before replacing the running containers.\n'
printf 'Synology may ask for the administrator password; it is not stored by Hearth.\n'
run_ssh_tty \
  "sudo env HEARTH_VERSION='$release_commit' '$remote_compose' --env-file '$remote_environment' --file '$remote_project' pull && sudo env HEARTH_VERSION='$release_commit' '$remote_compose' --env-file '$remote_environment' --file '$remote_project' up -d --remove-orphans && sudo env HEARTH_VERSION='$release_commit' '$remote_compose' --env-file '$remote_environment' --file '$remote_project' ps"

run_ssh /bin/sh <<EOF
set -eu
port=\$(sed -n 's/^HEARTH_HTTP_PORT=//p' '$remote_environment')
case "\$port" in
  ''|*[!0-9]*)
    echo 'HEARTH_HTTP_PORT must be a numeric value.' >&2
    exit 1
    ;;
esac
attempt=0
while [ "\$attempt" -lt 30 ]; do
  if response=\$(curl --fail --silent --show-error "http://127.0.0.1:\$port/api/v1/readiness" 2>/dev/null); then
    if printf '%s' "\$response" | grep -q '"status":"ready"'; then
      printf '%s\n' "\$response"
      exit 0
    fi
  fi
  attempt=\$((attempt + 1))
  sleep 2
done
echo 'Hearth did not become ready within 60 seconds.' >&2
exit 1
EOF

run_ssh /bin/sh <<EOF
set -eu
current_version=\$(sed -n 's/^HEARTH_VERSION=//p' '$remote_environment')
if [ -n "\$current_version" ] && [ "\$current_version" != '$release_commit' ]; then
  printf '%s\n' "\$current_version" > '/volume1/docker/hearth-v2/previous-source-version'
fi
sed -i.bak 's/^HEARTH_VERSION=.*/HEARTH_VERSION=$release_commit/' '$remote_environment'
rm -f -- '$remote_environment.bak'
printf '%s\n' '$release_commit' > '/volume1/docker/hearth-v2/active-source-version'
rm -f -- '/volume1/docker/hearth-v2/staged-source-version'
EOF

printf 'Hearth %s is ready on Synology.\n' "$release_commit"
