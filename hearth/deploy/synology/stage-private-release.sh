#!/bin/sh

set -eu

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <verified-git-commit>" >&2
  exit 64
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(git -C "$script_dir" rev-parse --show-toplevel)
requested_ref=$1
release_commit=$(git -C "$repo_root" rev-parse --verify "${requested_ref}^{commit}")
release_version=$(printf '%s' "$release_commit" | cut -c1-12)

deploy_target=${HEARTH_DEPLOY_SSH_TARGET:-hearth-synology}
deploy_hostname=${HEARTH_DEPLOY_SSH_HOSTNAME:-}
remote_root=/volume1/docker/hearth-v2
remote_source="$remote_root/source"
remote_runtime="$remote_source/hearth/deploy/synology/runtime/private-project"
remote_staging="$remote_root/staging/$release_commit"

archive_dir=$(mktemp -d "${TMPDIR:-/tmp}/hearth-release.XXXXXX")
cleanup() {
  rm -rf -- "$archive_dir"
}
trap cleanup EXIT HUP INT TERM

git -C "$repo_root" archive "$release_commit" | tar -x -C "$archive_dir"

run_ssh() {
  if [ -n "$deploy_hostname" ]; then
    ssh -o "Hostname=$deploy_hostname" "$deploy_target" "$@"
  else
    ssh "$deploy_target" "$@"
  fi
}

if [ -n "$deploy_hostname" ]; then
  case "$deploy_hostname" in
    *[!A-Za-z0-9.-]*)
      echo "HEARTH_DEPLOY_SSH_HOSTNAME contains unsupported characters." >&2
      exit 64
      ;;
  esac
  rsync_ssh="ssh -o Hostname=$deploy_hostname"
else
  rsync_ssh=ssh
fi

run_ssh \
  "test -f '$remote_runtime/docker-compose.yml' && test -f '$remote_runtime/.env' && mkdir -p '$remote_staging'"

rsync -a --delete --delay-updates --rsync-path=/usr/bin/rsync \
  -e "$rsync_ssh" \
  "$archive_dir/" "$deploy_target:$remote_staging/"

run_ssh /bin/sh <<EOF
set -eu
test -d '$remote_staging'
test -d '$remote_runtime'
test "\$(grep -c '^HEARTH_VERSION=' '$remote_runtime/.env')" -eq 1
rsync -a --delete --delay-updates \
  --exclude '/hearth/deploy/synology/runtime/' \
  '$remote_staging/' '$remote_source/'
sed -i.bak 's/^HEARTH_VERSION=.*/HEARTH_VERSION=$release_version/' '$remote_runtime/.env'
rm -f -- '$remote_runtime/.env.bak'
rm -rf -- '$remote_staging'
printf '%s\n' '$release_commit' > '$remote_root/staged-source-version'
EOF

printf 'Staged Hearth %s on Synology.\n' "$release_version"
printf 'Next: in DSM Container Manager, select project hearth-v2 and choose Action -> Build.\n'
printf 'After it is healthy, verify /api/v1/readiness and /api/v1/runtime at the private origin.\n'
