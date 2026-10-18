# unif.ai

AI agents represent people, interview each other, and sort a pool of people into small friend groups
(3-8) who can then meet in real life.

This README is the canonical overview: what exists, how to run it, and how ready it is. `AGENTS.md` is the
operating guide for AI coding agents (conventions, rules, pipeline internals). `PROGRESS.md` is the live
task board.

Everything below describes the repository as of this commit. Where something is planned rather than built,
it says so.

## Project overview

An **admin** creates a **universe** (a hackathon, a club, a friend-of-friends pool) and shares an invite
link. Each **participant** onboards, which produces a structured agent profile. The admin then starts
matching, and the server finds compatible pairs, has their agents talk, judges the conversations, and
partitions people into groups. 

| Capability                                   | Status                                                                 |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| Universe + invite link                       | Implemented (API, admin web app, join page in the client and as server HTML). No QR code. |
| Onboarding (self-report, interview, profile) | Implemented (API, plus chat bot over iMessage and ASI:One). Profile editing is not built. |
| Admin console                                | Implemented in the client (`/admin`): universes, overview with pipeline strip and run matching, groups, agent world. |
| Social scraping (Browser Use)                | Live when `BROWSER_USE_API_KEY` is set; links are always stored.        |
| AI agent per user                            | Implemented (`PersonaAgent` with tools). Never run at scale.           |
| Candidate matching (keywords, filter, rank)  | Implemented, unit-tested with fakes; never run on a real model.        |
| Agent-to-agent interviews                    | Implemented; capped by turns and a concurrency limit.                  |
| Compatibility judging (pair and group)       | Implemented (pair: Jev; group: LLM).                                   |
| Group formation                              | Implemented (CP-SAT). Quality drops past about 100 people.             |
| Group plans (events)                         | Partial: 3 plans per group from a Browser Use web search (needs `BROWSER_USE_API_KEY`) or Ticketmaster, fitted to shared free time and budget. Tested live once ($0.18 run). No voting yet. |
| Notifications                                | Photon assigns iMessage lines at join and the bot sends each person their `/u/<id>` link. With the Photon keys set, members get a text when matched and when their group locks in a plan; without them, both only log. |
| Web client                                   | Per-user mobile pages (agent, connections with 2D/3D keyword graph, you, pair detail), join page, admin console, 2.5D agent world. |
| Auth, consent, data deletion                 | Only `/admin` basic auth (`ADMIN_PASSWORD`, server and client). Everything else not started. |

## System architecture

```mermaid
flowchart LR
    Client["client/ (Next.js)\n/u, /join, /admin, agent world"] -->|HTTP JSON, server-side| API
    Bot["onboarding/ (TypeScript bot)\niMessage + HTTP channel"] --> DB
    ASI["asi-agent/ (uAgent)\nASI:One relay"] --> Bot
    subgraph Server["server/ (FastAPI)"]
        API["routers/\nuniverses, onboarding, matching, me,\ninvites, admin_api, web (HTML /admin, /join)"] --> Repo["repo.py + psycopg pool\n(raw SQL)"]
        API -->|BackgroundTasks| Pipeline["matching/pipeline.py\nkeywords, scoring, filter, rank,\nCP-SAT groups"]
        Pipeline --> Repo
    end
    Repo --> DB[("Postgres\n(pgvector, pgcrypto)")]
    API --> Agent
    Pipeline --> Agent["agent/ (unifai_agent library)\nPersonaAgent, conversation,\nInterviewer, Judge"]
    Agent --> Gemini["Gemini\n(text)"]
    Agent --> Jev["Jev (TypeSafe)\n(typed scores)"]
    Agent -.->|"OPENROUTER_API_KEY set"| OR["OpenRouter\n(replaces both)"]
    Pipeline --> TM["Ticketmaster\nDiscovery API"]
    Pipeline --> Photon["Photon\n(line assignment; match + plan texts)"]
    API --> BU["Browser Use\n(optional scrape)"]
```

- **Frontend (`client/`)** talks only to the server, never the database, and only from server components and
  server actions (`src/lib/api.ts` is `server-only`, set by `API_URL`). Routes:
  - `/u/[userId]/...`: one participant's view (agent chat, connections with a 2D graph and a three.js 3D
    keyword graph with picked axes, profile, pair transcripts). No login; the id in the link is the identity.
  - `/join/[code]`: the join page (iMessage while Photon seats last, otherwise ASI:One). Served from the client
    when the server's `JOIN_ON_CLIENT` is on; otherwise the server renders its own HTML version.
  - `/admin/...`: the admin console: universes, universe overview (pipeline strip, members, keywords, run
    matching), groups, **add person**
    (`/admin/universes/[universeId]/add`: a ~30s in-person interview by Chrome
    dictation or typing becomes an onboarded agent, for live demos), and the **agent world** (`/admin/universes/[universeId]/world`). Gated by
    `ADMIN_PASSWORD` basic auth in `src/proxy.ts`, and the client forwards the same password to `/admin/api`.
