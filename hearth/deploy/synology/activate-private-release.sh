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
remote_activation_helper=/usr/local/sbin/hearth-v2-activate-staged

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

"$script_dir/stage-private-release.sh" "$release_commit"

printf 'Pulling verified images before replacing the running containers.\n'
if ! run_ssh "sudo -n '$remote_activation_helper' --check"; then
  printf 'The Hearth-only Synology release helper is not installed.\n' >&2
  printf 'Run hearth/deploy/synology/install-release-helper.sh once in a visible terminal.\n' >&2
  exit 77
fi
run_ssh "sudo -n '$remote_activation_helper'"

printf 'Hearth %s is ready on Synology.\n' "$release_commit"
