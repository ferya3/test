#!/usr/bin/env bash
# Adds a Cloudflare backup path to the tunnel. Run on foreign server 1:
#
#   bash setup.sh DOMAIN          e.g. bash setup.sh example.com
#
# DNS first: f1.DOMAIN, f2.DOMAIN, ... proxied (orange cloud) to the foreign
# servers in the order of /etc/tun-peers (f1 = this server), SSL mode Full.
#
# What it builds:
#   foreign servers  a VLESS+WebSocket+TLS inbound on :2053, open to
#                    Cloudflare only, that may reach nothing but the local
#                    Reality port; f1 gets it in its config and pushes the
#                    config to the peers, the peers get the certificate and
#                    the firewall rule over SSH.
#   Iran server      xray-relay: 127.0.0.1:9443 -> Cloudflare -> whichever
#                    foreign server answers, added to HAProxy as a backup
#                    server, so it only carries traffic when every direct
#                    path is down. Users' links do not change: Reality still
#                    runs end to end, Cloudflare only carries it.
#
# Safe to re-run. Every Xray config is checked with `xray run -test` before
# it replaces the old one.
set -euo pipefail

DOMAIN="${1:-}"
CDN_PORT=2053
RELAY_PORT=9443
IRAN_SSH_PORT="${IRAN_SSH_PORT:-22}"
CFG=/usr/local/etc/xray/config.json
NEW=/usr/local/etc/xray/config.new.json
CRT=/usr/local/etc/xray/cdn.crt
KEY=/usr/local/etc/xray/cdn.key
SSHO=(-o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new)

die() { echo ">>> FAIL: $*" >&2; exit 1; }
step() { echo; echo "===== $*"; }

[ -n "$DOMAIN" ] || die "usage: bash setup.sh DOMAIN"
[ "$(id -u)" = 0 ] || die "run as root"
[ -s /root/tunnel.env ] || die "/root/tunnel.env not found: run this on foreign server 1"
# shellcheck disable=SC1091
. /root/tunnel.env
[ -n "${IRAN_IP:-}" ] && [ -n "${SNI:-}" ] || die "IRAN_IP or SNI is empty in /root/tunnel.env"
command -v jq >/dev/null || apt-get install -y -qq jq >/dev/null

PEERS=()
if [ -f /etc/tun-peers ]; then
    while read -r ip port; do
        [ -n "$ip" ] && [ "${ip:0:1}" != "#" ] && PEERS+=("$ip ${port:-22}")
    done < /etc/tun-peers
fi

step "SSH access"
ssh "${SSHO[@]}" -p "$IRAN_SSH_PORT" "root@$IRAN_IP" true \
    || die "no password-less SSH to the Iran server; run first: ssh-copy-id -p $IRAN_SSH_PORT root@$IRAN_IP"
echo "Iran server $IRAN_IP: ok"
for p in "${PEERS[@]}"; do
    read -r ip port <<< "$p"
    ssh "${SSHO[@]}" -p "$port" "root@$ip" true || die "no password-less SSH to peer $ip"
    echo "peer $ip: ok"
done

if ! grep -q '^CDN_UUID=' /root/tunnel.env; then
    { echo "CDN_UUID=$(xray uuid)"; echo "CDN_PATH=/$(openssl rand -hex 8)"; } >> /root/tunnel.env
fi
# shellcheck disable=SC1091
. /root/tunnel.env

step "Cloudflare address ranges"
CF_IPS="$(curl -fsSL -m 20 https://www.cloudflare.com/ips-v4 | tr -d '\r')" || die "could not download Cloudflare's IP list"
echo "$CF_IPS" | grep -qvE '^[0-9.]+/[0-9]+$' && die "Cloudflare's IP list looks wrong"
echo "$(echo "$CF_IPS" | wc -l) ranges"

# Certificate and firewall on every foreign server. Cloudflare in "Full" mode
# accepts a self-signed certificate.
PREP=$(cat <<EOF
set -e
u=\$(systemctl show xray -p User --value); u=\${u:-root}
if [ ! -s $CRT ]; then
    openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 3650 \
        -subj /CN=cdn -keyout $KEY -out $CRT 2>/dev/null
fi
chown "\$u" $KEY; chmod 600 $KEY; chmod 644 $CRT
for c in $(echo "$CF_IPS" | tr '\n' ' '); do ufw allow from "\$c" to any port $CDN_PORT proto tcp >/dev/null; done
echo "\$(hostname): certificate and firewall ready"
EOF
)
step "certificate and firewall on the foreign servers"
bash -c "$PREP"
for p in "${PEERS[@]}"; do
    read -r ip port <<< "$p"
    ssh "${SSHO[@]}" -p "$port" "root@$ip" bash -s <<< "$PREP"
