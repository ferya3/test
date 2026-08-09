#!/usr/bin/env bash
#
# Ship a change to an already-provisioned host.
#
# install-ubuntu.sh builds a server once. This is the path for every release
# after that: it does not touch packages, .env, the database user, Nginx or the
# systemd units, only the application.
#
# Ordering is the whole point of the script:
#
#   1. maintenance mode      before anything can be half-updated
#   2. code                  fetch and check out
#   3. dependencies          composer/npm, built with the new code present
#   4. migrations            with caches cleared, so they run against the
#                            configuration in .env rather than yesterday's
#   5. optimize              re-cache config, routes and views
#   6. queue:restart         workers hold the *old* code in memory until told
#   7. php-fpm reload        drop the old opcache
#   8. maintenance off       only once the above all succeeded
#
# Step 6 is the one people miss. A `queue:work` process loads the application
# once and keeps it; without a restart, image conversions keep running last
# week's code against this week's database until the worker happens to hit its
# --max-time.
#
# Usage:
#   sudo bash deploy/deploy.sh
#   sudo REF=v1.4.0 bash deploy/deploy.sh      # deploy a tag
#   sudo SKIP_ASSETS=1 bash deploy/deploy.sh   # backend-only change
#
# Environment variables:
#   APP_DIR       application root            (default: this checkout)
#   REF           git ref to deploy           (default: current branch's upstream)
#   PHP_VER       PHP version in use          (default: 8.4)
#   SKIP_ASSETS   1 to skip the npm build     (default: unset)
#   SKIP_MIGRATE  1 to skip migrations        (default: unset)

set -Eeuo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PHP_VER="${PHP_VER:-8.4}"
PHP="/usr/bin/php${PHP_VER}"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m !  %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m !! %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Run this with sudo."
[[ -f "$APP_DIR/artisan" ]] || die "No artisan found in $APP_DIR — set APP_DIR to the application root."
[[ -f "$APP_DIR/.env" ]] || die "No .env in $APP_DIR — this host has not been provisioned. Run install-ubuntu.sh first."

command -v "$PHP" >/dev/null || PHP="$(command -v php)" || die "No PHP binary found."

cd "$APP_DIR"

