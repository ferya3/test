#!/usr/bin/env bash
#
# Point nginx at the app and get a TLS certificate.
#
#   sudo bash scripts/setup-nginx.sh escrowbridge.site
#
# Run this after scripts/install.sh, once the domain's A record points at this
# server. Safe to re-run: it rewrites the site file and reloads.

set -euo pipefail

DOMAIN="${1:-}"
PORT="${2:-3000}"

say() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m    %s\033[0m\n' "$1"; }
die() { printf '\n\033[1;31m!!  %s\033[0m\n' "$1" >&2; exit 1; }

[ -n "$DOMAIN" ] || die "Usage: sudo bash scripts/setup-nginx.sh <domain> [port]"
[ "$(id -u)" -eq 0 ] || die "Run this with sudo — it writes to /etc/nginx."

# --- Is the app actually listening? -----------------------------------------
# A proxy in front of nothing gives a 502, which is a confusing thing to debug
# later, so say it now while the cause is obvious.
if ! curl -fsS --max-time 5 "http://127.0.0.1:${PORT}/" >/dev/null 2>&1; then
  warn "Nothing is answering on 127.0.0.1:${PORT}."
  warn "Start it first (pm2 start npm --name escrowbridge -- start), or nginx"
  warn "will return 502. Carrying on with the configuration anyway."
fi

command -v nginx >/dev/null 2>&1 || {
  say "Installing nginx"
  apt-get update -qq
  apt-get install -y -qq nginx
}

# --- The site ---------------------------------------------------------------
say "Writing /etc/nginx/sites-available/escrowbridge"
cat >/etc/nginx/sites-available/escrowbridge <<CONF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    # Credential vaults and long deal descriptions travel in form posts.
    client_max_body_size 5m;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;

        # Without these the app sees every visitor as 127.0.0.1, which would
        # make the per-IP rate limits lock out everybody at once.
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Host \$host;

        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 60s;
    }
}
CONF

# The default site claims port 80 for every hostname, which is what serves the
# "Welcome to nginx!" page instead of the app.
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/escrowbridge /etc/nginx/sites-enabled/escrowbridge

say "Checking the configuration"
nginx -t
systemctl reload nginx

# --- Firewall ---------------------------------------------------------------
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  say "Opening the web ports in ufw"
  ufw allow 'Nginx Full' >/dev/null
fi

# --- Certificate ------------------------------------------------------------
if [ "${SKIP_TLS:-no}" = "yes" ]; then
  warn "SKIP_TLS=yes — serving plain HTTP only."
else
  command -v certbot >/dev/null 2>&1 || {
    say "Installing certbot"
    apt-get install -y -qq certbot python3-certbot-nginx
  }

  # Asking for a name that has no DNS record fails the whole request, taking
  # the apex down with it, so only ask for www when www actually resolves.
  names=(-d "${DOMAIN}")
  if [ -n "$(getent hosts "www.${DOMAIN}" || true)" ]; then
    names+=(-d "www.${DOMAIN}")
  else
    warn "www.${DOMAIN} has no DNS record — requesting the certificate for ${DOMAIN} alone."
  fi

  say "Requesting a certificate for ${DOMAIN}"
  # --expand covers re-running against an existing certificate for a subset of
  # these names, which is otherwise an interactive prompt that --non-interactive
  # turns into a hard failure.
  #
  # Non-fatal overall: HTTP already works by this point, so a certificate
  # problem is worth reporting and retrying, not worth unwinding a good proxy
  # configuration over.
  if certbot --nginx "${names[@]}" --expand --redirect --agree-tos \
      --register-unsafely-without-email --non-interactive; then
    say "HTTPS is live"
  else
    warn "certbot failed. The site still works over http://${DOMAIN}"
    warn "Check that ${DOMAIN} resolves to this server (dig +short ${DOMAIN}),"
    warn "then re-run this script, or:"
    warn "    sudo certbot --nginx -d ${DOMAIN} --expand"
    warn "Details are in /var/log/letsencrypt/letsencrypt.log"
  fi
fi

cat <<NEXT

────────────────────────────────────────────────────────────────
 nginx is now proxying ${DOMAIN} to 127.0.0.1:${PORT}

 One thing left, or password-reset links will point at localhost:
     nano .env      ->  APP_URL="https://${DOMAIN}"
     pm2 restart escrowbridge
────────────────────────────────────────────────────────────────
NEXT
