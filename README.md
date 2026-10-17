# unif.ai

AI agents represent people, talk to each other, and form small friend groups.

```
client/   Next.js web app: admin setup + invite QR, onboarding, agent playground, agent chat
server/   FastAPI: API routes, matching pipeline, Ticketmaster / Photon / Browser Use integrations
agent/    Python library (unifai_agent): persona agent + tools, conversation loop, judge, onboarding interviewer
db/       Postgres schema + seed (Tiger Data in prod, optional local Docker)
```

## Flow

1. **Admin** creates a universe and shares the invite link / QR code.
2. **Onboarding**: user enters name + social accounts (scraped with Browser Use), pastes the output of
   the self-report prompt from their own AI, and chats with the interviewer agent. The server builds an
   agent profile with `public` (shareable) and `private` (dealbreakers, values, logistics) sections.
3. **Matching** (admin-triggered):
   - Gemini finds k recurring features across all profiles, then scores each person 0-1 per feature.
   - The k-dim scores are flattened to 3D for the playground view.
   - Nearest-neighbor pairs get an agent-to-agent conversation; the judge scores vibe (1-10),
     dealbreaker conflicts, and logistics fit.
   - Verdicts become a weighted graph -> Louvain community detection capped at 4-8 people -> each
     group is re-judged as a whole.
   - Ticketmaster events are found for each group's shared interests; members are notified via Photon.

## Setup

Requires Node 20+, Python 3.11+, and [uv](https://docs.astral.sh/uv/) (`brew install uv`).

```bash
# database: point DATABASE_URL at the shared Tiger Data service, then load the schema once
psql "$DATABASE_URL" -f db/schema.sql -f db/seed.sql
# or run it locally: docker compose -f db/docker-compose.yml up -d

# server (http://localhost:8000/docs)
cd server && cp .env.example .env   # fill in DATABASE_URL, GEMINI_API_KEY, ...
uv run uvicorn app.main:app --reload

# client (http://localhost:3000)
cd client && npm install && npm run dev

# agent: try one simulated conversation
cd agent && GEMINI_API_KEY=... uv run python scripts/simulate.py
```

Tests: `uv run pytest` in `agent/` and `server/`.
