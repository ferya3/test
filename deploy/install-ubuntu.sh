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
# Works from a git checkout or from an offline bundle built by
# `deploy/package.sh`. In a bundle, vendor/ and public/build are already
# present, so composer, npm and Node are skipped — see the detection block
# below.
#
# Environment variables:
#   DOMAIN      server_name for the Nginx vhost     (default: _)
#   APP_DIR     where the application lives         (default: this checkout)
#   APP_URL     public URL written into .env        (default: http://$DOMAIN)
#   APP_NAME    application name in .env            (default: Artavil Gold)
#   DB_NAME     MySQL database name                 (default: panels)
#   DB_USER     MySQL username                      (default: panels)
#   PHP_VER     PHP version to install              (default: 8.4)
#   FORCE_DEPS  fetch dependencies even if bundled  (default: unset)

set -Eeuo pipefail

DOMAIN="${DOMAIN:-_}"
PHP_VER="${PHP_VER:-8.4}"
APP_NAME="${APP_NAME:-Artavil Gold}"
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
# Offline bundle detection
# ---------------------------------------------------------------------------
#
# `deploy/package.sh` produces a tarball that already contains a production
# `vendor/` and a built `public/build/`. That exists for hosts which cannot
# reach packagist, npm or codeload — so when those artefacts are present the
# steps that would fetch them are skipped rather than attempted and failed.
#
# Detection is by artefact, not by a flag, so an ordinary git checkout (where
# neither is committed) still installs everything exactly as before. Set
# FORCE_DEPS=1 to fetch anyway and overwrite what the bundle shipped.

if [[ "${FORCE_DEPS:-}" == "1" ]]; then
    BUNDLED_VENDOR=no
    BUNDLED_ASSETS=no
else
    [[ -f "$APP_DIR/vendor/autoload.php" ]] && BUNDLED_VENDOR=yes || BUNDLED_VENDOR=no
    [[ -f "$APP_DIR/public/build/manifest.json" ]] && BUNDLED_ASSETS=yes || BUNDLED_ASSETS=no
fi

if [[ "$BUNDLED_VENDOR" == "yes" || "$BUNDLED_ASSETS" == "yes" ]]; then
    log "Offline bundle detected (vendor: $BUNDLED_VENDOR, assets: $BUNDLED_ASSETS)"
fi

# ---------------------------------------------------------------------------
# System packages
# ---------------------------------------------------------------------------

log "Installing base packages"
apt-get update -qq
apt-get install -y -qq \
    software-properties-common curl git unzip ca-certificates gnupg lsb-release

# The PPA was unconditional, on the assumption that Ubuntu ships an older PHP
# than this application needs. That was true of 22.04 and 24.04, and stopped
# being true afterwards: 25.04 and later carry PHP 8.4 themselves.
#
# Meanwhile ppa:ondrej/php only publishes for releases it has built, so on a
# newer Ubuntu than the PPA knows about `apt-get update` fails with "does not
# have a Release file" — and the run died there, on a host whose own
# repositories had the required PHP all along.
#
# So: ask apt what it can already see, and only reach for the PPA if the answer
# is nothing.

# Prints the first of its arguments that apt has a real package record for.
# `apt-cache show` alone is not enough: it exits 0 for a name that only exists
# as a Provides: or a pure virtual package, which cannot be installed.
apt_pkg() {
    for name in "$@"; do
        if apt-cache show "$name" 2>/dev/null | grep -q '^Package:'; then
            printf '%s' "$name"
            return 0
        fi
    done
    return 1
}

php_available() { apt_pkg "php${1}-fpm" >/dev/null; }

log "Locating PHP $PHP_VER"
if php_available "$PHP_VER"; then
    log "PHP $PHP_VER is in this release's own repositories — no PPA needed"
