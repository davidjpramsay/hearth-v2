#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
deploy_target=${HEARTH_DEPLOY_SSH_TARGET:-hearth-synology}
deploy_hostname=${HEARTH_DEPLOY_SSH_HOSTNAME:-}
remote_installer=/volume1/docker/hearth-v2/release-helper-installer

if [ -n "$deploy_hostname" ]; then
  case "$deploy_hostname" in
    *[!A-Za-z0-9.-]*)
      echo 'HEARTH_DEPLOY_SSH_HOSTNAME contains unsupported characters.' >&2
      exit 64
      ;;
  esac
  rsync_ssh="ssh -o Hostname=$deploy_hostname"
else
  rsync_ssh=ssh
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

run_ssh "mkdir -p '$remote_installer' && chmod 0700 '$remote_installer'"
rsync -a --delete --delay-updates --rsync-path=/usr/bin/rsync \
  -e "$rsync_ssh" \
  "$script_dir/activate-staged-release-on-nas.sh" \
  "$script_dir/appliance-update-agent-hook.sh" \
  "$script_dir/appliance-update-agent-on-nas.sh" \
  "$script_dir/install-release-helper-on-nas.sh" \
  "$script_dir/compose.yaml" \
  "$script_dir/ensure-docker-firewall.sh" \
  "$deploy_target:$remote_installer/"

printf 'One final Synology administrator password is required.\n'
printf 'A genuine sudo prompt echoes no characters while you type.\n'
run_ssh_tty "sudo '$remote_installer/install-release-helper-on-nas.sh'"
run_ssh "sudo -n /usr/local/sbin/hearth-v2-activate-staged --check"

printf 'The non-interactive Hearth release helper is ready.\n'
