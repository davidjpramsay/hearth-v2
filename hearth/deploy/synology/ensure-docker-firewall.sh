#!/bin/sh

set -eu

action=${1:-start}

docker_bin=${HEARTH_DOCKER_BIN:-/var/packages/ContainerManager/target/usr/bin/docker}
iptables_bin=${HEARTH_IPTABLES_BIN:-/sbin/iptables}
network_name=${HEARTH_DOCKER_NETWORK:-hearth-v2_default}

if [ "$action" = status ]; then
  if ! "$iptables_bin" -w 2 -S FORWARD_FIREWALL >/dev/null 2>&1; then
    echo 'Synology forwarding firewall is not active; no Docker-origin rule is required.'
    exit 0
  fi
  if "$iptables_bin" -w 2 -C FORWARD_FIREWALL -i 'docker+' -j RETURN 2>/dev/null; then
    echo 'Docker-origin forwarding rule is installed.'
    exit 0
  fi
  echo 'Docker-origin forwarding rule is missing.' >&2
  exit 1
fi

case "$action" in
  start|restart)
    ;;
  stop)
    exit 0
    ;;
  *)
    echo 'Usage: ensure-docker-firewall.sh [start|stop|restart|status]' >&2
    exit 64
    ;;
esac

delete_rule_if_present() {
  while "$iptables_bin" -w 2 -C FORWARD_FIREWALL "$@" 2>/dev/null; do
    "$iptables_bin" -w 2 -D FORWARD_FIREWALL "$@"
  done
}

if "$iptables_bin" -w 2 -S FORWARD_FIREWALL >/dev/null 2>&1; then
    if ! "$iptables_bin" -w 2 -C FORWARD_FIREWALL -i 'docker+' -j RETURN 2>/dev/null; then
      "$iptables_bin" -w 2 -I FORWARD_FIREWALL 3 -i 'docker+' -j RETURN
    fi

    subnet=$(
      "$docker_bin" network inspect "$network_name" \
        --format '{{(index .IPAM.Config 0).Subnet}}' 2>/dev/null || true
    )
    case "$subnet" in
      ''|*[!0-9./]*)
        subnet=''
        ;;
    esac

    dns_server=$(awk '$1 == "nameserver" && $2 ~ /^[0-9.]+$/ { print $2; exit }' /etc/resolv.conf)
    case "$dns_server" in
      ''|*[!0-9.]*)
        dns_server=''
        ;;
    esac

    if [ -n "$subnet" ]; then
      delete_rule_if_present -s "$subnet" -d "$subnet" -j RETURN
      if [ -n "$dns_server" ]; then
        delete_rule_if_present -s "$subnet" -d "$dns_server" -p tcp --dport 53 -j RETURN
        delete_rule_if_present -s "$subnet" -d "$dns_server" -p udp --dport 53 -j RETURN
      fi
    fi
  exit 0
fi

echo 'Synology forwarding firewall is not active; no Docker-origin rule is required.'
