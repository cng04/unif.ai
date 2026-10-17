# unif.ai

AI agents represent people, talk to each other, and form small friend groups.

```
client/      Next.js web app: admin setup + invite QR, onboarding, agent playground, agent chat
server/      FastAPI: API routes, join pages, matching pipeline, Ticketmaster / Photon / Browser Use integrations
agent/       Python library (unifai_agent): persona agent + tools, conversation loop, judge, onboarding interviewer
onboarding/  TypeScript chat onboarding bot: iMessage (Photon) + a local HTTP channel for the ASI:One relay
asi-agent/   Python uAgent relay so people can onboard from ASI:One (see asi-agent/SETUP.md)
db/          Postgres schema, migrations + seed (Tiger Data in prod, optional local Docker)
```

## Flow

1. **Admin** creates a universe and shares the invite link / QR code.
2. **Onboarding**: user enters name + social accounts (scraped with Browser Use when `SCRAPE_ENABLED`), pastes
   the output of the self-report prompt from their own AI, and chats with the interviewer agent. The server builds an
   agent profile with `public` (shareable) and `private` (dealbreakers, values, logistics) sections.
   The same flow also runs as a chat: the join page offers iMessage (while Photon seats last) and ASI:One, and the
   `onboarding/` bot writes the profile straight to Postgres.
3. **Matching** (admin-triggered):
   - Gemini reads all onboarding transcripts and picks ~20 keywords. Jev (TypeSafe) then scores each
     person 0-1 on every keyword and flags their dealbreakers and free time (one request per person).
     The k-dim scores are flattened to 3D for the playground view.
   - Pairs with a dealbreaker or availability conflict are dropped. Each person's top 5 remaining
     matches by cosine similarity get an agent-to-agent conversation; Jev judges chemistry (1-10),
     dealbreaker conflicts, and logistics fit.
   - Only judged pairs become edges. CP-SAT forms groups of 4-8 with no conflicting pairs, maximizing
     edge weight, and each group is re-judged as a whole.
   - Ticketmaster events are found for each group's shared interests; members are notified via Photon.

## Setup

Requires Node 20+, Python 3.11+, and [uv](https://docs.astral.sh/uv/) (`brew install uv`).

```bash
# database: point DATABASE_URL at the shared Tiger Data service, then load the schema once
psql "$DATABASE_URL" -f db/schema.sql -f db/seed.sql
# or run it locally: docker compose -f db/docker-compose.yml up -d

# server (http://localhost:8000/docs)
cd server && cp .env.example .env   # fill in DATABASE_URL and either OPENROUTER_API_KEY (alone is enough)
                                       # or GEMINI_API_KEY + TYPESAFE_API_KEY
uv run uvicorn app.main:app --reload

# optional: a fake "UI Demo" universe that looks post-matching; prints a login link for the web app
cd server && uv run python -m scripts.seed_demo

# client (http://localhost:3001)
cd client && npm install && npm run dev

# agent: try one simulated conversation
cd agent && GEMINI_API_KEY=... TYPESAFE_API_KEY=... uv run python scripts/simulate.py
```

Tests: `uv run pytest` in `agent/` and `server/`. DB integration tests (`server/tests/integration/`) are skipped
unless `DATABASE_URL_TEST` points at a throwaway Postgres loaded with `db/schema.sql`; they delete only the
universes they create.

**Windows + OneDrive:** if the repo lives in OneDrive, `uv sync` can fail with hardlink or "Access is denied"
errors. Set `UV_LINK_MODE=copy` and put the virtualenvs outside OneDrive, for example
`UV_PROJECT_ENVIRONMENT=C:\dev-venvs\unifai-server`.
## Run everything with Docker

`docker-compose.yml` + `./run.sh` run Postgres, the server, the onboarding bot and the ASI:One agent (not the
Next.js client) the same way on a laptop or a VM:

```bash
cp server/.env.example server/.env      # likewise onboarding/.env and asi-agent/.env; fill in keys
./run.sh up       # build + start + apply db/migrations
./run.sh tunnel   # free public URL for join pages; set it as PUBLIC_URL in server/.env, then ./run.sh up
./run.sh seed     # load db/seed.sql (demo pool + fake people), testing only
./run.sh logs bot
./run.sh down
```

Only the server needs to be public (join pages, admin); set `ADMIN_PASSWORD` first. The bot and ASI agent make
outbound connections only. Don't run the Docker stack and the dev processes (`npm start`, `uv run agent.py`) at
the same time, or both bots answer every message; `./run.sh up` refuses to start if it finds them.
