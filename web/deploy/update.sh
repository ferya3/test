#!/usr/bin/env bash
#
# Update the Artavil Gold website to the latest commit on its branch.
#
#   sudo bash /opt/artavil-web/web/deploy/update.sh
#
# The database and uploads live in /var/lib/artavil-web and are not touched;
# schema changes are applied automatically when the app starts.

set -Eeuo pipefail
umask 022
trap 'printf "\n\033[1;31mERROR:\033[0m failed at line %s: %s\n" "$LINENO" "$BASH_COMMAND" >&2' ERR

SRC_DIR=/opt/artavil-web
APP_DIR=$SRC_DIR/web
ENV_FILE=/etc/artavil-web.env
BRANCH=$(git -C "$SRC_DIR" rev-parse --abbrev-ref HEAD)

[[ $EUID -eq 0 ]] || { echo "run as root"; exit 1; }
git config --global --add safe.directory "$SRC_DIR" 2>/dev/null || true

before=$(git -C "$SRC_DIR" rev-parse --short HEAD)
git -C "$SRC_DIR" fetch -q origin "$BRANCH"
git -C "$SRC_DIR" reset -q --hard "origin/$BRANCH"
after=$(git -C "$SRC_DIR" rev-parse --short HEAD)
echo "code: $before -> $after  ($(git -C "$SRC_DIR" log -1 --format=%s))"

cd "$APP_DIR"
registry=https://registry.npmjs.org
curl -4 -fsS --connect-timeout 10 -o /dev/null "$registry/react" || registry=https://registry.npmmirror.com
npm ci --no-audit --no-fund --loglevel=error --registry="$registry"

set -a; . "$ENV_FILE"; set +a
npm run build

# Servers installed before nginx learned to rewrite redirects that name the
# app's internal address: add that to their config once.
SITE_CONF=/etc/nginx/sites-available/artavil-web
if [[ -f $SITE_CONF ]] && ! grep -q 'proxy_redirect http://localhost:3000/' "$SITE_CONF"; then
  sed -i '0,/proxy_pass http:\/\/127.0.0.1:3000;/s//proxy_pass http:\/\/127.0.0.1:3000;\n        proxy_redirect http:\/\/localhost:3000\/ \/;\n        proxy_redirect http:\/\/127.0.0.1:3000\/ \/;/' "$SITE_CONF"
  nginx -t -q && systemctl reload nginx && echo "nginx: redirects to the internal address are now rewritten"
fi

chown -R root:root "$SRC_DIR"
chmod -R u=rwX,go=rX "$SRC_DIR"
install -d -o artavil -g artavil -m 755 "$APP_DIR/.next/cache"
systemctl restart artavil-web

for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: localhost" http://127.0.0.1/ || true)
  [[ $code == 200 ]] && { echo "site is up ($after)"; exit 0; }
  sleep 1
done
echo "site did not answer 200 through nginx (last answer: ${code:-none})"
curl -s -o /dev/null -w '  GET / -> %{http_code} %{redirect_url}\n' -H "Host: localhost" http://127.0.0.1/ || true
journalctl -u artavil-web -n 30 --no-pager
exit 1
