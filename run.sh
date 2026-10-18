#!/usr/bin/env bash
# One entry point for the whole stack (Postgres, server, onboarding bot, ASI:One agent).
# Works the same on a laptop or a VM. Needs Docker (OrbStack/Docker Desktop locally).
#
#   ./run.sh up        build + start everything, apply migrations, show status
#   ./run.sh down      stop everything (data is kept)
#   ./run.sh status    what's running
#   ./run.sh logs [service]   follow logs (server | bot | asi-agent | db)
#   ./run.sh migrate   apply db/migrations/*.sql (safe to re-run)
#   ./run.sh tunnel    free public HTTPS URL for the server via Cloudflare (no domain needed)
#   ./run.sh seed      load db/seed.sql: demo pool + 40 celebrity profiles (testing only)
#
# Bot + ASI agent only, when the server and database run elsewhere (FastAPI Cloud + Tiger):
#   ./run.sh bots          start them, using the database/server URLs in onboarding/.env
#   ./run.sh bots-down     stop them (chat sessions are kept)
#   ./run.sh bots-logs     follow their logs
#
# Moving them to another machine (e.g. a cloud VM) without restarting anyone's chat:
#   ./run.sh bots-bundle   pack the code + .env files they need into unifai-bots.tgz
#   ./run.sh bots-export   after bots-down: pack their chat sessions + Photon cursor into bot-data.tgz
#   (on the new machine, ./run.sh bots restores bot-data.tgz if it's next to run.sh)
set -euo pipefail
cd "$(dirname "$0")"

compose() { docker compose "$@"; }

check_env() {
  local missing=0
  for f in server/.env onboarding/.env asi-agent/.env; do
    if [ ! -f "$f" ]; then
      echo "missing $f (copy ${f}.example and fill it in)"
      missing=1
    fi
  done
  [ "$missing" = 0 ] || exit 1
}

warn_native() {
  # A second bot or ASI agent with the same keys would double-reply to everyone.
  if pgrep -f "onboarding/node_modules/.bin/tsx" >/dev/null || pgrep -f "asi-agent/.venv/bin/python.*agent.py" >/dev/null || pgrep -f "uv run --env-file .env agent.py" >/dev/null; then
    echo "⚠️  A bot or ASI agent is already running outside Docker. Stop it first (Ctrl+C in its terminal),"
    echo "   or both copies will answer every message."
    exit 1
  fi
}

migrate() {
  for f in db/migrations/*.sql; do
    [ -e "$f" ] || continue
    echo "applying $f"
    compose exec -T db psql -U unifai -d unifai -v ON_ERROR_STOP=1 -q < "$f"
  done
}

bots() { docker compose -f deploy/bots.compose.yml "$@"; }

# Read one KEY=value from an env file (no shell evaluation of the file).
env_value() { { grep -E "^$2=" "$1" || true; } | tail -1 | cut -d= -f2-; }

check_bots_env() {
  for f in onboarding/.env asi-agent/.env; do
    [ -f "$f" ] || { echo "missing $f (copy ${f}.example and fill it in)"; exit 1; }
  done
  local db server
  db=$(env_value onboarding/.env DATABASE_URL)
  server=$(env_value onboarding/.env SERVER_URL)
  # Inside the container, localhost is the container itself, so these must be real hosts.
  case "$db" in ""|*localhost*|*127.0.0.1*) echo "onboarding/.env: set DATABASE_URL to the production database (Tiger)"; exit 1 ;; esac
  case "$server" in ""|*localhost*|*127.0.0.1*) echo "onboarding/.env: set SERVER_URL to the deployed FastAPI URL"; exit 1 ;; esac
  [ -n "$(env_value onboarding/.env DEFAULT_UNIVERSE_ID)" ] || echo "note: DEFAULT_UNIVERSE_ID is unset, so people who text without an invite code fall back to the demo universe id"
}

cmd="${1:-help}"
case "$cmd" in
  up)
    check_env
    warn_native
    compose up -d --build db server bot asi-agent
    echo "waiting for the database…"
    until compose exec -T db pg_isready -U unifai -d unifai >/dev/null 2>&1; do sleep 1; done
    migrate
    compose ps
    echo
    echo "server: http://localhost:${SERVER_PORT:-8000}/admin"
    echo "next:   ./run.sh tunnel   (public URL for join links), ./run.sh logs bot"
    ;;
  down) compose --profile tunnel down ;;
  status) compose ps ;;
  logs) shift; compose logs -f --tail=100 "$@" ;;
  migrate) migrate ;;
  seed)
    compose exec -T db psql -U unifai -d unifai -v ON_ERROR_STOP=1 -q < db/seed.sql
    echo "loaded demo pool + fake profiles from db/seed.sql"
    ;;
  tunnel)
    compose --profile tunnel up -d tunnel
    echo "waiting for the public URL…"
    for _ in $(seq 1 30); do
      url=$(compose logs tunnel 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1 || true)
      [ -n "$url" ] && break
      sleep 1
    done
    if [ -z "${url:-}" ]; then echo "no URL yet; check ./run.sh logs tunnel"; exit 1; fi
    echo "public URL: $url"
    echo "Set PUBLIC_URL=$url in server/.env and run ./run.sh up so invite links use it."
    echo "(Quick tunnels get a new URL each time they start.)"
    ;;
  bots)
    check_bots_env
    warn_native
    if compose ps --status running --services 2>/dev/null | grep -qE "^(bot|asi-agent)$"; then
      echo "⚠️  The full local stack's bot is running (./run.sh up). Stop it with ./run.sh down first."
      exit 1
    fi
    bots create --build
    if [ -f bot-data.tgz ]; then
      # Carry over chats and the Photon cursor from the old machine before the bot first connects.
      docker run --rm -v unifai-bots_botdata:/data -v "$PWD":/in alpine sh -c 'tar xzf /in/bot-data.tgz -C /data'
      mv bot-data.tgz bot-data.tgz.imported
      echo "restored chat sessions + Photon cursor from bot-data.tgz"
    fi
    bots up -d
    bots ps
    echo
    echo "next: ./run.sh bots-logs   (look for '[photon] subscribed' and the agent's mailbox registration)"
    ;;
  bots-down) bots down ;;
  bots-bundle)
    # Everything deploy/bots.compose.yml builds from, plus the two .env files (secrets: keep the bundle private).
    # macOS tar otherwise adds Apple-only metadata that Linux tar warns about ("unknown extended header keyword").
    COPYFILE_DISABLE=1 tar --no-xattrs --no-mac-metadata -czf unifai-bots.tgz run.sh docker-compose.yml deploy \
      onboarding/package.json onboarding/package-lock.json onboarding/tsconfig.json onboarding/src onboarding/scripts onboarding/.env \
      asi-agent/pyproject.toml asi-agent/uv.lock asi-agent/agent.py asi-agent/connect.py asi-agent/README.md asi-agent/.env
    echo "wrote unifai-bots.tgz ($(du -h unifai-bots.tgz | cut -f1)); it contains your .env secrets"
    ;;
  bots-export)
    if bots ps --status running --services 2>/dev/null | grep -q "^bot$"; then
      echo "stop the bot first (./run.sh bots-down) so the export has its final state"; exit 1
    fi
    docker run --rm -v unifai-bots_botdata:/data -v "$PWD":/out alpine tar czf /out/bot-data.tgz -C /data .
    echo "wrote bot-data.tgz: copy it next to run.sh on the new machine, then run ./run.sh bots there"
    ;;
  bots-logs) shift; bots logs -f --tail=100 "$@" ;;
  *) sed -n '2,15p' "$0" ;;
esac
