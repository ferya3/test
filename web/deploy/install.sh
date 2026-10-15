#!/usr/bin/env bash
#
# Install the Artavil Gold website (Next.js) on a fresh Ubuntu server.
#
#   curl -fsSL https://raw.githubusercontent.com/ferya3/test/claude/industrial-panel-website-z61mth/web/deploy/install.sh | sudo bash
#
# or, from a clone:   sudo bash web/deploy/install.sh
#
# Tested on Ubuntu 22.04 / 24.04 / 26.04, as root. Safe to re-run: it updates
# the code, keeps the database and uploads, and never resets the admin password.
#
# Settings (environment variables, all optional):
#   SITE_URL     public address, e.g. https://artavilgold.ir   (default: http://<server IP>)
#   DOMAIN       nginx server_name                              (default: _ , any host)
#   BRANCH       git branch                                     (default: claude/industrial-panel-website-z61mth)
#   ADMIN_EMAIL  first administrator's email                    (default: admin@artavilgold.ir)
#
# Nothing here needs the PHP/MySQL stack of the previous site. If that site is
# installed, its nginx vhost is switched off (not deleted) so this one can
# answer on port 80; see the note printed at the end to switch back.

set -Eeuo pipefail
umask 022

REPO="${REPO:-https://github.com/ferya3/test.git}"
BRANCH="${BRANCH:-claude/industrial-panel-website-z61mth}"
DOMAIN="${DOMAIN:-_}"
NODE_VERSION="${NODE_VERSION:-22.22.0}"

APP_USER=artavil
SRC_DIR=/opt/artavil-web            # the git checkout
APP_DIR="$SRC_DIR/web"              # the Next.js app inside it
DATA_DIR=/var/lib/artavil-web       # database + uploads: survives every update
ENV_FILE=/etc/artavil-web.env