- **Agent world** (`client/src/components/visualizer/`): one explorable, **procedurally generated campus** (PixiJS,
  32x32 pixel-art isometric tiles). Everything comes from one server snapshot (`GET .../world`, polled every ~2 s
  while matching and ~4 s otherwise, with a version cursor) and is built in three separate layers, each pure and unit-tested (`world/`):
  `select.ts` decides which themed structures the universe's keywords justify (one per preset from the library in
  `presets.ts`; at least 2 people must share its keywords; unmatched keywords join the closest crowd or are left
  out; overlapping crowds merge into one open-plan zone; size, decoration and population follow the crowd),
  `plan.ts` lays them out deterministically (seed = universe id + keyword set, so new members never move
  anything; spawn plaza and meeting square always exist; winding paths; trees, lamps and flowers as filler), and
  `scenery.ts` / `engine.ts` render it (drag to pan, wheel or +/- to zoom, follow, A* walking over the plan).
  `activity.ts` derives what each agent does **only from data**: unscored people wait at the spawn plaza
  (thinking while their interview or scoring is running), a pair walks to meet in a shared structure (otherwise
  the square) only while the server has its chat as `running`, and the speaker's sprite shows that turn. Groups
  sit at tables in the structure their members share, and unplaced people sit in the square.
  Completed chats can be re-enacted on request, always labelled (live / completed / replay / historical).
  Clicking an agent follows it and opens a bio card; chats open the transcript (messages only, never notes).
  Admins see everything at `/admin/universes/{id}/world` and can start or abort matching from that screen;
  participants get `/u/{id}/world` (their own agent
  followed) without scores, dealbreakers, judge flags or rationales, and with other people's chats unopenable.
  The admin list separates real universes from demo/test ones (`/admin?mode=demo`); seed demo data with
  `server/scripts/seed_demo.py`, `db/dev_graph_seed.sql` or `server/scripts/seed_synthetic.py --people 50`.
  **Design source:** Paper file "Agent Friend Groups — Screens": "World visualizer" (overlays), "World catalog ·
  single floor" (room ideas; direction, not spec), "Sprites · in-game" (characters, drawn in code in
  `character.ts`; exports in `design/sprites/` and `design/world/`).
- **Onboarding bot (`onboarding/`)** is a TypeScript chat version of onboarding. It runs over iMessage (Photon)
  and a local HTTP channel used by the ASI:One relay (`asi-agent/`, see `asi-agent/SETUP.md`), and writes
  profiles straight to Postgres.
- **Backend (`server/`)** is a single FastAPI app. Handlers use raw SQL through an async psycopg 3 pool.
  Matching runs as a FastAPI background task inside the API process; there is no queue or worker.
- **Agent engine (`agent/`)** is a synchronous Python library. The server calls it through
  `asyncio.to_thread`, with a semaphore capping concurrent conversations.
