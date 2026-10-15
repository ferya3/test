#!/usr/bin/env bash
#
# Give the site administrator a new password (a forgotten one cannot be
# recovered, only replaced). Prints the email and the new password.
#
#   sudo bash /opt/artavil-web/web/deploy/reset-admin.sh
#   sudo RESET_2FA=1 bash /opt/artavil-web/web/deploy/reset-admin.sh   # also turn off 2-step login
#
# Runs as the service user, so the database files it touches stay writable
# by the site.

set -Eeuo pipefail
[[ $EUID -eq 0 ]] || { echo "run as root"; exit 1; }

APP_DIR=/opt/artavil-web/web
set -a; . /etc/artavil-web.env; set +a

cd "$APP_DIR"
runuser -u artavil -- env DATABASE_PATH="$DATABASE_PATH" ADMIN_EMAIL="${ADMIN_EMAIL:-}" ADMIN_PASSWORD="${ADMIN_PASSWORD:-}" RESET_2FA="${RESET_2FA:-}" \
  "$(command -v node)" --experimental-strip-types --no-warnings scripts/reset-admin.ts
