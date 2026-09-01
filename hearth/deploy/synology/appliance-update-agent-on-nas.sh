#!/bin/sh

set -eu

PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH

release_root=/volume1/docker/hearth-v2
control_root="$release_root/update-agent"
command_fifo="$control_root/commands"
status_file="$control_root/status.json"
staged_version="$release_root/staged-source-version"
environment=/usr/local/etc/hearth-v2/.env
activation_helper=/usr/local/sbin/hearth-v2-activate-staged
pid_file=/var/run/hearth-v2-update-agent.pid

cleanup() {
  if [ -r "$pid_file" ] && [ "$(sed -n '1p' "$pid_file")" = "$$" ]; then
    rm -f -- "$pid_file"
  fi
}
trap 'exit 0' HUP INT TERM
trap cleanup EXIT

service_uid=$(sed -n 's/^HEARTH_UID=//p' "$environment")
service_gid=$(sed -n 's/^HEARTH_GID=//p' "$environment")
case "$service_uid:$service_gid" in
  *[!0-9:]*|:|*:|:*:*)
    echo 'Hearth service UID and GID are not configured.' >&2
    exit 1
    ;;
esac

storage_state=ready
storage_message='Storage check passed.'
refresh_storage() {
  free_kb=$(df -Pk "$release_root" | awk 'NR == 2 { print $4 }')
  case "$free_kb" in
    ''|*[!0-9]*)
      storage_state=attention
      storage_message='Storage could not be checked.'
      ;;
    *)
      if [ "$free_kb" -lt 1048576 ]; then
        storage_state=attention
        storage_message='Free at least 1 GB before updating.'
      else
        storage_state=ready
        storage_message='Storage check passed.'
      fi
      ;;
  esac
}

write_status() {
  phase=$1
  progress=$2
  message=$3
  target=$4
  started=$5
  completed=$6
  request=$7
  temporary="$status_file.tmp.$$"
  printf '{"requestId":%s,"phase":"%s","progress":%s,"message":"%s","targetVersion":%s,"startedAt":%s,"completedAt":%s,"storage":{"state":"%s","message":"%s"}}\n' \
    "$request" "$phase" "$progress" "$message" "$target" "$started" "$completed" \
    "$storage_state" "$storage_message" > "$temporary"
  chown "root:$service_gid" "$temporary"
  chmod 0640 "$temporary"
  mv -f "$temporary" "$status_file"
}

refresh_storage
printf '%s\n' "$$" > "$pid_file"
chmod 0600 "$pid_file"
write_status idle 0 'Ready to install a verified update.' null null null null

while :; do
  while IFS= read -r line; do
    set -- $line
    if [ "$#" -ne 2 ]; then
      continue
    fi
    request_id=$1
    release_commit=$2
    case "$request_id" in
      [a-z][a-z0-9_-]*) ;;
      *) continue ;;
    esac
    if [ "${#request_id}" -gt 96 ]; then
      continue
    fi
    if [ "${#release_commit}" -ne 40 ] || \
      [ -n "$(printf '%s' "$release_commit" | tr -d '0123456789abcdef')" ]; then
      continue
    fi

    started=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    quoted_target="\"$release_commit\""
    quoted_request="\"$request_id\""
    quoted_started="\"$started\""
    write_status queued 10 'Update queued.' "$quoted_target" \
      "$quoted_started" null "$quoted_request"
    refresh_storage
    if [ "$storage_state" != ready ]; then
      completed=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
      write_status failed 0 'Update stopped before installation.' "$quoted_target" \
        "$quoted_started" "\"$completed\"" "$quoted_request"
      continue
    fi

    write_status installing 35 'Downloading and installing the verified release.' \
      "$quoted_target" "$quoted_started" null "$quoted_request"
    staged_tmp="$staged_version.tmp.$$"
    printf '%s\n' "$release_commit" > "$staged_tmp"
    chown root:root "$staged_tmp"
    chmod 0644 "$staged_tmp"
    mv -f "$staged_tmp" "$staged_version"

    if "$activation_helper"; then
      completed=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
      refresh_storage
      write_status succeeded 100 'Update installed and checked.' "$quoted_target" \
        "$quoted_started" "\"$completed\"" "$quoted_request"
    else
      completed=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
      refresh_storage
      write_status failed 100 'Update failed. The previous release was restored.' \
        "$quoted_target" "$quoted_started" "\"$completed\"" "$quoted_request"
    fi
  done < "$command_fifo"
done
