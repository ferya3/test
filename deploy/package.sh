#!/usr/bin/env bash
#
# Build a self-contained tarball that installs without reaching packagist, npm
# or codeload.
#
# This exists for hosts where those are slow or blocked. The bundle carries a
# production `vendor/` and a built `public/build/`, and `install-ubuntu.sh`
# detects both and skips the steps that would fetch them. Everything the
# installer still needs from the network — apt packages, PHP, MySQL, Redis — is
# on Ubuntu's own mirrors, which is a different reachability problem.
#
# Usage:
#   bash deploy/package.sh                    # from the current HEAD
#   REF=v1.4.0 bash deploy/package.sh         # from a tag
#   OUT=/tmp/build bash deploy/package.sh     # write the tarball elsewhere
#
# Environment variables:
#   REF   git ref to export          (default: HEAD)
#   OUT   output directory           (default: the repository root)
#
# Run this on a machine with working network access, then copy the single
# resulting file to the server.

set -Eeuo pipefail

REF="${REF:-HEAD}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${OUT:-$ROOT}"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m !  %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m !! %s\033[0m\n' "$*" >&2; exit 1; }

trap 'die "Failed at line $LINENO."' ERR

command -v git >/dev/null      || die "git is required."
command -v composer >/dev/null || die "composer is required."
command -v npm >/dev/null      || die "npm is required."

cd "$ROOT"
git rev-parse --verify "$REF" >/dev/null 2>&1 || die "Not a git ref: $REF"

SHA="$(git rev-parse --short "$REF")"
STAMP="$(date -u +%Y%m%d)"
NAME="artavil-gold-${STAMP}-${SHA}"
STAGE="$(mktemp -d)"
DEST="$STAGE/$NAME"

# The staging directory is large (a production vendor/ is a few hundred MB), so
# it is removed on every exit path rather than only on success.
trap 'rm -rf "$STAGE"' EXIT

# ---------------------------------------------------------------------------
# Export the tree
# ---------------------------------------------------------------------------
#
# `git archive` rather than `cp -r`: it takes exactly what is committed at $REF,
# so a dirty working tree, .git itself, node_modules and any local .env cannot
# leak into a bundle that is about to be copied onto a server.

log "Exporting $REF ($SHA)"
mkdir -p "$DEST"
git archive "$REF" | tar -x -C "$DEST"

[[ -f "$DEST/artisan" ]] || die "Export looks wrong — no artisan in it."

# ---------------------------------------------------------------------------
# Dependencies, as production wants them
# ---------------------------------------------------------------------------

log "Installing PHP dependencies (--no-dev)"
# --no-dev matters twice over: phpunit, sebastian and mockery are the bulk of a
# dev vendor/ (gigabytes of it), and none of it belongs on a live host.
COMPOSER_ALLOW_SUPERUSER=1 composer install -d "$DEST" \
    --no-dev --optimize-autoloader --no-interaction --prefer-dist --no-progress

[[ -f "$DEST/vendor/autoload.php" ]] || die "composer install produced no autoloader."

log "Building frontend assets"
# Built in the export, not copied from the repository, so the manifest always
# matches the code being shipped rather than whatever was last built locally.
( cd "$DEST" && npm ci --no-audit --no-fund --ignore-scripts && npm run build )

[[ -f "$DEST/public/build/manifest.json" ]] || die "The asset build produced no manifest."

# node_modules is a build input, not a runtime dependency — Blade reads
# public/build/manifest.json and nothing else.
log "Dropping node_modules from the bundle"
rm -rf "$DEST/node_modules"

# Composer falls back to --prefer-source when a dist download is refused, and a
# source install leaves a full .git directory inside every package. That was
# 250MB of the first bundle built here — the repository history of Laravel,
# Carbon and Guzzle, shipped to a server that will never read it.
#
# Worth removing on its own merits, too: deploy.sh refuses to run against a
# dirty working tree, and nested repositories are what make that check
# confusing to debug.
log "Stripping vendor VCS directories"
find "$DEST/vendor" -type d -name '.git' -prune -exec rm -rf {} + 2>/dev/null || true
find "$DEST/vendor" -type f -name '.gitignore' -delete 2>/dev/null || true

# The autoloader is generated from installed-package metadata, not from these
# directories, so removing them cannot invalidate it — but verify, because a
# bundle with a broken autoloader fails on the server rather than here.
php -r 'require "'"$DEST"'/vendor/autoload.php"; exit(class_exists("Illuminate\\Foundation\\Application") ? 0 : 1);' \
    || die "The autoloader stopped resolving after the VCS strip."

# ---------------------------------------------------------------------------
# Sanity checks before anything is shipped
# ---------------------------------------------------------------------------

log "Checking the bundle"

# The installer refuses to overwrite an existing .env, so one hidden in the
# bundle would silently become the server's configuration — with this machine's
# APP_KEY and database password in it.
if [[ -f "$DEST/.env" ]]; then
    die ".env is in the bundle. It must never ship — remove it and re-run."
fi

for path in artisan composer.json vendor/autoload.php public/build/manifest.json \
            deploy/install-ubuntu.sh deploy/deploy.sh public/index.php; do
    [[ -e "$DEST/$path" ]] || die "Missing from the bundle: $path"
done

# git records the executable bit; tar preserves it. Verify rather than assume,
# because a bundle whose installer is not executable fails on the server.
chmod +x "$DEST/deploy/"*.sh

# ---------------------------------------------------------------------------
# Archive
# ---------------------------------------------------------------------------

log "Creating the tarball"
TARBALL="$OUT/${NAME}.tar.gz"
mkdir -p "$OUT"

# --numeric-owner and --owner/--group: the bundle is unpacked as root on the
# server, and the installer chowns the tree to www-data afterwards. Recording
# this machine's UIDs would only produce misleading ownership in between.
tar -czf "$TARBALL" \
    --numeric-owner --owner=0 --group=0 \
    -C "$STAGE" "$NAME"

cd "$OUT"
sha256sum "$(basename "$TARBALL")" > "${TARBALL}.sha256"

log "Done"
cat <<SUMMARY

  Bundle     $TARBALL
  Size       $(du -h "$TARBALL" | cut -f1)
  Checksum   ${TARBALL}.sha256
  Revision   $SHA ($REF)

  On the server:

    tar -xzf ${NAME}.tar.gz
    sudo mv $NAME /var/www/panels
    sudo DOMAIN=your-domain.com bash /var/www/panels/deploy/install-ubuntu.sh

  The installer will report "Offline bundle detected" and skip composer, npm
  and Node. It still needs apt to reach Ubuntu's mirrors for PHP, Nginx, MySQL
  and Redis.

SUMMARY
