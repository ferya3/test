#!/usr/bin/env bash
#
# Provision an Ubuntu server (22.04 / 24.04 LTS) for this application.
#
# Installs PHP 8.4 + FPM, Nginx, MySQL 8, Redis, Composer and Node 22, then
# configures the application, runs migrations and seeds, and registers a queue
# worker and scheduler.
#
# Safe to re-run: every step is idempotent, and an existing .env is never
# overwritten (so generated passwords survive a second run).
#
# Usage:
#   sudo DOMAIN=panels.example.com bash deploy/install-ubuntu.sh
#
# Environment variables:
#   DOMAIN     server_name for the Nginx vhost      (default: _)
#   APP_DIR    where the application lives          (default: this checkout)
#   APP_URL    public URL written into .env         (default: http://$DOMAIN)
#   DB_NAME    MySQL database name                  (default: panels)
#   DB_USER    MySQL username                       (default: panels)
#   PHP_VER    PHP version to install               (default: 8.4)

set -Eeuo pipefail

DOMAIN="${DOMAIN:-_}"
PHP_VER="${PHP_VER:-8.4}"
DB_NAME="${DB_NAME:-panels}"
DB_USER="${DB_USER:-panels}"

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
if [[ "$DOMAIN" == "_" ]]; then
    APP_URL="${APP_URL:-http://localhost}"
else
    APP_URL="${APP_URL:-https://$DOMAIN}"
fi