# Bring the site back up whatever goes wrong. A failed deploy that leaves the
# site in maintenance mode turns a bad release into an outage.
cleanup() {
    local code=$?
    if [[ $code -ne 0 ]]; then
        warn "Deploy failed — bringing the site back up on the previous release."
        $PHP artisan up >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

# install-ubuntu.sh hands the checkout to www-data so PHP-FPM can write to
# storage/, but this script runs as root — and git refuses to touch a repository
# owned by another user unless the directory is marked trusted. Without this,
# every deploy dies at the first git command with "detected dubious ownership",
# which reads like a git problem rather than the ownership one it is.
#
# Registered before PREVIOUS is read, not at the fetch: `rev-parse` is a git
# command too, so otherwise the current release resolves to "unknown" — and the
# rollback hint this script prints on failure is `REF=$PREVIOUS`, which would be
# unusable at exactly the moment it is needed.
if [[ -d "$APP_DIR/.git" ]] \
    && ! git config --global --get-all safe.directory 2>/dev/null | grep -qxF "$APP_DIR"; then
    log "Marking $APP_DIR as a trusted git directory for $(id -un)"
    git config --global --add safe.directory "$APP_DIR"
fi

PREVIOUS="$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo 'unknown')"

log "Deploying to $APP_DIR (currently at $PREVIOUS)"

# ---------------------------------------------------------------------------
# 1. Maintenance mode
# ---------------------------------------------------------------------------

# --render pre-renders the maintenance view, so it is served without booting
# the framework — which matters because the next steps are about to replace the
# framework underneath it. The secret lets an operator verify the release
# before the public sees it.
BYPASS="$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"

log "Entering maintenance mode"
$PHP artisan down --render="errors::503" --secret="$BYPASS" --retry=60 >/dev/null 2>&1 \
    || warn "Could not pre-render the maintenance page; continuing with the default."

# ---------------------------------------------------------------------------
# 2. Code
# ---------------------------------------------------------------------------

if [[ -d .git ]]; then
    log "Fetching code"
    git -C "$APP_DIR" fetch --prune --tags origin

    TARGET="${REF:-$(git -C "$APP_DIR" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || echo '')}"
    [[ -n "$TARGET" ]] || die "No REF given and no upstream branch is configured."

    # Refuse to discard uncommitted work on the server — it is usually somebody
    # debugging in production, and silently throwing it away is unkind.
    if ! git -C "$APP_DIR" diff --quiet || ! git -C "$APP_DIR" diff --cached --quiet; then
        die "Working tree is dirty. Commit, stash or discard the changes on the server first."
    fi

    log "Checking out $TARGET"
    git -C "$APP_DIR" checkout --detach "$TARGET"
else
    warn "Not a git checkout — skipping the fetch. Code is assumed to be in place already."
fi

RELEASE="$(git -C "$APP_DIR" rev-parse --short HEAD 2>/dev/null || echo 'unknown')"

# ---------------------------------------------------------------------------
# 3. Dependencies
# ---------------------------------------------------------------------------

log "Installing PHP dependencies"
COMPOSER_ALLOW_SUPERUSER=1 composer install \
    --no-interaction --prefer-dist --no-progress \
    --no-dev --optimize-autoloader

if [[ -z "${SKIP_ASSETS:-}" ]]; then
    log "Building frontend assets"
    npm ci --ignore-scripts
    npm run build
else
    warn "SKIP_ASSETS set — leaving public/build as it is."
fi

# ---------------------------------------------------------------------------
# 4. Migrations
# ---------------------------------------------------------------------------

# Cleared before migrating: a cached config from the previous release may name
# a different database, and the seeder refuses to run at all while config is
# cached. Re-cached in step 5.
log "Clearing cached config, routes and views"
$PHP artisan optimize:clear

if [[ -z "${SKIP_MIGRATE:-}" ]]; then
    log "Running migrations"
    $PHP artisan migrate --force
else
    warn "SKIP_MIGRATE set — schema left untouched."
fi

# ---------------------------------------------------------------------------
# 5. Caches
# ---------------------------------------------------------------------------

log "Setting filesystem ownership"

# Ownership before the caches are written, and across the whole tree rather
# than the writable directories alone.
#
# composer and npm have just recreated vendor/ and public/build as root, with
# root's umask deciding the modes. On an image where that umask is 077 the new
# files land unreadable to www-data and every request dies with "Failed opening
# required vendor/autoload.php" — a green deploy followed by a site-wide 500.
chown -R www-data:www-data "$APP_DIR"

find "$APP_DIR" -type d -exec chmod 755 {} +
find "$APP_DIR" -type f -exec chmod 644 {} +
find "$APP_DIR/storage" "$APP_DIR/bootstrap/cache" -type d -exec chmod 775 {} +
find "$APP_DIR/storage" "$APP_DIR/bootstrap/cache" -type f -exec chmod 664 {} +

chmod +x "$APP_DIR/artisan"
chmod 640 "$APP_DIR/.env"

# Checked, not assumed — this is the step whose silent failure takes the site
# down, and the trap above can only roll back what it is told about.
sudo -u www-data test -r "$APP_DIR/vendor/autoload.php" \
    || die "www-data cannot read vendor/autoload.php — refusing to finish the deploy."
sudo -u www-data test -r "$APP_DIR/public/build/manifest.json" \
    || die "www-data cannot read the Vite manifest — refusing to finish the deploy."

log "Caching configuration, routes and views"
# As www-data so the compiled artefacts belong to the user that reads them.
sudo -u www-data $PHP artisan optimize

# Application caches key off a version counter rather than being flushed, so
# catalogue data survives a deploy. Only the compiled artefacts above change.

# ---------------------------------------------------------------------------
# 6-7. Restart the things holding old code
# ---------------------------------------------------------------------------

log "Restarting queue workers"
# Graceful: each worker finishes the job in hand, then exits, and systemd
# starts it again on the new code.
$PHP artisan queue:restart >/dev/null

log "Reloading PHP-FPM"
systemctl reload "php${PHP_VER}-fpm" || warn "Could not reload php${PHP_VER}-fpm — check the service name."

# ---------------------------------------------------------------------------
# 8. Back up
# ---------------------------------------------------------------------------

log "Leaving maintenance mode"
$PHP artisan up >/dev/null

# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------

log "Checking the site responds"
APP_URL_VALUE="$(grep -E '^APP_URL=' .env | head -1 | cut -d= -f2- | tr -d '"' || true)"
HEALTH="${APP_URL_VALUE:-http://localhost}/up"

if curl -fsS --max-time 15 -o /dev/null "$HEALTH"; then
    printf '\n\033[1;32m==> Deployed %s -> %s\033[0m\n' "$PREVIOUS" "$RELEASE"
else
    die "Deployed, but $HEALTH did not respond. The site is out of maintenance mode — check the logs at storage/logs."
fi

cat <<SUMMARY

  Previous release : $PREVIOUS
  Now running      : $RELEASE

  Rollback:
    sudo REF=$PREVIOUS bash deploy/deploy.sh

  Watch:
    journalctl -u panels-queue -f
    tail -f storage/logs/laravel-\$(date +%F).log

SUMMARY
