#!/usr/bin/env bash
#
# One-shot installer for Ubuntu. Safe to re-run: every step checks whether it
# has already been done, so a failed install can simply be started again.
#
#   bash scripts/install.sh
#
# It stops short of anything that needs a decision from you — the domain, the
# reverse proxy and the TLS certificate are printed as next steps rather than
# guessed at.

set -euo pipefail

NODE_MAJOR=22
say() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m    %s\033[0m\n' "$1"; }

if [ "$(id -u)" -eq 0 ]; then
  warn "Running as root. A normal user with sudo is the safer choice."
fi

# --- Node -------------------------------------------------------------------
current_major=0
if command -v node >/dev/null 2>&1; then
  current_major=$(node -v | sed 's/^v\([0-9]*\).*/\1/')
fi

if [ "$current_major" -lt "$NODE_MAJOR" ]; then
  say "Installing Node.js ${NODE_MAJOR}"
  sudo apt-get update -qq
  sudo apt-get install -y -qq curl ca-certificates gnupg git
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y -qq nodejs
else
  say "Node $(node -v) is already new enough"
fi

# --- Dependencies -----------------------------------------------------------
say "Installing dependencies"
npm install

# --- Configuration ----------------------------------------------------------
say "Preparing .env"
npm run setup

# --- Database ---------------------------------------------------------------
say "Creating the database"
npm run db:push

if [ "${SEED_DEMO_DATA:-yes}" = "yes" ]; then
  say "Loading demo data"
  npm run db:seed
  warn "Demo accounts share one password that is public in this repository."
  warn "Block or delete them before the site is reachable from the internet."
fi

# --- Build ------------------------------------------------------------------
say "Building for production"
npm run build

# --- Process manager --------------------------------------------------------
# The build is the valuable part and it is already done, so a pm2 problem must
# not take the whole install down with it.
if ! command -v pm2 >/dev/null 2>&1; then
  say "Installing pm2"
  sudo npm install -g pm2 || warn "Could not install pm2."
fi

if command -v pm2 >/dev/null 2>&1; then
  say "Starting the app and the chain watcher"
  pm2 delete escrowbridge escrowbridge-watcher >/dev/null 2>&1 || true
  pm2 start npm --name escrowbridge -- start
  pm2 start npm --name escrowbridge-watcher -- run watcher
  pm2 save
else
  warn "Skipping the process manager. Start it by hand with:"
  warn "    npm start        # the web app"
  warn "    npm run watcher  # the chain watcher, in another terminal"
fi

cat <<'NEXT'

────────────────────────────────────────────────────────────────
 Installed. The app is running on http://127.0.0.1:3000

 Still to do, because each needs a decision from you:

 1. Edit .env and set
       APP_URL="https://your-domain"
       WALLET_PROVIDER="tron"        # never leave this as "mock" in production
    then:  pm2 restart escrowbridge

 2. Put a reverse proxy in front of it and get a certificate, once the
    domain's A record points at this server:
       sudo bash scripts/setup-nginx.sh your-domain

 3. Survive a reboot:
       pm2 startup       # then run the line it prints

 4. Register the first account — it becomes the administrator — and set
    your receiving address under Admin -> Settings.

 Back up .env somewhere off this machine. Without CREDENTIAL_MASTER_KEY
 every stored credential is unreadable for good.
────────────────────────────────────────────────────────────────
NEXT
