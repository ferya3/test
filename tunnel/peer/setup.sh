#!/usr/bin/env bash
# Prepares a new foreign server to join the tunnel. Run it on the new server
# after copying /root/tunnel.env from foreign server 1; from foreign server 1:
#
#   scp /root/tunnel.env root@NEW:/root/tunnel.env
#   ssh root@NEW 'bash -s' < setup.sh
#
# It installs Xray with the shared Reality keys and opens 443 to the Iran
# server only. The user list arrives afterwards: add the server to
# /etc/tun-peers on foreign server 1 and the panel copies its config over.
set -euo pipefail

die() { echo ">>> FAIL: $*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "run as root"
[ -s /root/tunnel.env ] || die "/root/tunnel.env not found; copy it from foreign server 1 first"
# shellcheck disable=SC1091
. /root/tunnel.env
for v in IRAN_IP SNI UUID SID PRIV PUB; do
    [ -n "${!v:-}" ] || die "$v is empty in /root/tunnel.env"
done
case "$SNI$IRAN_IP" in *"["*|*"("*) die "/root/tunnel.env is corrupted (link markup in a value)";; esac

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get install -y -qq curl chrony ufw jq openssl >/dev/null
systemctl enable --now chrony >/dev/null 2>&1

cat > /etc/sysctl.d/99-tunnel.conf <<'EOF'
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.ip_local_port_range = 10000 65535
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 5
net.ipv4.tcp_mtu_probing = 1
net.core.rmem_max = 67108864
net.core.wmem_max = 67108864
net.ipv4.tcp_rmem = 4096 87380 67108864
net.ipv4.tcp_wmem = 4096 65536 67108864
fs.file-max = 1048576
EOF
modprobe tcp_bbr 2>/dev/null || true
sysctl --system >/dev/null 2>&1
echo ">>> $(sysctl net.ipv4.tcp_congestion_control)"

if ! command -v xray >/dev/null; then
    bash -c "$(curl -fsSL https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install >/dev/null
fi
command -v xray >/dev/null || die "Xray did not install"
echo ">>> $(xray version | head -1)"

# A starter config with the admin user only; the panel replaces it with the
# full one as soon as this server is in /etc/tun-peers.
CFG=/usr/local/etc/xray/config.json
if ! jq -e '.inbounds[]? | select(.protocol == "vless")' "$CFG" >/dev/null 2>&1; then
    cat > "$CFG" <<EOF
{
  "log": { "loglevel": "warning", "access": "none" },
  "inbounds": [{
    "listen": "0.0.0.0", "port": 443, "protocol": "vless",
    "settings": {
      "clients": [{ "id": "$UUID", "flow": "xtls-rprx-vision", "email": "admin" }],
      "decryption": "none"
    },
    "streamSettings": {
      "network": "tcp", "security": "reality",
      "realitySettings": {
        "dest": "$SNI:443",
        "serverNames": ["$SNI"],
        "privateKey": "$PRIV",
        "shortIds": ["$SID"]
      }
    },
    "sniffing": { "enabled": true, "destOverride": ["http", "tls", "quic"], "routeOnly": true }
  }],
  "outbounds": [
    { "protocol": "freedom", "tag": "direct" },
    { "protocol": "blackhole", "tag": "block" }
  ],
  "routing": { "rules": [
    { "type": "field", "ip": ["geoip:private"], "outboundTag": "block" },
    { "type": "field", "protocol": ["bittorrent"], "outboundTag": "block" }
  ]}
}
EOF
fi
xray run -test -c "$CFG" >/dev/null || { xray run -test -c "$CFG" | tail -3; die "Xray rejected the config"; }
systemctl enable xray >/dev/null 2>&1
systemctl restart xray
sleep 2
systemctl is-active --quiet xray || { journalctl -u xray -n 15 --no-pager -o cat; die "xray did not start"; }
echo ">>> xray: active"

SSH_PORT=$(echo "${SSH_CONNECTION:-}" | awk '{print $4}')
SSH_PORT=${SSH_PORT:-22}
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow "${SSH_PORT}/tcp" >/dev/null
ufw allow from "$IRAN_IP" to any port 443 proto tcp >/dev/null
ufw --force enable >/dev/null
echo ">>> firewall: ssh ${SSH_PORT} open, 443 open to ${IRAN_IP} only"
echo ">>> DONE on $(hostname)"
