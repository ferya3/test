#!/usr/bin/env bash
# Recode AI — one-shot installer for an Ubuntu server (written for Ubuntu 24.04 / 26.04).
#
#   curl -fsSL https://raw.githubusercontent.com/ferya3/test/claude/quirky-bohr-nrggpp/recode-ai/install.sh | sudo bash
#
# Optional variables (put them after `sudo`, e.g. `| sudo HTTP_PORT=8080 bash`):
#   ANTHROPIC_API_KEY  Claude key; without it the platform runs in offline mode.
#                      Safer: leave it out and add it to /opt/recode-ai/recode-ai/.env later.
#   HTTP_PORT          port nginx listens on (default 80)
#   SANDBOX_MODE       docker (default) builds React projects in throw-away containers; none disables it
#   INSTALL_DIR        where the code goes (default /opt/recode-ai)
#   BRANCH, REPO_URL   source to install from
#
# Running it again updates the code and rebuilds; .env and all data are kept.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/ferya3/test.git}"
BRANCH="${BRANCH:-claude/quirky-bohr-nrggpp}"
INSTALL_DIR="${INSTALL_DIR:-/opt/recode-ai}"
HTTP_PORT="${HTTP_PORT:-80}"
SANDBOX_MODE="${SANDBOX_MODE:-docker}"
APP_DIR="$INSTALL_DIR/recode-ai"

say() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
die() { printf '\033[1;31mError: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root: curl -fsSL <url> | sudo bash"
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  [ "${ID:-}" = "ubuntu" ] || echo "Warning: this installer targets Ubuntu; found ${PRETTY_NAME:-unknown}."
fi
export DEBIAN_FRONTEND=noninteractive

say "Installing base packages"
apt-get update -y
apt-get install -y ca-certificates curl git openssl

say "Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  # Ubuntu's own packages first (available on new releases before Docker's repo is),
  # Docker's convenience script as the fallback.
  apt-get install -y docker.io docker-compose-v2 docker-buildx \
    || apt-get install -y docker.io docker-compose-v2 \
    || curl -fsSL https://get.docker.com | sh
fi
if ! docker compose version >/dev/null 2>&1; then
  apt-get install -y docker-compose-v2 || apt-get install -y docker-compose-plugin \
    || die "Docker Compose v2 could not be installed"
fi
systemctl enable --now docker >/dev/null 2>&1 || service docker start || true
for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
docker info >/dev/null 2>&1 || die "the Docker daemon is not running"

say "Fetching Recode AI ($BRANCH)"
if [ -d "$INSTALL_DIR/.git" ]; then
  git -C "$INSTALL_DIR" fetch --depth 1 origin "$BRANCH"
  git -C "$INSTALL_DIR" checkout -q -B "$BRANCH" FETCH_HEAD
else
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi
cd "$APP_DIR"

set_env() {  # set_env KEY VALUE  (replace or append in .env)
  if grep -qE "^#? ?$1=" .env; then
    sed -i -E "s|^#? ?$1=.*|$1=$2|" .env
  else
    printf '%s=%s\n' "$1" "$2" >> .env
  fi
}

if [ ! -f .env ]; then
  say "Creating .env with random secrets"
  cp .env.example .env
  set_env RECODE_SECRET_KEY "$(openssl rand -hex 32)"
  set_env POSTGRES_PASSWORD "$(openssl rand -hex 16)"
  set_env MINIO_ROOT_PASSWORD "$(openssl rand -hex 16)"
  chmod 600 .env
else
  say "Keeping the existing .env"
fi
[ -n "${ANTHROPIC_API_KEY:-}" ] && set_env ANTHROPIC_API_KEY "$ANTHROPIC_API_KEY"
set_env HTTP_PORT "$HTTP_PORT"
set_env SANDBOX_MODE "$SANDBOX_MODE"
set_env DOCKER_GID "$(stat -c %g /var/run/docker.sock)"

say "Building images (the first build takes several minutes)"
docker compose build
say "Starting the stack"
docker compose up -d --remove-orphans

say "Waiting for the API"
for _ in $(seq 1 90); do
  curl -fsS "http://127.0.0.1:$HTTP_PORT/api/health" >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS "http://127.0.0.1:$HTTP_PORT/api/health" >/dev/null 2>&1 \
  || die "the API did not come up; inspect: cd $APP_DIR && docker compose logs api"

ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
port_suffix=""; [ "$HTTP_PORT" = "80" ] || port_suffix=":$HTTP_PORT"
mode="Claude"; grep -qE '^ANTHROPIC_API_KEY=.+' .env || mode="offline (add ANTHROPIC_API_KEY to .env)"
cat <<EOF

  Recode AI is running:  http://${ip:-<server-ip>}${port_suffix}
  AI mode:               $mode
  Files:                 $APP_DIR   (settings in .env)

  Logs:     cd $APP_DIR && docker compose logs -f api worker-ai
  Restart:  cd $APP_DIR && docker compose up -d
  Update:   run this installer again

EOF