export DEBIAN_FRONTEND=noninteractive

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m !  %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m !! %s\033[0m\n' "$*" >&2; exit 1; }

trap 'die "Failed at line $LINENO. Nothing further was changed; fix the error and re-run."' ERR

[[ $EUID -eq 0 ]] || die "Run this with sudo."
[[ -f "$APP_DIR/artisan" ]] || die "No artisan found in $APP_DIR — set APP_DIR to the application root."

# ---------------------------------------------------------------------------
# System packages
# ---------------------------------------------------------------------------

log "Installing base packages"
apt-get update -qq
apt-get install -y -qq \
    software-properties-common curl git unzip ca-certificates gnupg lsb-release

log "Adding the ondrej/php repository (Ubuntu ships an older PHP than $PHP_VER)"
add-apt-repository -y ppa:ondrej/php >/dev/null
apt-get update -qq

log "Installing PHP $PHP_VER and extensions"
# gd is required for image conversions; redis for cache/queue; intl for locale
# aware formatting of Persian content.
#
# igbinary is deliberate rather than incidental: it is the faster serialiser for
# everything going into Redis, and it is also the configuration in which a
# cached object comes back as __PHP_Incomplete_Class. Stage 8 shipped exactly
# that bug. Installing it here means the servers, the CI job that guards
# against it (tests/Feature/Catalog/CachedPayloadTest.php) and the docs all
# describe the same machine.
apt-get install -y -qq \
    "php${PHP_VER}-fpm" "php${PHP_VER}-cli" "php${PHP_VER}-common" \
    "php${PHP_VER}-mysql" "php${PHP_VER}-redis" "php${PHP_VER}-mbstring" \
    "php${PHP_VER}-xml" "php${PHP_VER}-curl" "php${PHP_VER}-zip" \
    "php${PHP_VER}-intl" "php${PHP_VER}-gd" "php${PHP_VER}-bcmath" \
    "php${PHP_VER}-opcache" "php${PHP_VER}-igbinary"

log "Installing Nginx, MySQL and Redis"
apt-get install -y -qq nginx mysql-server redis-server

log "Installing Composer"
if ! command -v composer >/dev/null; then
    curl -fsSL https://getcomposer.org/installer -o /tmp/composer-setup.php
    php /tmp/composer-setup.php --install-dir=/usr/local/bin --filename=composer --quiet
    rm -f /tmp/composer-setup.php
fi

log "Installing Node.js 22"
if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
    apt-get install -y -qq nodejs
fi

systemctl enable --now redis-server mysql "php${PHP_VER}-fpm" nginx >/dev/null

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

log "Creating the MySQL database and user"
DB_PASS_FILE="/root/.${DB_NAME}-db-password"

if [[ -f "$DB_PASS_FILE" ]]; then
    DB_PASS="$(cat "$DB_PASS_FILE")"
    warn "Reusing the database password from $DB_PASS_FILE"
else
    DB_PASS="$(openssl rand -base64 30 | tr -d '/+=' | head -c 32)"
    umask 077
    printf '%s' "$DB_PASS" > "$DB_PASS_FILE"
fi

# utf8mb4 throughout: the catalogue is Persian-first.
mysql --protocol=socket <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

cd "$APP_DIR"

log "Installing PHP dependencies"
# GitHub's API and codeload hosts are subject to rate limiting; when a dist
# download is refused, installing from source uses plain git instead.
if ! COMPOSER_ALLOW_SUPERUSER=1 composer install \
        --no-dev --optimize-autoloader --no-interaction --prefer-dist 2>/dev/null; then
    warn "Dist downloads failed (GitHub rate limit or blocked host) — retrying from source"
    COMPOSER_ALLOW_SUPERUSER=1 composer install \
        --no-dev --optimize-autoloader --no-interaction --prefer-source
fi

log "Building frontend assets"
npm ci --no-audit --no-fund
npm run build

log "Configuring .env"
if [[ -f .env ]]; then
    warn ".env already exists — leaving it untouched"
else
    cp .env.example .env

    # Rewrites an uncommented KEY=..., or appends the line when absent — which
    # is what happens for the keys .env.example ships commented out.
    #
    # Values are alphanumeric or simple URLs, and the generated password has
    # / + = stripped, so a | delimited sed expression is safe here.
    set_env() {
        local key="$1" value="$2"

        if grep -qE "^${key}=" .env; then
            sed -i "s|^${key}=.*|${key}=\"${value}\"|" .env
        else
            printf '%s="%s"\n' "$key" "$value" >> .env
        fi

        # Fail loudly rather than deploy a half-configured .env.
        grep -qF "${key}=\"${value}\"" .env || die "Could not set ${key} in .env"
    }

    set_env APP_ENV production
    set_env APP_DEBUG false
    set_env APP_URL "$APP_URL"
    set_env APP_LOCALE fa
    set_env APP_FALLBACK_LOCALE fa

    # .env.example ships single/debug, which is right for development and wrong
    # here on both counts: one file that grows without bound, filled with
    # everything the framework has to say. daily keeps 14 rotated files.
    set_env LOG_STACK daily
    set_env LOG_LEVEL warning

    set_env DB_CONNECTION mysql
    set_env DB_HOST 127.0.0.1
    set_env DB_PORT 3306
    set_env DB_DATABASE "$DB_NAME"
    set_env DB_USERNAME "$DB_USER"
    set_env DB_PASSWORD "$DB_PASS"

    set_env CACHE_STORE redis
    set_env QUEUE_CONNECTION redis
    set_env SESSION_DRIVER redis
    set_env REDIS_CLIENT phpredis
    set_env REDIS_HOST 127.0.0.1

    set_env SESSION_ENCRYPT true
    set_env SESSION_SAME_SITE lax

    # TLS-only cookies would lock everyone out of a plain-HTTP install, so the
    # flag follows the scheme actually in APP_URL. Enabling TLS later must be
    # paired with flipping this to true.
    if [[ "$APP_URL" == https://* ]]; then
        set_env SESSION_SECURE_COOKIE true
    else
        set_env SESSION_SECURE_COOKIE false
        warn "APP_URL is plain HTTP, so SESSION_SECURE_COOKIE is false."
        warn "Set it to true in .env once a TLS certificate is installed."
    fi

    # Security headers. HSTS only ever goes out over TLS (the middleware checks
    # the connection), so enabling it here is safe on a plain-HTTP install too.
    set_env CSP_ENABLED true
    set_env CSP_REPORT_ONLY false
    set_env HSTS_ENABLED true

    # Empty: nginx reaches PHP-FPM over FastCGI, which already carries the real
    # client address. Set this only if a CDN or load balancer is added later.
    set_env TRUSTED_PROXIES ""

    php artisan key:generate --force
fi

# A re-run arrives with the previous run's caches still in place. Migrating or
# seeding against a stale cached config is a good way to write to yesterday's
# database, and the seeder refuses to run at all while config is cached because
# it would silently ignore the SEED_* credentials and invent a second set of
# admin accounts. Cleared here; `optimize` puts it all back below.
log "Clearing cached config from any previous run"
php artisan optimize:clear

log "Running migrations"
# First real MySQL run: the products FULLTEXT index only applies on MySQL.
php artisan migrate --force

log "Seeding reference data"
# Seeder output includes the generated admin passwords — capture it.
SEED_LOG="$(mktemp)"
php artisan db:seed --force 2>&1 | tee "$SEED_LOG"

php artisan storage:link || true

log "Setting filesystem ownership"
chown -R www-data:www-data "$APP_DIR/storage" "$APP_DIR/bootstrap/cache"
find "$APP_DIR/storage" -type d -exec chmod 775 {} +
find "$APP_DIR/storage" -type f -exec chmod 664 {} +
chmod -R 775 "$APP_DIR/bootstrap/cache"

log "Caching configuration, routes and views"
php artisan optimize

# ---------------------------------------------------------------------------
# Nginx
# ---------------------------------------------------------------------------

log "Writing the Nginx vhost"
cat > /etc/nginx/sites-available/panels <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    root ${APP_DIR}/public;
    index index.php;

    charset utf-8;
    client_max_body_size 24M;

    # Security headers on PHP responses come from App\\Http\\Middleware\\SecurityHeaders,
    # so they are not repeated here: nginx add_header appends unconditionally and
    # cannot see what FastCGI already returned, which would emit each header
    # twice. The static locations below set their own, because those responses
    # are served by nginx alone and never reach the application.

    gzip on;
    gzip_types text/css text/javascript application/javascript application/json
               image/svg+xml application/xml;
    gzip_min_length 512;

    location / {
        try_files \$uri \$uri/ /index.php?\$query_string;
    }

    # Hashed Vite output is immutable.
    location /build/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header X-Content-Type-Options "nosniff" always;
        access_log off;
        try_files \$uri =404;
    }

    # Uploaded images. nosniff matters most here: these bytes came from an
    # upload form, and a browser that decides to sniff one as HTML would be
    # rendering attacker-influenced content from our own origin.
    location ~ ^/(storage|images)/ {
        expires 30d;
        add_header Cache-Control "public";
        add_header X-Content-Type-Options "nosniff" always;
        add_header Content-Disposition "inline" always;
        access_log off;
        try_files \$uri =404;
    }

    location = /favicon.ico { access_log off; log_not_found off; }
    location = /robots.txt  { try_files \$uri /index.php?\$query_string; }

    location ~ \.php\$ {
        # Refuse requests for PHP files that do not exist, so a crafted
        # path such as /uploads/evil.jpg/x.php can never reach the interpreter.
        try_files \$uri =404;

        fastcgi_pass unix:/run/php/php${PHP_VER}-fpm.sock;
        fastcgi_index index.php;
        include fastcgi.conf;
        fastcgi_hide_header X-Powered-By;
    }

    # Never serve dotfiles or anything from outside public/.
    location ~ /\.(?!well-known).* { deny all; }

    error_page 404 /index.php;
}
NGINX

ln -sfn /etc/nginx/sites-available/panels /etc/nginx/sites-enabled/panels
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

# ---------------------------------------------------------------------------
# Queue worker and scheduler
# ---------------------------------------------------------------------------

log "Registering the queue worker"
cat > /etc/systemd/system/panels-queue.service <<UNIT
[Unit]
Description=Panels queue worker
After=network.target redis-server.service mysql.service

[Service]
User=www-data
Group=www-data
Restart=always
RestartSec=3
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/php${PHP_VER} artisan queue:work redis --sleep=1 --tries=3 --max-time=3600

[Install]
WantedBy=multi-user.target
UNIT

log "Registering the scheduler"
cat > /etc/systemd/system/panels-scheduler.service <<UNIT
[Unit]
Description=Panels scheduler tick

[Service]
Type=oneshot
User=www-data
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/php${PHP_VER} artisan schedule:run
UNIT

cat > /etc/systemd/system/panels-scheduler.timer <<UNIT
[Unit]
Description=Run the Panels scheduler every minute

[Timer]
OnCalendar=*:0/1
AccuracySec=15s

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now panels-queue.service panels-scheduler.timer >/dev/null

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

log "Done"
cat <<SUMMARY

  Application  ${APP_DIR}
  URL          ${APP_URL}
  Database     ${DB_NAME} / ${DB_USER}
  DB password  stored in ${DB_PASS_FILE}

  Services     nginx, php${PHP_VER}-fpm, mysql, redis-server,
               panels-queue.service, panels-scheduler.timer

SUMMARY

if grep -q 'Created ' "$SEED_LOG"; then
    warn "Admin accounts created by the seeder (shown once — store them now):"
    grep -E 'Created |Store this password' "$SEED_LOG" || true
fi
rm -f "$SEED_LOG"

cat <<'NEXT'
  Next steps
    1. Point DNS at this server, then enable TLS:
         sudo apt-get install -y certbot python3-certbot-nginx
         sudo certbot --nginx -d your-domain
       Then set SESSION_SECURE_COOKIE=true in .env and re-run
       `php artisan optimize`. Until a certificate exists the site runs on
       plain HTTP with non-TLS-only cookies.
    2. Sign in at /admin with the credentials above and enrol TOTP. Privileged
       roles cannot reach the panel until they have.
    3. Work through the pre-launch checklist in docs/DEPLOYMENT.md section 5 —
       it covers the settings this script cannot decide for you, and backups,
       which it does not configure at all.

  Shipping a change later uses the other script, not this one:
    sudo bash deploy/deploy.sh

NEXT