else
    UBUNTU_CODENAME="$(lsb_release -cs 2>/dev/null || echo unknown)"
    log "PHP $PHP_VER is not packaged for $UBUNTU_CODENAME — adding ppa:ondrej/php"

    # Deliberately not silenced. add-apt-repository does not reliably signal
    # failure through its exit status — it can fail to reach Launchpad, say so
    # on stdout, and still exit 0 — so hiding its output hides the only
    # evidence of what went wrong, and the run then fails later somewhere that
    # does not mention the PPA at all.
    add-apt-repository -y ppa:ondrej/php || true

    apt-get update || warn "apt-get update reported errors — see above"

    # The exit statuses above are advisory; this is the question that actually
    # matters, so ask it directly rather than inferring it.
    if ! php_available "$PHP_VER"; then
        warn "The PPA did not provide php${PHP_VER}-fpm on $UBUNTU_CODENAME"

        # Leaving a broken source behind would make every later apt-get in this
        # script — and every one the operator runs afterwards — fail the same
        # way, which is a worse state than the one we started in.
        add-apt-repository -y --remove ppa:ondrej/php >/dev/null 2>&1 || true
        apt-get update -qq || true

        # Fall back to whatever this release does carry. composer.json requires
        # PHP ^8.3, so anything at or above that will run the application.
        for candidate in 8.5 8.4 8.3; do
            if php_available "$candidate"; then
                warn "Using PHP $candidate from the distribution instead of $PHP_VER"
                PHP_VER="$candidate"
                break
            fi
        done

        if ! php_available "$PHP_VER"; then
            # Print what apt can actually see. Every previous version of this
            # failure ended in a one-line message that named the missing package
            # but gave no way to tell whether the repository was absent, empty,
            # or simply not fetched.
            warn "PHP-related sources apt currently has:"
            grep -rhs --include='*.list' --include='*.sources' \
                -e ondrej -e php /etc/apt/sources.list /etc/apt/sources.list.d/ || true
            warn "What apt knows about php${PHP_VER}-fpm:"
            apt-cache policy "php${PHP_VER}-fpm" || true

            die \
"No PHP 8.3+ available on $UBUNTU_CODENAME.

This release does not package one itself, and ppa:ondrej/php did not supply it
either — the output above shows what apt has. The usual causes are a network
that cannot reach ppa.launchpadcontent.net, or a release the PPA has not built
for.

Add a working PHP 8.3+ source by hand, then re-run with PHP_VER set to the
version you installed."
        fi
    fi
fi

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
#
# The package names differ between the two sources this can now install from.
# ppa:ondrej/php versions every extension (php8.4-redis, php8.4-igbinary);
# Ubuntu's own archive versions the ones built as part of PHP and ships the PECL
# extensions unversioned in universe (php-redis, php-igbinary), because they are
# built against the single PHP the release carries. Asking for the versioned
# name on a distribution PHP fails on the extensions, not on PHP itself.
#
# So resolve each name against what apt actually has (`apt_pkg`, defined above),
# rather than assuming which source we ended up with.

PHP_PKGS=()

# Everything here is required: gd for image conversions, intl for locale-aware
# formatting of Persian content, redis because cache, session and queue are all
# configured onto it below.
for ext in fpm cli common mysql mbstring xml curl zip intl gd bcmath opcache redis; do
    if ! pkg="$(apt_pkg "php${PHP_VER}-${ext}" "php-${ext}")"; then
        warn "What apt knows about php${PHP_VER}-${ext}:"
        apt-cache policy "php${PHP_VER}-${ext}" "php-${ext}" || true
        die "Neither php${PHP_VER}-${ext} nor php-${ext} exists in any configured source."
    fi
    PHP_PKGS+=("$pkg")
done

# igbinary is the one extension the application runs without, so it warns rather
# than dies — but it is not incidental either. It is the faster serialiser for
# everything going into Redis, and it is also the configuration in which a
# cached object comes back as __PHP_Incomplete_Class. Stage 8 shipped exactly
# that bug, and tests/Feature/Catalog/CachedPayloadTest.php guards it in CI with
# igbinary loaded. Without it here, the server stops being the machine that CI
# and docs/PERFORMANCE.md describe.
if pkg="$(apt_pkg "php${PHP_VER}-igbinary" php-igbinary)"; then
    PHP_PKGS+=("$pkg")
    IGBINARY=yes
else
    IGBINARY=no
fi

apt-get install -y -qq "${PHP_PKGS[@]}"

if [[ "$IGBINARY" == "no" ]]; then
    warn "igbinary is not packaged for PHP $PHP_VER — Redis will use PHP's serialiser"
fi

log "Installing Nginx, MySQL and Redis"
apt-get install -y -qq nginx mysql-server redis-server

