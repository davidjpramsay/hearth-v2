#!/bin/sh

set -eu

case "${1:-start}" in
  start)
    ;;
  *)
    exit 0
    ;;
esac

docker_bin=${HEARTH_DOCKER_BIN:-/var/packages/ContainerManager/target/usr/bin/docker}
iptables_bin=${HEARTH_IPTABLES_BIN:-/sbin/iptables}
network_name=${HEARTH_DOCKER_NETWORK:-hearth-v2_default}
attempt=0

while [ "$attempt" -lt 24 ]; do
  subnet=$(
    "$docker_bin" network inspect "$network_name" \
      --format '{{(index .IPAM.Config 0).Subnet}}' 2>/dev/null || true
  )

  case "$subnet" in
    ''|*[!0-9./]*)
      subnet=''
      ;;
  esac

  if [ -n "$subnet" ]; then
    if "$iptables_bin" -w 0 -S FORWARD_FIREWALL >/dev/null 2>&1; then
      if ! "$iptables_bin" -w 0 -C FORWARD_FIREWALL \
        -s "$subnet" -d "$subnet" -j RETURN 2>/dev/null; then
        "$iptables_bin" -w 0 -I FORWARD_FIREWALL 3 \
          -s "$subnet" -d "$subnet" -j RETURN
      fi

      dns_server=$(awk '$1 == "nameserver" && $2 ~ /^[0-9.]+$/ { print $2; exit }' /etc/resolv.conf)
      case "$dns_server" in
        ''|*[!0-9.]*)
          echo 'No IPv4 DNS server was found in /etc/resolv.conf.' >&2
          exit 1
          ;;
      esac

      for protocol in udp tcp; do
        if ! "$iptables_bin" -w 0 -C FORWARD_FIREWALL \
          -s "$subnet" -d "$dns_server" -p "$protocol" --dport 53 -j RETURN 2>/dev/null; then
          "$iptables_bin" -w 0 -I FORWARD_FIREWALL 3 \
            -s "$subnet" -d "$dns_server" -p "$protocol" --dport 53 -j RETURN
        fi
      done
      exit 0
    fi
  fi

  attempt=$((attempt + 1))
  sleep 5
done

echo "Hearth Docker network $network_name was not ready; firewall rule not installed." >&2
exit 1
