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
#   ./run.sh seed      load db/seed.sql: demo pool + 30 fake people (testing only)
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
  *) sed -n '2,10p' "$0" ;;
esac
