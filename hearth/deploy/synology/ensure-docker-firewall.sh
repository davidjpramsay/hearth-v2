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
  subnet=$(
    "$docker_bin" network inspect "$network_name" \
      --format '{{(index .IPAM.Config 0).Subnet}}' 2>/dev/null || true
  )
  case "$subnet" in
    ''|*[!0-9./]*)
      echo 'Hearth Docker network could not be identified.' >&2
      exit 1
      ;;
  esac
  if "$iptables_bin" -w 2 -C FORWARD_FIREWALL -s "$subnet" -d "$subnet" -j RETURN 2>/dev/null; then
    echo "Hearth Docker bridge forwarding rule is installed for $subnet."
    exit 0
  fi
  echo "Hearth Docker bridge forwarding rule is missing for $subnet." >&2
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
      # Never bypass the forwarding firewall for every Docker network. Hearth
      # only needs its own bridge traffic and DNS lookups to leave the chain.
      delete_rule_if_present -i 'docker+' -j RETURN
      delete_rule_if_present -s "$subnet" -d "$subnet" -j RETURN
      if [ -n "$dns_server" ]; then
        delete_rule_if_present -s "$subnet" -d "$dns_server" -p tcp --dport 53 -j RETURN
        delete_rule_if_present -s "$subnet" -d "$dns_server" -p udp --dport 53 -j RETURN
      fi
      "$iptables_bin" -w 2 -I FORWARD_FIREWALL 3 -s "$subnet" -d "$subnet" -j RETURN
      if [ -n "$dns_server" ]; then
        "$iptables_bin" -w 2 -I FORWARD_FIREWALL 3 -s "$subnet" -d "$dns_server" -p tcp --dport 53 -j RETURN
        "$iptables_bin" -w 2 -I FORWARD_FIREWALL 3 -s "$subnet" -d "$dns_server" -p udp --dport 53 -j RETURN
      fi
    fi
  exit 0
fi

echo 'Synology forwarding firewall is not active; no Docker-origin rule is required.'
