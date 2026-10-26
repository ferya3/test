#!/usr/bin/env bash
# Installs or updates the tunnel panel on foreign server 1.
#
#   curl -fsSL https://raw.githubusercontent.com/ferya3/test/claude/great-tesla-sn3awj/tunnel/panel/install.sh -o /root/tunpanel-install.sh
#   bash /root/tunpanel-install.sh
#
# Re-running it updates the code and keeps the password, users and traffic.
set -euo pipefail

BRANCH="${BRANCH:-claude/great-tesla-sn3awj}"
SRC="https://raw.githubusercontent.com/ferya3/test/${BRANCH}/tunnel/panel"
PORT="${PORT:-2096}"
APP=/opt/tunpanel
CONF=/etc/tunpanel

die() { echo ">>> FAIL: $*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "run as root"
[ -s /root/tunnel.env ] || die "/root/tunnel.env not found; this is not foreign server 1"
command -v xray >/dev/null || die "xray is not installed"
# shellcheck disable=SC1091
. /root/tunnel.env
[ -n "${IRAN_IP:-}" ] || die "IRAN_IP is empty in /root/tunnel.env"

export DEBIAN_FRONTEND=noninteractive
apt-get install -y -qq python3 qrencode openssl ufw >/dev/null

mkdir -p "$APP" "$CONF" /var/lib/tunpanel
curl -fsSL "$SRC/tunpanel.py" -o "$APP/tunpanel.py.new"
python3 -m py_compile "$APP/tunpanel.py.new" || die "downloaded tunpanel.py does not compile"
mv "$APP/tunpanel.py.new" "$APP/tunpanel.py"
rm -rf "$APP/__pycache__"

if [ ! -s "$CONF/cert.pem" ]; then
    openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 3650 \
        -subj /CN=tunpanel -keyout "$CONF/key.pem" -out "$CONF/cert.pem" 2>/dev/null
    chmod 600 "$CONF/key.pem"
fi

PASSWORD=""
if [ ! -s "$CONF/config.json" ]; then
    PASSWORD="$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | cut -c1-16)"
    python3 "$APP/tunpanel.py" init --port "$PORT" --password "$PASSWORD"
fi
PORT="$(python3 -c "import json; print(json.load(open('$CONF/config.json'))['port'])")"

cat > /usr/local/bin/tunpanel <<'EOF'
#!/usr/bin/env bash
exec python3 /opt/tunpanel/tunpanel.py "$@"
EOF
chmod +x /usr/local/bin/tunpanel

cat > /etc/systemd/system/tunpanel.service <<'EOF'
[Unit]
Description=Tunnel panel
After=network-online.target xray.service
Wants=network-online.target

[Service]
ExecStart=/usr/bin/python3 /opt/tunpanel/tunpanel.py serve
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable tunpanel >/dev/null 2>&1
systemctl restart tunpanel

# The panel is reached through the Iran server only.
ufw allow from "$IRAN_IP" to any port "$PORT" proto tcp >/dev/null

# The panel owns the user list now; these would be overwritten by it.
for old in tun-adduser tun-deluser tun-users; do
    if [ -f "/usr/local/bin/$old" ]; then
        printf '#!/usr/bin/env bash\necho "Use the panel: https://%s:%s"\n' "$IRAN_HOST" "$PORT" > "/usr/local/bin/$old"
    fi
done

sleep 3
systemctl is-active --quiet tunpanel || { journalctl -u tunpanel -n 20 --no-pager -o cat; die "tunpanel did not start"; }

echo
echo ">>> tunpanel: active"
echo ">>> URL:      https://${IRAN_HOST}:${PORT}"
if [ -n "$PASSWORD" ]; then
    echo ">>> PASSWORD: $PASSWORD"
    echo "    (change it later with: tunpanel passwd NEWPASSWORD)"
else
    echo ">>> password unchanged (updated the code only)"
fi