- **Matching engine (`server/app/matching/`)** is the multi-stage pipeline in
  [Matching pipeline](#matching-pipeline). Gemini writes text; Jev answers typed questions with
  calibrated probabilities. Jev cannot write text.
- **Database** is Postgres with the `vector` and `pgcrypto` extensions. The `embedding` column is unused.

## Technology stack

| Layer      | Technology                                                                                       | Why                                              |
| ---------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Client     | Next.js 16.4, React 19.3, Tailwind 4, TypeScript 5, ESLint 9                                      | Participant, join and admin web UI               |
| 3D graph   | three, @react-three/fiber, @react-three/drei                                                     | Keyword graph on the connections page            |
| Agent world | pixi.js 8, @pixi/react 8, pixi-filters 6, pathfinding (A*)                                       | WebGL sprite world, glow outline, grid routing   |
| QR codes   | qrcode                                                                                           | Add-person screen links the new person to their page |
| Onboarding bot | Node, TypeScript, tsx, `@anthropic-ai/sdk`, `@photon-ai/api`, pg, socket.io-client, zod      | Chat onboarding over iMessage / HTTP             |
| ASI agent  | Python 3.11+, uagents, httpx                                                                      | ASI:One relay to the onboarding bot              |
| Server     | Python 3.11-3.14, FastAPI, uvicorn, pydantic-settings, psycopg 3 (+pool), httpx, numpy, OR-Tools | API, config, raw-SQL access, CP-SAT grouping     |
| Agent lib  | google-genai, pydantic, httpx, typesafe-sdk                                                       | Gemini calls, schemas, Jev client, OpenRouter    |
| Models     | Gemini (`gemini-3.8-flash`), Jev (`jev-latest`), or OpenRouter (Gemini plus `~typesafe/jev-latest`) | Text generation; typed scoring and judging       |
| Database   | Postgres 17 with pgvector and pgcrypto; local image `timescale/timescaledb-ha:pg17`               | Storage. No TimescaleDB-specific features used. |
| Tooling    | uv (Python), npm (client, bot), pytest + pytest-asyncio, Docker Compose                           | Dependencies, tests, full-stack runs             |
| Optional   | browser-use (on with `BROWSER_USE_API_KEY`)                                                                      | Scrape social profiles                           |
| External   | Ticketmaster Discovery API, Photon, Cloudflare tunnel (`./run.sh tunnel`)                         | Events, iMessage, public join URL                |

## Repository structure

```
unif.ai/
├── README.md, AGENTS.md, PROGRESS.md   overview, agent operating guide, task board
├── RUNNING.md                          step-by-step local setup
├── excalidraw_mockup_1.excalidraw      original architecture diagram (product intent, not a spec)
├── docker-compose.yml, run.sh          full stack (db, server, bot, ASI agent, tunnel); deploy/ has the Dockerfiles
├── client/                             Next.js app. Has its own AGENTS.md; read it first.
│   └── src/
│       ├── app/u/, app/join/, app/admin/   participant pages, join page, admin console (+ world/)
│       ├── components/visualizer/      agent world: engine, sprites, scenery, overlays; world/ = presets, selection, layout, activity (+ tests)
│       ├── lib/api.ts                  server-only API client (api, adminApi, joinApi)
│       └── proxy.ts                    basic auth on /admin
├── onboarding/                         TypeScript chat onboarding bot (iMessage via Photon, HTTP channel)
├── asi-agent/                          Python uAgent relay for onboarding from ASI:One (see SETUP.md)
├── db/
│   ├── schema.sql                      full schema (source of truth)
│   ├── migrations/                     idempotent SQL patches for older databases
│   ├── seed.sql                        "LA Hacks Demo" universe (invite code `lahacks`): 40 playful celebrity
│   │                                   profiles in 8 clusters of 5, with interviews and dealbreaker clashes
│   ├── seed_celebrity_encore.sql       Rerunnable second 40-person public-figure demo (invite `encore40`)
│   ├── seed_celebrity_fifteen.sql      Rerunnable 15-person public-figure demo (invite `celeb15`)
│   ├── dev_graph_seed.sql              fake matching output for that universe (scores, pairs, groups); run by hand
│   ├── dev_events_seed.sql             fake plans (3 per group) for groups that have none; run by hand after it
│   └── docker-compose.yml              local Postgres; runs schema + seed on first boot only
├── agent/                              unifai_agent library
│   ├── src/unifai_agent/
│   │   ├── llm.py, openrouter.py       LLM protocol; Gemini and OpenRouter implementations
│   │   ├── jev.py                      Jev protocol; TypeSafe and OpenRouter implementations
│   │   ├── profile.py, prompts.py      AgentProfile (public/private) and all prompts
│   │   ├── persona.py, tools.py        PersonaAgent and its tools
│   │   ├── conversation.py             agent-to-agent loop and Transcript
│   │   ├── judge.py                    pair verdict (Jev), group verdict (LLM)
│   │   └── interviewer.py              onboarding chat and profile builder
│   ├── scripts/simulate.py             one real conversation, printed with its verdict
│   └── tests/                          conversation, judge, jev, llm, openrouter
└── server/
    ├── app/
    │   ├── main.py                     app, CORS, lifespan (DB pool), /health, logging
    │   ├── config.py, deps.py, db.py   settings and validation, model wiring, connection pool
    │   ├── schemas.py, repo.py         API models, shared SQL helpers
    │   ├── routers/                    universes, onboarding, matching, me, invites, admin_api, web
    │   ├── matching/                   pipeline, keywords, scoring, pairing, groups, plans, projection
    │   └── services/                   ticketmaster.py, photon.py, scraper.py + event_search.py (optional)
    ├── scripts/seed_demo.py            fake post-matching "UI Demo" universe
    ├── scripts/seed_synthetic.py       N synthetic people (matched, matching or onboarding) for World/scale tests
    ├── tests/                          test_matching.py, test_plans.py, test_scraper.py, test_event_search.py; integration/ (admin API, /me; need a test DB)
    └── .env.example
```

## Getting started

### Prerequisites

- Python 3.11-3.14 (OR-Tools has no 3.15 wheels), [uv](https://docs.astral.sh/uv/)
- Node 20+ and npm
- Docker, for the local database (or a Postgres instance with `vector` and `pgcrypto` available; the repo is tested against 17)
- At least one model key (see [Environment variables](#environment-variables))

### From a fresh clone

```bash
# 1. Database. schema.sql and seed.sql are applied once, on first boot of the volume.
docker compose -f db/docker-compose.yml up -d
#    Shared instance instead: psql "$DATABASE_URL" -f db/schema.sql -f db/seed.sql

# 2. Server
cd server
cp .env.example .env          # then fill in keys; see the table below
uv sync
uv run uvicorn app.main:app --reload     # http://localhost:8000

#    Optional demo data without running the models:
uv run python -m scripts.seed_demo       # "UI Demo" universe that looks post-matching; prints /u/<id> links
docker exec -i unifai-db psql -U unifai -d unifai < ../db/dev_graph_seed.sql   # fake results for "LA Hacks Demo"
docker exec -i unifai-db psql -U unifai -d unifai < ../db/dev_events_seed.sql  # fake plans for its groups
#    Second unmatched 40-person public-figure pool (safe to re-run):
docker exec -i unifai-db psql -U unifai -d unifai < ../db/seed_celebrity_encore.sql
#    Smaller unmatched 15-person public-figure pool (safe to re-run):
docker exec -i unifai-db psql -U unifai -d unifai < ../db/seed_celebrity_fifteen.sql

# 3. Client (API_URL defaults to http://localhost:8000; set ADMIN_PASSWORD to the server's value if you set one)
cd client && npm install && npm run dev  # http://localhost:3001, admin at /admin

# 4. Try one real agent conversation (needs model keys)
cd agent && uv sync && uv run python scripts/simulate.py
```

- API docs (Swagger): <http://localhost:8000/docs>; OpenAPI JSON: <http://localhost:8000/openapi.json>;
  health check: <http://localhost:8000/health>.
- Stop: `Ctrl+C` for server and client; `docker compose -f db/docker-compose.yml down` for the database.
- Reset the database after a schema change: `docker compose -f db/docker-compose.yml down -v`, then `up -d`.
- Existing databases: apply `db/migrations/*.sql` (`./run.sh migrate`) instead of resetting. See [Database](#database).
- **Windows + OneDrive:** `uv sync` can fail with hardlink or "Access is denied" errors. Set
  `UV_LINK_MODE=copy` and keep the virtualenvs outside OneDrive, for example
  `UV_PROJECT_ENVIRONMENT=C:\dev-venvs\unifai-server`.
- **Windows event loop (known issue):** psycopg's async mode can't use the Proactor loop that uvicorn and
  pytest-asyncio pick on Windows, so the server can't reach the database and DB tests error out. Run the server
  under WSL or Docker (`./run.sh up`), or start uvicorn with a `SelectorEventLoop` until this is fixed in the repo.
- **Stale client cache:** if the dev server keeps an old error after a merge or dependency change (for example
  a `package.json` parse error), stop it and delete `client/.next/dev` and `client/.next/cache`.
- Step-by-step local setup with troubleshooting: `RUNNING.md`.

### Run everything with Docker

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

## Environment variables

All are read by `server/app/config.py` (from the environment or `server/.env`), and `server/.env.example`
lists them. No secret has a default, and `.env` is gitignored. The onboarding bot and ASI agent have their own
`onboarding/.env.example` (including `APP_URL`, the client base for each person's `/u/<id>` link) and
`asi-agent/.env.example`. The client reads three variables of its own: `API_URL` (server base, default
`http://localhost:8000`), `ADMIN_PASSWORD` (gates `/admin` and is forwarded to `/admin/api`), and `APP_URL` (the
public client base the add-person QR code points at; defaults to the host the admin is browsing, which a phone
can't reach if it's `localhost`).

| Variable                | Required                       | Purpose / default                                                                  |
| ----------------------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| `DATABASE_URL`          | Yes                            | Postgres URL. Default `postgresql://unifai:unifai@localhost:5432/unifai` matches the Docker setup. |
| `OPENROUTER_API_KEY`    | One of this or the next pair   | If set, OpenRouter replaces both Gemini and Jev. Enough on its own to run matching. |
| `GEMINI_API_KEY`        | With `TYPESAFE_API_KEY`        | Gemini for text (interviews, chats, keywords, group judge).                        |
| `TYPESAFE_API_KEY`      | With `GEMINI_API_KEY`          | Jev for scores, dealbreakers, availability, pair judge.                            |
| `TICKETMASTER_API_KEY`  | Optional                       | Without it, no events are found.                                                   |
| `PHOTON_API_KEY`, `PHOTON_PROJECT_ID` | Optional         | Both needed to assign iMessage lines at join and to text members when matched and when a plan locks (otherwise those only log). Only reaches people who have texted their line. |
| `PHOTON_SEAT_LIMIT`     | Optional                       | Shared-line seats on the Photon plan, default 10. At the limit, joins go to ASI:One. |
| `ASI_AGENT_URL`, `ASI_AGENT_HANDLE` | Optional           | ASI:One agent chat page and handle shown on the join page (defaults: the team's Agentverse page, `@unifyai-onboarding`). |
| `ADMIN_PASSWORD`        | Before exposing the server     | HTTP basic auth (any username) for the server's `/admin` pages and `/admin/api`. Set the same value in the client. |
| `CLIENT_URL`            | Optional                       | CORS origin and web app base. Default `http://localhost:3001`.                     |
| `PUBLIC_URL`            | Optional                       | Base for invite links (`/join/<code>`, served by this server). Default `http://localhost:8000`. |
| `JOIN_ON_CLIENT`        | Optional                       | Redirect the server's `/join/<code>` to `CLIENT_URL/join/<code>`. Default off (the Docker stack has no client). |
| `BROWSER_USE_API_KEY`                   | Optional       | Scrape stored social links and search the web for group plans with Browser Use Cloud. Without it, plans come from Ticketmaster. |
| `PLANS_MAX_COST_USD`, `PLANS_TIMEOUT_S`, `PLANS_DAYS_AHEAD`, `PLANS_CANDIDATES`, `PLANS_CONCURRENCY` | Optional | Group plan search: defaults 0.30, 300, 14, 6, 4. |
| `SCRAPE_MODEL`, `SCRAPE_MAX_COST_USD`, `SCRAPE_TIMEOUT_S`, `SCRAPE_SKIP_PLATFORMS` | Optional | Defaults `gemini-3-flash`, 0.05, 180, `instagram,tiktok,facebook`. |
| `GEMINI_MODEL`          | Optional                       | Default `gemini-3.8-flash`.                                                        |
| `JEV_MODEL`             | Optional                       | Default `jev-latest`.                                                              |
| `OPENROUTER_MODEL`      | Optional                       | Keywords, interviewer and group judge. Default `google/gemini-2.5-flash-lite`.     |
| `OPENROUTER_CHAT_MODEL` | Optional                       | Persona chats; comma-separate models to rotate pairs across them (each has its own rate limit). Default `openai/gpt-oss-20b,~deepseek/deepseek-v4-flash-latest,z-ai/glm-5.3-flash`. |
| `OPENROUTER_CHAT_TEMPERATURES` | Optional                | One temperature per chat model, or one for all. Default `0.50,0.80,1.05`.          |
| `OPENROUTER_CHAT_TEMPERATURE_JITTER` | Optional           | Uniform ± jitter sampled once per pair and held fixed for all turns. Default `0.08`. |
| `OPENROUTER_CHAT_MAX_TOKENS` | Optional                  | Max output tokens per persona-chat turn (caps OpenRouter in-flight credit reservation). Default `512`. |
| `OPENROUTER_JEV_MODEL`  | Optional                       | Native Jev System One model for scoring and the pair judge; versions can be comma-separated. Default `~typesafe/jev-latest,typesafe/jev-1.14,typesafe/jev-1.13`. |
| `OPENROUTER_RPM`        | Optional                       | Per-model requests per minute; default 0 (unlimited). OpenRouter caps accounts at 20/min per model. |
| `KEYWORD_COUNT`         | Optional                       | Default 20 (allowed 5-50).                                                         |
| `TOP_M`                 | Optional                       | Candidates per person, default 4 (1-20).                                           |
| `MAX_CONVERSATION_TURNS`| Optional                       | Default 6 (4-30).                                                                  |
| `MAX_CONCURRENT_CONVERSATIONS` | Optional                | Default 50 (1-256).                                                                |
| `MIN_GROUP_SIZE` / `MAX_GROUP_SIZE` | Optional           | Defaults 4 and 8; min must not exceed max.                                         |
| `GROUP_SOLVER_SECONDS`  | Optional                       | CP-SAT time limit, default 10 (1-300).                                             |
| `DATABASE_URL_TEST`     | Tests only                     | Throwaway Postgres for `server/tests/integration/`. Tests are skipped without it.  |

Starting a matching run returns 503 unless `OPENROUTER_API_KEY` or `TYPESAFE_API_KEY` is set.

## Backend architecture

- **`main.py`**: creates the app, opens the DB pool in the lifespan, allows CORS from `CLIENT_URL` only, and
  exposes `GET /health` (which does not check the database).
- **`routers/`**: thin HTTP handlers. `universes.py` (create, look up by invite, list users),
  `onboarding.py` (join, social links, self-report, interview, profile), `matching.py` (start, graph, pairs,
  groups), `me.py` (one user's connections, 3D graph and pair detail, for `/u`), `invites.py` (JSON for the
  client's join page), `admin_api.py` (JSON for the client's admin console: universe list and detail, groups with
  `g-01` labels, weakest ties and leftovers), `web.py` (server-rendered `/admin` and `/join/{code}` pages, not in
  the OpenAPI schema; still used by the Docker stack, which doesn't run the client).
- **`schemas.py`**: pydantic API models. `agent/profile.py` holds the profile models shared with the library.
- **`repo.py` and `db.py`**: raw SQL (no ORM) over an `AsyncConnectionPool`. Handlers get a connection from
  `get_conn`.
- **`deps.py`**: builds the cached `LLM`, `Jev`, `Interviewer` and `Judge`, choosing OpenRouter when its key is set.
- **`matching/`**: the pipeline stages described below, orchestrated by `pipeline.run_matching`.
- **`services/`**: Ticketmaster (httpx), Photon (iMessage line assignment and texts), Browser Use
  scraper (optional, run as a background task after join), Browser Use event search for group plans (optional).
- **Authentication and authorization:** only `/admin` and `/admin/api` are protected (basic auth with
  `ADMIN_PASSWORD`; open when unset). Every other JSON route is public, including private profiles, all pairs
  with rationales, and the `/users/{id}/...` views.
- **Error handling**: a failed matching run resets the universe to `onboarding`. Within a run, a failed
  conversation is skipped, a failed scoring call falls back to neutral scores, a failed keyword call ends the
  run, and a failed group review keeps the group unreviewed. Exceptions elsewhere surface as plain 500s.
- **Concurrency**: runs execute in-process. A restart during a run leaves the universe stuck on `matching`
  (no recovery job).

### Matching pipeline

`POST /universes/{id}/matching` claims the universe (409 if already matching) and runs in the background:

1. Clear the universe's old results.
2. **Keywords** (Gemini): `KEYWORD_COUNT` keywords from everyone's profile and interview.
3. **Scores** (Jev, one request per person): a 0-1 score and a dealbreaker flag per keyword, plus free-time slots.
4. **Hard filter**: block pairs with a dealbreaker on the other's high-scoring keyword or no overlapping availability.
5. **Rank**: cosine similarity, giving each person up to `TOP_M` outgoing proposals. A small solve maximizes
   filled proposal slots first and similarity second; reciprocal proposals become one chat and the rejected direction
   goes to a next-best person. Incoming proposals do not count against the cap.
6. **Chat and judge**: only candidate pairs get an agent conversation, then a Jev verdict (vibe 1-10, logistics, dealbreakers).
7. **Groups** (CP-SAT): groups of 3-8 with no forbidden pair; place as many as possible, then maximize judged edge weight. Unplaced people are left out.
8. **Group review** (Gemini) may drop one misfit; then events are looked up and members notified.

Cost is bounded: at most `n * TOP_M` conversations (not n²), each with `MAX_CONVERSATION_TURNS` turns.
Details, failure behavior and the known scaling issue are in `AGENTS.md`.

## API documentation

Generated docs: <http://localhost:8000/docs>. Only `/admin/api/*` requires authentication.

| Method and path                         | Purpose                                                              |
| --------------------------------------- | -------------------------------------------------------------------- |
| `GET /health`                           | Liveness check                                                       |
| `POST /universes`                       | Create a universe; returns the invite code and `invite_url`          |
| `GET /universes/by-invite/{code}`       | Look up a universe from an invite code                               |
| `GET /universes/{id}`                   | Universe and its status                                              |
| `GET /universes/{id}/users`             | List participants                                                    |
| `GET /onboarding/prompt`                | The self-report prompt users run in their own AI                     |
| `POST /universes/{id}/users`            | Join a universe (starts optional scraping in the background)         |
| `POST /users/{id}/social-links`         | Store social links (scraped when `BROWSER_USE_API_KEY` is set)      |
| `POST /users/{id}/self-report`          | Save the pasted self-report                                          |
| `GET`/`POST /users/{id}/interview`      | Read the transcript / send a message and get the interviewer's reply |
| `POST /users/{id}/profile`              | Build the agent profile from all sources                             |
| `GET /users/{id}/profile`               | Read the profile (includes `private`; see gaps)                      |
| `POST /universes/{id}/matching`         | Start matching (202; 409 if running; 503 without a model key)        |
| `POST /admin/api/universes/{id}/matching/abort` | Admin only: stop a run, drop its partial pairs and groups, back to `onboarding` (409 if not matching) |
| `GET /admin/api/universes/{id}/chats/stream` | Admin-only SSE stream of every public agent message in the current run; resumable with `Last-Event-ID`, never includes private notes |
| `GET /universes/{id}/graph`             | 3D projected keyword scores per user, with group id                  |
| `GET /universes/{id}/pairs`             | Judged pairs with scores and rationale                               |
| `GET /pairs/{id}/messages`              | Pair transcript (messages only; private notes are hidden)            |
| `GET /universes/{id}/groups`            | Groups with members, score, rationale, plans status and up to 3 plans |
| `POST /groups/{id}/plans`               | Re-run the plan search for one group (202; no notification). Should be admin-only once auth exists |
| `GET /users/{id}/connections`           | One user's group and pairs; others as anonymous ids, no rationales   |
| `GET /users/{id}/graph?axes=a,b,c`      | Everyone in 3D by keyword scores (PCA, or 3 picked keywords), named like `/connections` |
| `GET /users/{id}/pairs/{pair_id}`       | One of the user's pairs, for the pair detail page                    |
| `GET /users/{id}/group`                 | The user's group for the group screens: members, shared keywords, public intros, plans and votes; 404 until placed |
| `PUT`/`DELETE /users/{id}/plans/{event_id}/vote` | "I'm in" on a group plan, or take it back. A majority locks the plan and texts the group; 409 once another plan is locked |
| `GET /invites/{code}`                   | Join page data: universe name, whether open, iMessage availability, ASI:One handle |
| `POST /invites/{code}/join`             | Join from the client's join page (name, phone, consent)              |
| `GET`/`POST /admin/api/universes`       | List universes with member/onboarded/group counts / create one (basic auth) |
| `GET /admin/api/universes/{id}`         | Overview: stats, members with onboarding status, keywords (basic auth) |
| `GET /admin/api/universes/{id}/groups`  | Groups with labels and weakest tie, plus leftovers (basic auth)      |
| `GET /admin/api/universes/{id}/world?since=` | World snapshot for the agent world: members (onboarding/busy, public fields, top keywords, scores), keywords with crowd sizes, pairs (`running`/`complete`, plus the latest public line while running), groups, matching stage; `{unchanged: true}` when `since` matches (basic auth) |
| `GET /users/{id}/world?since=`          | The same World as that participant may see it: no scores, dealbreakers, flags or rationales; other people's pairs without ids, verdicts, or the live line |
| `GET /admin/api/universes?mode=real\|demo\|all` | Universe list filtered by `is_demo` (basic auth) |
| `POST /admin/api/universes/{id}/people` | Add someone interviewed in person: name, notes, optional phone/email/socials, `scrape_consent`. Builds and saves the profile, returns the public part only (basic auth; 409 while matching) |
| `GET /admin/api/users/{id}/public`      | Public profile plus which socials have been scraped, for the add-person screen (basic auth) |
| `DELETE /admin/api/users/{id}`          | Remove a person and everything that cascades from them (basic auth; 409 while matching) |
| `GET /admin/api/universes/{id}/scores`  | Keyword vectors for the agent world: per member, score per keyword and the keywords flagged as dealbreakers (basic auth; no private text) |

HTML pages (not in `/docs`): `GET /admin`, `POST /admin/universes`, `GET /admin/universes/{id}` (basic auth),
and `GET`/`POST /join/{code}` (public join form; offers iMessage while Photon seats last, and ASI:One;
redirects to the client when `JOIN_ON_CLIENT` is on).

There is no progress endpoint, profile edit endpoint, consent or deletion endpoint, or notifications endpoint.

## Database

Postgres with `vector` and `pgcrypto`; `db/schema.sql` is the source of truth.

- **Entities**: `universes` -> `users` -> `agent_profiles` (public, private, raw sources, availability) and
  `onboarding_messages`; `keywords` -> `keyword_scores` (per user: score, dealbreaker); `pairs` ->
  `pair_messages` (kind `message` or `note`); `groups` -> `group_members` and `events`.
- **Cascade**: everything hangs off `universes` with `ON DELETE CASCADE`, so deleting a universe removes its data.
- **Pairs** store users sorted (`user_a < user_b`).
- **Migrations: plain SQL patches only.** `db/docker-compose.yml` applies `schema.sql` and `seed.sql` only on
  first boot. `db/migrations/*.sql` are idempotent patches for databases created before a schema change
  (`./run.sh migrate`, also run by `./run.sh up`); `schema.sql` already includes them. There is no migration
  tool or version tracking; that is an open decision.
- **Persistence**: local data lives in the `pgdata` Docker volume.
- **Seed data**: `seed.sql` creates the `lahacks` universe with 40 playful celebrity profiles (built from public
  personas, not real data) in 8 clusters, with deliberate dealbreaker clashes. `seed_celebrity_encore.sql`
  creates a separate, rerunnable 40-person pool of different real public figures (`encore40`); its profiles and
  logistics are explicitly fictional demo sketches, not claims about private lives. `seed_celebrity_fifteen.sql`
  creates a separate rerunnable 15-person pool (`celeb15`) for shorter live matching runs. `dev_graph_seed.sql`
  adds fake matching output for `lahacks` so `/graph`, `/pairs` and `/groups` have data;
  `server/scripts/seed_demo.py` builds a separate post-matching "UI Demo" universe (invite `ui-demo`).
- **Unused**: `agent_profiles.embedding` (vector(768)).

## Testing

```bash
cd server && uv run pytest   # 70 tests; 23 need DATABASE_URL_TEST
cd agent  && uv run pytest                  # 13 tests
cd client && npm run lint && npm run build && npm test   # npm test: Vitest unit tests for World generation
cd onboarding && npm test
```

- **Unit** (all with fake models; no network): hard filter, ranking, scoring, CP-SAT groups, projection, group
  review fallback, Photon sending (mock HTTP), scraper (server); conversation loop, judge, Jev, LLM and OpenRouter clients (agent).
- **Integration** (`server/tests/integration/`, skipped without `DATABASE_URL_TEST`): the admin API and the
  `/users/{id}/...` views (only my pairs, no notes or private fields, 404 for non-members, graph naming), each
  against a throwaway universe, plus the World snapshot (admin vs participant fields, live chat lifecycle, stage,
  demo/real). Point `DATABASE_URL_TEST` at a separate database with `schema.sql` applied.
- **Gaps**: no tests for the HTTP onboarding routes, interviewer, Ticketmaster or the full pipeline; nothing has
  run against real Gemini, Jev or OpenRouter at scale; no CI or linter for Python. The client has Vitest unit tests for World generation (`npm test`: selection,
  layout navigability over many seeds and stability, activity/provenance, fixtures captured from the seeded
  universes) and a browser check, `client/scripts/world-check.mjs` (headless Edge via `puppeteer-core`, installed
  with `--no-save`; see its header), which uses the dev-only `window.__unifaiWorld.snapshot()` hook.

## Deployment

Not production-ready. What exists:

- `db/docker-compose.yml` for local Postgres only. A health endpoint (`GET /health`, no DB check).
- Root `docker-compose.yml` + `run.sh` with Dockerfiles in `deploy/` for the server, onboarding bot and ASI agent,
  plus an optional Cloudflare quick tunnel. See [Run everything with Docker](#run-everything-with-docker).
- Start command: `uv run uvicorn app.main:app --host 0.0.0.0 --port 8000`.

Missing: a client Dockerfile (so Docker deployments use the server's HTML admin and join pages), CI, a real
migration tool, authentication and authorization beyond `/admin`, rate
limiting, secrets management, a job queue (runs die with the process), progress reporting, structured
logging and metrics, and a deployed environment. The shared database is intended to be Tiger Data. Three
scripts in `db/` work on it, reading `TIGER_DATABASE_URL` from the environment or `db/.env` and running `psql`
inside the local DB container (so the local DB must be up):

- `db/migrate-tiger.sh [file ...]`: applies `db/migrations/*.sql` (or the named files), one transaction each.
- `db/tiger-sql.sh`: opens a `psql` shell on Tiger; with `-c "SQL"` or a `.sql` file it shows a rolled-back dry
  run, then applies the SQL in one transaction once you type `commit`.
- `db/push-to-tiger.sh`: replaces all app tables on Tiger with a copy of your local Docker database (asks for
  confirmation; one transaction). Only for demo data: it deletes whatever real users are there.

## Current development status

| Component                       | Implemented | Partial                                  | Planned                          | Blocked / needs decision                    |
| ------------------------------- | :---------: | ---------------------------------------- | -------------------------------- | ------------------------------------------- |
| Universes + invites             | API, admin console, `/join` (client + server) | No QR; one shared admin password | QR code, per-admin ownership | Auth model                    |
| Onboarding                      | API, chat bot (iMessage, ASI:One) | Scraping off by default | Profile review/edit              | Consent flow, scrape sources                |
| Agent persona + conversation    | Library     | `ask_my_human` is a stub                 | Server-side private-data check   |                                             |
| Pair/group judging              | Yes         | Group judge untested at scale            |                                  |                                             |
| Keywords, scoring, filter, rank | Yes         | Never run on a real model                | Over-blocking tuning (#17)       |                                             |
| Group formation                 | CP-SAT      | Weak at 100+ people                      | Greedy warm start; unplaced list |                                             |
| Group plans                     | Browser Use search, Ticketmaster fallback; majority vote locks one | Never run end to end | Live refresh, "other times" |                                             |
| Notifications                   | Match + plan-locked texts via Photon | Not yet sent to a real phone | Group chat |                                             |
| Auth / consent / deletion       |             | `/admin` basic auth                      | All                              | Auth approach; retention policy             |
| Database / migrations           | Schema+seed | Idempotent SQL patches                   | Migration tool                   | Which tool                                  |
| Client                          | `/u` pages with 3D graph, join, admin, agent world (#51) | No automated client tests in CI | Client tests           | Login                                       |
| Deployment / CI                 | Docker Compose stack | No client image                 | CI, deploy                       | Hosting target                              |

## Roadmap

Backend foundation first, then advanced AI features. Task numbers refer to `PROGRESS.md`.

1. **Run what exists**: start the DB, run the seed through the full pipeline on a real model (#8), and record
   time, failures and group sizes. Everything else depends on these numbers.
2. **Backend gaps for the demo**: matching progress (#29), skip incomplete profiles (#22), show unplaced
   people (#15), city-aware events (#28), fixture of a finished run (#43).
3. **Test and tooling foundation**: more API tests with a test DB, the Windows event-loop fix, ruff, CI, a
   migration tool.
4. **Client**: finish #6 (QR code), client tests, a client Dockerfile, then deployment (#44) once the API is stable.
5. **Trust and safety**: auth, consent, data deletion, server-side private-data check, prompt-injection hardening.
6. **Scale and quality**: greedy warm start for grouping, over-blocking tuning, evaluation of match quality.
