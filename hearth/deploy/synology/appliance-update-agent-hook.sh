#!/bin/sh

set -eu

agent=/usr/local/sbin/hearth-v2-update-agent
pid_file=/var/run/hearth-v2-update-agent.pid
log_file=/var/log/hearth-v2-update-agent.log

running() {
  test -r "$pid_file" || return 1
  pid=$(sed -n '1p' "$pid_file")
  case "$pid" in
    ''|*[!0-9]*) return 1 ;;
  esac
  kill -0 "$pid" 2>/dev/null
}

case "${1:-}" in
  start)
    if running; then
      exit 0
    fi
    rm -f -- "$pid_file"
    : > "$log_file"
    chmod 0600 "$log_file"
    nohup "$agent" >> "$log_file" 2>&1 </dev/null &
    printf '%s\n' "$!" > "$pid_file"
    chmod 0600 "$pid_file"
    ;;
  stop)
    if running; then
      kill "$(sed -n '1p' "$pid_file")"
    fi
    rm -f -- "$pid_file"
    ;;
  status)
    running
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
