#!/bin/sh
# Entry point of the browser container (backend.md 1.6). Every outgoing connection to a non-public address is
# refused here, at the network layer, so a test cannot reach Postgres, the backend, or the host however its page
# gets there: a redirect, DNS rebinding, or a direct address. The ranges match NON_PUBLIC_RANGES in
# src/core/browser/network.ts. The backend's connection to the server is incoming, so its replies still flow.
set -eu

IPV4_RANGES="
0.0.0.0/8
10.0.0.0/8
100.64.0.0/10
127.0.0.0/8
169.254.0.0/16
172.16.0.0/12
192.168.0.0/16
224.0.0.0/4
240.0.0.0/4
"
# ::ffff:0:0/96 covers IPv4-mapped addresses, which network.ts checks as their IPv4 address.
IPV6_RANGES="
::/128
::1/128
fc00::/7
fe80::/10
ff00::/8
::ffff:0:0/96
"

firewall() {
  tables=$1
  ranges=$2
  # Loopback stays open for the server itself and Docker's DNS resolver at 127.0.0.11.
  "$tables" -A OUTPUT -o lo -j ACCEPT
  "$tables" -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  for range in $ranges; do "$tables" -A OUTPUT -d "$range" -j REJECT; done
}
firewall iptables "$IPV4_RANGES"
firewall ip6tables "$IPV6_RANGES"

# Chromium runs without root or any capability, so it cannot change the rules above.
exec setpriv --reuid=pwuser --regid=pwuser --init-groups --inh-caps=-all --bounding-set=-all \
  playwright run-server --port 3000 --host 0.0.0.0