done

step "Cloudflare inbound in the Xray config"
INBOUND=$(jq -n --arg id "$CDN_UUID" --arg path "$CDN_PATH" --argjson port "$CDN_PORT" \
    --arg crt "$CRT" --arg key "$KEY" '{
        tag: "cdn-in", listen: "0.0.0.0", port: $port, protocol: "vless",
        settings: {clients: [{id: $id, email: "cdn-relay"}], decryption: "none"},
        streamSettings: {
            network: "ws", security: "tls",
            tlsSettings: {alpn: ["http/1.1"], certificates: [{certificateFile: $crt, keyFile: $key}]},
            wsSettings: {path: $path}
        }}')
# The relay may only reach the local Reality port; these rules go first so the
# geoip:private block below them does not catch 127.0.0.1.
# The relay's health probe (see observatory below) needs one more destination.
RULES='[
  {"type":"field","inboundTag":["cdn-in"],"ip":["127.0.0.1"],"port":"443","outboundTag":"direct"},
  {"type":"field","inboundTag":["cdn-in"],"domain":["full:www.gstatic.com"],"outboundTag":"direct"},
  {"type":"field","inboundTag":["cdn-in"],"outboundTag":"block"}
]'
# The Reality inbound stays first: the panel edits the first VLESS inbound.
jq --argjson inb "$INBOUND" --argjson rules "$RULES" '
    .inbounds = ([.inbounds[] | select(.tag != "cdn-in")] + [$inb])
    | .routing.rules = ($rules + [(.routing.rules // [])[] | select((.inboundTag // []) != ["cdn-in"])])
' "$CFG" > "$NEW"
# Same layout the panel writes, so it does not see a change and restart Xray again.
python3 -c 'import json, sys; p = sys.argv[1]; d = json.load(open(p)); open(p, "w").write(json.dumps(d, indent=2) + "\n")' "$NEW"
jq -e '.outbounds[] | select(.tag == "direct")' "$NEW" >/dev/null || die "config has no outbound tagged direct"
jq -e '.outbounds[] | select(.tag == "block")' "$NEW" >/dev/null || die "config has no outbound tagged block"
xray run -test -c "$NEW" >/dev/null || { xray run -test -c "$NEW" | tail -3; rm -f "$NEW"; die "Xray rejected the new config"; }

# Keep the panel from rewriting the config halfway through.
panel=0
systemctl is-active --quiet tunpanel 2>/dev/null && { panel=1; systemctl stop tunpanel; }
if cmp -s "$NEW" "$CFG"; then
    rm -f "$NEW"; echo "already in place"
else
    mv "$NEW" "$CFG"; systemctl restart xray; sleep 2
    systemctl is-active --quiet xray || { journalctl -u xray -n 10 --no-pager -o cat; die "xray did not start"; }
    echo "$(hostname): xray restarted with the Cloudflare inbound"
fi
for p in "${PEERS[@]}"; do
    read -r ip port <<< "$p"
    ssh "${SSHO[@]}" -p "$port" "root@$ip" \
        "cat > $NEW && xray run -test -c $NEW >/dev/null && mv $NEW $CFG && systemctl restart xray && echo \"\$(hostname): config synced\"" \
        < "$CFG" || die "could not push the config to $ip"
done
[ "$panel" = 1 ] && systemctl start tunpanel
ss -tln | grep -q ":$CDN_PORT " || die "nothing listens on :$CDN_PORT"

step "relay on the Iran server"
# Outbound i goes to f<i>.DOMAIN; f1 is this server, the rest follow /etc/tun-peers.
# IPv4 only: Cloudflare publishes AAAA records too, and an Iran server with an
# IPv6 address but no working IPv6 route hangs on them instead of falling back.
OUTBOUNDS=$(for i in $(seq 1 $((${#PEERS[@]} + 1))); do
    jq -n --arg host "f$i.$DOMAIN" --arg id "$CDN_UUID" --arg path "$CDN_PATH" --argjson port "$CDN_PORT" \
        --arg tag "cdn-f$i" '{
            tag: $tag, protocol: "vless",
            settings: {vnext: [{address: $host, port: $port, users: [{id: $id, encryption: "none"}]}]},
            streamSettings: {
                network: "ws", security: "tls",
                tlsSettings: {serverName: $host, fingerprint: "chrome", alpn: ["http/1.1"]},
                wsSettings: {path: $path, host: $host},
                sockopt: {domainStrategy: "ForceIPv4"}
            }}'
done | jq -s .)
RELAY=$(jq -n --argjson outs "$OUTBOUNDS" --argjson port "$RELAY_PORT" '{
    log: {loglevel: "warning", access: "none"},
    inbounds: [{tag: "relay-in", listen: "127.0.0.1", port: $port, protocol: "dokodemo-door",
                settings: {address: "127.0.0.1", port: 443, network: "tcp"}}],
    outbounds: $outs,
    observatory: {subjectSelector: ["cdn-"], probeUrl: "https://www.gstatic.com/generate_204",
                  probeInterval: "30s", enableConcurrency: true},
    routing: {
        balancers: [{tag: "cdn", selector: ["cdn-"], strategy: {type: "leastPing"}, fallbackTag: "cdn-f1"}],
        rules: [{type: "field", inboundTag: ["relay-in"], balancerTag: "cdn"}]
    }}')

iran() { ssh "${SSHO[@]}" -p "$IRAN_SSH_PORT" "root@$IRAN_IP" "$@"; }
local_sum=$(sha256sum /usr/local/bin/xray | cut -d' ' -f1)
if [ "$(iran 'sha256sum /usr/local/bin/xray-relay 2>/dev/null | cut -d" " -f1')" != "$local_sum" ]; then
    echo "copying the xray binary to the Iran server..."
    scp -q "${SSHO[@]}" -P "$IRAN_SSH_PORT" /usr/local/bin/xray "root@$IRAN_IP:/usr/local/bin/xray-relay.new"
    iran 'chmod 755 /usr/local/bin/xray-relay.new && mv /usr/local/bin/xray-relay.new /usr/local/bin/xray-relay'
fi
echo "$RELAY" | iran 'mkdir -p /etc/xray-relay && cat > /etc/xray-relay/config.new.json'
iran bash -s <<'EOF' || die "could not set up xray-relay on the Iran server"
set -e
c=/etc/xray-relay/config.new.json
# Older and newer Xray name the forwarding inbound differently.
if ! xray-relay run -test -c $c >/dev/null 2>&1; then
    sed -i 's/"dokodemo-door"/"tunnel"/' $c
    xray-relay run -test -c $c >/dev/null || { xray-relay run -test -c $c | tail -3; exit 1; }
fi
chmod 644 $c
mv $c /etc/xray-relay/config.json
cat > /etc/systemd/system/xray-relay.service <<'UNIT'
[Unit]
Description=Xray relay to the foreign servers through Cloudflare
After=network-online.target
Wants=network-online.target

[Service]
DynamicUser=yes
ExecStart=/usr/local/bin/xray-relay run -config /etc/xray-relay/config.json
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable xray-relay >/dev/null 2>&1
systemctl restart xray-relay
sleep 2
systemctl is-active --quiet xray-relay || { journalctl -u xray-relay -n 10 --no-pager -o cat; exit 1; }
echo "$(hostname): xray-relay running"
EOF

step "end-to-end test through Cloudflare (from the Iran server)"
sleep 8
code=$(iran \
    "curl -s -o /dev/null -m 20 -w '%{http_code}' --resolve $SNI:$RELAY_PORT:127.0.0.1 https://$SNI:$RELAY_PORT/" || true)
echo "HTTP $code"
case "$code" in
    2*|3*|4*) echo "the Cloudflare path works" ;;
    *) die "no answer through Cloudflare; check the DNS records (orange cloud) and SSL mode Full, then re-run" ;;
esac

step "HAProxy backup server on the Iran server"
iran bash -s <<EOF || die "could not add the backup server to HAProxy"
set -e
f=/etc/haproxy/haproxy.cfg
if grep -q '^ *server cdn ' \$f; then echo "already in HAProxy"; exit 0; fi
last=\$(grep -E '^(frontend|backend|listen) ' \$f | tail -1)
[ "\$last" = "backend foreign" ] || { echo "backend foreign is not the last section of \$f"; exit 1; }
cp \$f \$f.bak
echo "    server cdn 127.0.0.1:$RELAY_PORT check backup" >> \$f
if haproxy -c -f \$f >/dev/null; then systemctl reload haproxy; echo "added as backup"; else mv \$f.bak \$f; echo "config check failed, reverted"; exit 1; fi
EOF

echo
echo ">>> DONE. On the Iran server, tun-status now lists 'cdn' as a backup."
echo ">>> It carries traffic only while every direct server is DOWN."
