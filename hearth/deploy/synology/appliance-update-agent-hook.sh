#!/bin/sh

set -eu

agent=/usr/local/sbin/hearth-v2-update-agent
pid_file=/var/run/hearth-v2-update-agent.pid
log_file=/var/log/hearth-v2-update-agent.log
status_file=/volume1/docker/hearth-v2/update-agent/status.json

running() {
  test -r "$pid_file" || return 1
  pid=$(sed -n '1p' "$pid_file")
  case "$pid" in
    ''|*[!0-9]*) return 1 ;;
  esac
  kill -0 "$pid" 2>/dev/null || return 1
  test -r "/proc/$pid/cmdline" || return 1
  tr '\000' '\n' < "/proc/$pid/cmdline" | grep -Fx "$agent" >/dev/null
}

ready() {
  running && test -s "$status_file"
}

case "${1:-}" in
  start)
    if ready; then
      exit 0
    fi
    if running; then
      kill "$(sed -n '1p' "$pid_file")" 2>/dev/null || true
    fi
    rm -f -- "$pid_file"
    rm -f -- "$status_file"
    : > "$log_file"
    chmod 0600 "$log_file"
    nohup "$agent" >> "$log_file" 2>&1 </dev/null &
    printf '%s\n' "$!" > "$pid_file"
    chmod 0600 "$pid_file"
    attempt=0
    while [ "$attempt" -lt 5 ]; do
      if ready; then
        exit 0
      fi
      if ! running; then
        break
      fi
      attempt=$((attempt + 1))
      sleep 1
    done
    if running; then
      kill "$(sed -n '1p' "$pid_file")" 2>/dev/null || true
    fi
    rm -f -- "$pid_file" "$status_file"
    echo 'Hearth update agent did not become ready.' >&2
    if test -s "$log_file"; then
      tail -n 12 "$log_file" >&2
    fi
    exit 1
    ;;
  stop)
    if running; then
      kill "$(sed -n '1p' "$pid_file")"
    fi
    rm -f -- "$pid_file" "$status_file"
    ;;
  status)
    ready
    ;;
  restart)
    "$0" stop
    "$0" start
    ;;
  *)
    echo 'Usage: hearth-v2-update-agent-hook.sh start|stop|status|restart' >&2
    exit 64
    ;;
esac
