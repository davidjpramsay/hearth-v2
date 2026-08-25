#!/bin/sh

set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo 'This one-time installer must run through sudo.' >&2
  exit 77
fi

deploy_user=${SUDO_USER:-}
case "$deploy_user" in
  ''|root|*[!A-Za-z0-9_.-]*)
    echo 'Unable to determine the unprivileged Synology deployment user.' >&2
    exit 77
    ;;
esac

installer_root=/volume1/docker/hearth-v2/release-helper-installer
source_runtime=/volume1/docker/hearth-v2/source/hearth/deploy/synology/runtime/private-project
helper_source="$installer_root/activate-staged-release-on-nas.sh"
compose_source="$installer_root/compose.yaml"
firewall_source="$installer_root/ensure-docker-firewall.sh"
config_root=/usr/local/etc/hearth-v2
helper_target=/usr/local/sbin/hearth-v2-activate-staged
sudoers_target=/etc/sudoers.d/hearth-v2-release

test -r "$helper_source"
test -r "$compose_source"
test -r "$firewall_source"
test -r "$source_runtime/.env"
test -x /usr/bin/sudo
! grep -q '^[[:space:]]*build:' "$compose_source"

install -d -o root -g root -m 0700 "$config_root"
install -o root -g root -m 0755 "$helper_source" "$helper_target"
install -o root -g root -m 0644 "$compose_source" "$config_root/docker-compose.yml"
install -o root -g root -m 0755 "$firewall_source" "$config_root/ensure-docker-firewall.sh"
install -o root -g root -m 0755 "$firewall_source" \
  /usr/local/etc/rc.d/S99hearth-docker-firewall.sh

if [ ! -e "$config_root/.env" ]; then
  install -o root -g root -m 0600 "$source_runtime/.env" "$config_root/.env"
fi

sudoers_candidate="$sudoers_target.candidate.$$"
cleanup() {
  rm -f -- "$sudoers_candidate"
}
trap cleanup EXIT HUP INT TERM

printf '%s ALL=(root) NOPASSWD: %s\n' "$deploy_user" "$helper_target" > "$sudoers_candidate"
chmod 0440 "$sudoers_candidate"
chown root:root "$sudoers_candidate"
mv -f "$sudoers_candidate" "$sudoers_target"

if ! /usr/bin/sudo -l -U "$deploy_user" 2>&1 | grep -Fq "$helper_target"; then
  rm -f -- "$sudoers_target"
  echo 'The installed sudo policy did not validate and was removed.' >&2
  exit 1
fi

"$helper_target" --check
/usr/local/etc/rc.d/S99hearth-docker-firewall.sh start
rm -rf -- "$installer_root"

printf 'Installed the Hearth-only release helper for %s.\n' "$deploy_user"
printf 'Future verified releases will not request the Synology password.\n'