log "Installing Composer"
if ! command -v composer >/dev/null; then
    # With a bundled vendor/ nothing in this run needs composer, so a host that
    # cannot reach getcomposer.org should not be stopped here. It is still worth
    # attempting, because `deploy/deploy.sh` does need it later.
    if curl -fsSL https://getcomposer.org/installer -o /tmp/composer-setup.php; then
        php /tmp/composer-setup.php --install-dir=/usr/local/bin --filename=composer --quiet
        rm -f /tmp/composer-setup.php
    elif [[ "$BUNDLED_VENDOR" == "yes" ]]; then
        warn "Could not download Composer, but vendor/ is bundled — continuing without it"
    else
        die "Could not download Composer and vendor/ is not bundled."
    fi
fi

log "Installing Node.js 22"
# Node exists only to build the assets. An offline bundle ships them already
# built, so on a host that cannot reach deb.nodesource.com there is nothing to
# install and nothing to do.
if [[ "$BUNDLED_ASSETS" == "yes" ]]; then
    warn "Assets are bundled — skipping Node.js"
elif ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
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
if [[ "$BUNDLED_VENDOR" == "yes" ]]; then
    warn "vendor/ is bundled — skipping composer install"
elif ! COMPOSER_ALLOW_SUPERUSER=1 composer install \
        --no-dev --optimize-autoloader --no-interaction --prefer-dist 2>/dev/null; then
    warn "Dist downloads failed (GitHub rate limit or blocked host) — retrying from source"
    COMPOSER_ALLOW_SUPERUSER=1 composer install \
        --no-dev --optimize-autoloader --no-interaction --prefer-source
fi

log "Building frontend assets"
if [[ "$BUNDLED_ASSETS" == "yes" ]]; then
    warn "public/build is bundled — skipping npm ci && npm run build"
else
    npm ci --no-audit --no-fund
    npm run build
fi

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

    # The public brand comes from the company_name setting and is editable in
    # the admin; APP_NAME is the framework's own name for the application and
    # still surfaces in mail headers, so it is set rather than left as "Laravel".
    set_env APP_NAME "$APP_NAME"
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

# The whole tree, not just the writable directories.
#
# Everything here was created by root — the clone, composer's vendor/, Vite's
# public/build — and PHP-FPM runs as www-data. Whether www-data can read any of
# it therefore depends entirely on root's umask, which is not the same on every
# image: at 022 the files land 644 and the site works, at 077 they land 600 and
# every request dies with
#
#   Failed opening required '/var/www/panels/vendor/autoload.php'
#
# on a server where the file plainly exists. Relying on a umask that happens to
# be permissive is not a permission model, so the modes are set explicitly.
chown -R www-data:www-data "$APP_DIR"

# `X` rather than a blanket 644: capital X applies the execute bit to
# directories and to files that already carry one, and leaves every other file
# alone. A flat `chmod 644` would strip +x from artisan and deploy/*.sh — and
# git records the executable bit, so the next deploy would abort on a working
# tree made dirty by the previous one.
chmod -R u=rwX,go=rX "$APP_DIR"

# Group-writable too, so an operator in the www-data group can clear a cache
# without sudo.
chmod -R u=rwX,g=rwX,o=rX "$APP_DIR/storage" "$APP_DIR/bootstrap/cache"

# Never world-readable: this file holds the database password and APP_KEY, and
# 644 would expose both to every account on the box.
chmod 640 "$APP_DIR/.env"

# Prove the permissions rather than assume them. What this replaces is an
# install that reported success and then returned 500 on every request, with
# the real reason only visible in the Nginx error log.
sudo -u www-data test -r "$APP_DIR/vendor/autoload.php" \
    || die "www-data cannot read vendor/autoload.php — every request would 500."
sudo -u www-data test -r "$APP_DIR/public/build/manifest.json" \
    || die "www-data cannot read the Vite manifest — every page would fail to render."
sudo -u www-data test -r "$APP_DIR/.env" \
    || die "www-data cannot read .env."
sudo -u www-data test -w "$APP_DIR/storage/logs" \
    || die "www-data cannot write to storage/logs — the app could not report its own errors."

log "Caching configuration, routes and views"
# As www-data, not root. `optimize` writes into bootstrap/cache, and root-owned
# cache files are ones the application itself cannot later rewrite.
sudo -u www-data php artisan optimize

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