say()  { printf '\n\033[1;33m==>\033[0m %s\n' "$*"; }
die()  { printf '\n\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }
trap 'die "failed at line $LINENO: $BASH_COMMAND"' ERR

[[ $EUID -eq 0 ]] || die "run as root (sudo bash $0)"
[[ "$(uname -m)" == x86_64 ]] || die "only x86_64 servers are supported"

# --------------------------------------------------------------------------
say "System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get -o Acquire::ForceIPv4=true update -qq
apt-get -o Acquire::ForceIPv4=true install -y -qq nginx git curl ca-certificates xz-utils >/dev/null

# --------------------------------------------------------------------------
# Node.js from the official binary tarball, with mirrors: some networks reach
# nodejs.org poorly or not at all, and Ubuntu's own nodejs package is too old
# for node:sqlite (needs 22.13+).
say "Node.js $NODE_VERSION"
node_ok() { command -v node >/dev/null && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)'; }

if node_ok; then
  echo "  found $(node -v)"
else
  tarball="node-v${NODE_VERSION}-linux-x64.tar.xz"
  got=""
  for mirror in https://nodejs.org/dist https://npmmirror.com/mirrors/node https://mirrors.cloud.tencent.com/nodejs-release; do
    echo "  trying $mirror"
    if curl -4 -fsSL --connect-timeout 15 --max-time 600 -o "/tmp/$tarball" "$mirror/v${NODE_VERSION}/$tarball"; then
      got=$mirror; break
    fi
  done
  [[ -n $got ]] || die "could not download Node.js from any mirror. Copy $tarball to /tmp yourself and re-run."
  rm -rf /usr/local/lib/nodejs && mkdir -p /usr/local/lib/nodejs
  tar -xJf "/tmp/$tarball" -C /usr/local/lib/nodejs --strip-components=1
  for bin in node npm npx; do ln -sfn "/usr/local/lib/nodejs/bin/$bin" "/usr/local/bin/$bin"; done
  node_ok || die "Node.js install did not work"
  echo "  installed $(node -v) from $got"
fi

# --------------------------------------------------------------------------
say "User and directories"
id "$APP_USER" &>/dev/null || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$DATA_DIR" "$DATA_DIR/uploads"

# --------------------------------------------------------------------------
say "Code ($BRANCH)"
git config --global --add safe.directory "$SRC_DIR" 2>/dev/null || true
if [[ -d $SRC_DIR/.git ]]; then
  git -C "$SRC_DIR" fetch -q origin "$BRANCH"
  git -C "$SRC_DIR" checkout -q -B "$BRANCH" "origin/$BRANCH"
  git -C "$SRC_DIR" reset -q --hard "origin/$BRANCH"
else
  git clone -q --depth 1 --branch "$BRANCH" "$REPO" "$SRC_DIR"
fi
echo "  at $(git -C "$SRC_DIR" log -1 --format='%h %s')"

# --------------------------------------------------------------------------
say "Configuration ($ENV_FILE)"
if [[ ! -f $ENV_FILE ]]; then
  if [[ -z ${SITE_URL:-} ]]; then
    ip=$(ip -4 -o addr show scope global | awk '{print $4}' | cut -d/ -f1 | head -1)
    [[ -n $ip ]] || die "could not find this server's IP; set SITE_URL=http://your.address and re-run"
    SITE_URL="http://$ip"
  fi
  [[ $SITE_URL =~ ^https?://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] || die "SITE_URL must look like http://1.2.3.4 or https://example.com (got: $SITE_URL)"
  cat > "$ENV_FILE" <<ENV
NODE_ENV=production
SITE_URL=$SITE_URL
DATABASE_PATH=$DATA_DIR/app.db
UPLOAD_DIR=$DATA_DIR/uploads
NEXT_TELEMETRY_DISABLED=1
ENV
  echo "  written (SITE_URL=$SITE_URL)"
else
  echo "  kept existing file"
fi
chmod 640 "$ENV_FILE"
chown root:"$APP_USER" "$ENV_FILE"

# --------------------------------------------------------------------------
say "Dependencies and build"
cd "$APP_DIR"
registry=https://registry.npmjs.org
if ! curl -4 -fsS --connect-timeout 10 -o /dev/null "$registry/react"; then
  registry=https://registry.npmmirror.com
  echo "  npmjs.org unreachable; using $registry"
fi
npm ci --no-audit --no-fund --loglevel=error --registry="$registry"

set -a; . "$ENV_FILE"; set +a
npm run build
npm run db:seed

# The build runs as root; the service runs as $APP_USER and only needs to read
# the code. Capital X keeps directories and executables executable.
chown -R root:root "$SRC_DIR"
chmod -R u=rwX,go=rX "$SRC_DIR"
chown -R "$APP_USER":"$APP_USER" "$DATA_DIR"
# Next.js keeps a small cache of its own; the only part of the code tree the
# service may write to.
install -d -o "$APP_USER" -g "$APP_USER" -m 755 "$APP_DIR/.next/cache"

# --------------------------------------------------------------------------
say "Service (artavil-web)"
cat > /etc/systemd/system/artavil-web.service <<UNIT
[Unit]
Description=Artavil Gold website (Next.js)
After=network.target

[Service]
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
Environment=NODE_OPTIONS=--disable-warning=ExperimentalWarning
ExecStart=/usr/local/bin/node $APP_DIR/node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000
Restart=always
RestartSec=3

# Hardening: the app can write only to its data directory.
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DATA_DIR $APP_DIR/.next/cache

[Install]
WantedBy=multi-user.target
UNIT
# node may live in /usr/bin when it came with the system
[[ -x /usr/local/bin/node ]] || sed -i "s#/usr/local/bin/node#$(command -v node)#" /etc/systemd/system/artavil-web.service
systemctl daemon-reload
systemctl enable -q artavil-web
systemctl restart artavil-web

# --------------------------------------------------------------------------
say "nginx"
cat > /etc/nginx/sites-available/artavil-web <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    # Product photos up to 6 MB, plus the rest of the form.
    client_max_body_size 8m;
    server_tokens off;

    location / {
        proxy_pass http://127.0.0.1:3000;
        # A redirect that names the app's own address (which only this server
        # can reach) is turned back into one for the visitor's address.
        proxy_redirect http://localhost:3000/ /;
        proxy_redirect http://127.0.0.1:3000/ /;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        # Overwritten, never appended: the app rate-limits on this address.
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
NGINX
ln -sfn /etc/nginx/sites-available/artavil-web /etc/nginx/sites-enabled/artavil-web
rm -f /etc/nginx/sites-enabled/default
previous=""
if [[ -L /etc/nginx/sites-enabled/panels ]]; then
  rm -f /etc/nginx/sites-enabled/panels
  previous=yes
fi
nginx -t -q
systemctl reload nginx

# --------------------------------------------------------------------------
say "Checking"
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: localhost" http://127.0.0.1/ || true)
  [[ $code == 200 ]] && break
  sleep 1
done
[[ $code == 200 ]] || { journalctl -u artavil-web -n 30 --no-pager; die "site did not answer 200 (got $code)"; }

url=$(grep '^SITE_URL=' "$ENV_FILE" | cut -d= -f2-)
cat <<DONE

  Site is up:   $url
  Admin panel:  $url/admin
  (The admin email and password were printed above by the seed step, the
   first time only. Turn on two-step login under «امنیت» after signing in.)

  Logs:     journalctl -u artavil-web -f
  Update:   sudo bash $APP_DIR/deploy/update.sh
  Data:     $DATA_DIR  (database + uploads — back this up)
DONE
if [[ -n $previous ]]; then
  cat <<NOTE

  The previous (Laravel) site's nginx vhost was switched off, not deleted.
  To switch back:  ln -s /etc/nginx/sites-available/panels /etc/nginx/sites-enabled/ \\
                   && rm /etc/nginx/sites-enabled/artavil-web && systemctl reload nginx
NOTE
fi
