# unif.ai

AI agents represent people, interview each other, and sort a pool of people into small friend groups
(4-8) who can then meet in real life.

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
| Universe + invite link                       | Implemented (API). No QR code or UI yet.                               |
| Onboarding (self-report, interview, profile) | Implemented (API), untested end to end. Profile editing is not built.  |
| Social scraping (Browser Use)                | Partial: optional extra, never run end to end.                         |
| AI agent per user                            | Implemented (`PersonaAgent` with tools). Never run at scale.           |
| Candidate matching (keywords, filter, rank)  | Implemented, unit-tested with fakes; never run on a real model.        |
| Agent-to-agent interviews                    | Implemented; capped by turns and a concurrency limit.                  |
| Compatibility judging (pair and group)       | Implemented (pair: Jev; group: LLM).                                   |
| Group formation                              | Implemented (CP-SAT). Quality drops past about 100 people.             |
| Real-world events                            | Partial: Ticketmaster lookup works if a key is set; no city filter.    |
| Notifications                                | Stub: Photon only logs.                                                |
| Web client                                   | Skeleton: the default Next.js scaffold, no pages.                      |
| Auth, consent, data deletion                 | Not started.                                                           |

## System architecture

```mermaid
flowchart LR
    Client["client/ (Next.js)\nskeleton only"] -->|HTTP JSON| API
    subgraph Server["server/ (FastAPI)"]
        API["routers/\nuniverses, onboarding, matching"] --> Repo["repo.py + psycopg pool\n(raw SQL)"]
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
    Pipeline --> Photon["Photon (stub)"]
    API --> BU["Browser Use\n(optional scrape)"]
```

- **Frontend (`client/`)** talks only to the server, never the database. Only the create-next-app scaffold
  exists today.
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
| Client     | Next.js 16.4, React 19.3, Tailwind 4, TypeScript 5, ESLint 9                                      | Web UI (scaffold only)                           |
| Server     | Python 3.11-3.14, FastAPI, uvicorn, pydantic-settings, psycopg 3 (+pool), httpx, numpy, OR-Tools | API, config, raw-SQL access, CP-SAT grouping     |
| Agent lib  | google-genai, pydantic, httpx, typesafe-sdk                                                       | Gemini calls, schemas, Jev client, OpenRouter    |
| Models     | Gemini (`gemini-3.8-flash` by default), Jev (`jev-latest`), or OpenRouter (`google/gemini-3.8-flash`) | Text generation; typed scoring and judging       |
| Database   | Postgres 17 with pgvector and pgcrypto; local image `timescale/timescaledb-ha:pg17`               | Storage. No TimescaleDB-specific features used. |
| Tooling    | uv (Python), npm (client), pytest + pytest-asyncio                                                | Dependencies and tests                           |
| Optional   | browser-use (`scrape` extra)                                                                      | Scrape social profiles                           |
| External   | Ticketmaster Discovery API, Photon (stub)                                                         | Events, notifications                            |

## Repository structure

```
unif.ai/
├── README.md, AGENTS.md, PROGRESS.md   overview, agent operating guide, task board
├── excalidraw_mockup_1.excalidraw      original architecture diagram (product intent, not a spec)
├── client/                             Next.js app (scaffold). Has its own AGENTS.md; read it first.
├── db/
│   ├── schema.sql                      full schema (no migrations)
│   ├── seed.sql                        "LA Hacks Demo" universe (invite code `lahacks`), 30 fake people with
│   │                                   profiles and interview transcripts
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
│   └── tests/                          conversation, judge, jev, llm
└── server/
    ├── app/
    │   ├── main.py                     app, CORS, lifespan (DB pool), /health, logging
    │   ├── config.py, deps.py, db.py   settings and validation, model wiring, connection pool
    │   ├── schemas.py, repo.py         API models, shared SQL helpers
    │   ├── routers/                    universes.py, onboarding.py, matching.py
    │   ├── matching/                   pipeline, keywords, scoring, pairing, groups, projection
    │   └── services/                   ticketmaster.py, photon.py (stub), scraper.py (optional)
    ├── tests/                          test_matching.py; integration/ (skipped without a test DB)
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
# 1. Database. There are no migrations: the schema is applied once, on first boot.
docker compose -f db/docker-compose.yml up -d
#    Shared instance instead: psql "$DATABASE_URL" -f db/schema.sql -f db/seed.sql

# 2. Server
cd server
cp .env.example .env          # then fill in keys; see the table below
uv sync                       # add `--extra scrape` for Browser Use
uv run uvicorn app.main:app --reload     # http://localhost:8000

# 3. Client (optional; only a scaffold today)
cd client && npm install && npm run dev  # http://localhost:3001

# 4. Try one real agent conversation (needs model keys)
cd agent && uv sync && uv run python scripts/simulate.py
```

- API docs (Swagger): <http://localhost:8000/docs>; OpenAPI JSON: <http://localhost:8000/openapi.json>;
  health check: <http://localhost:8000/health>.
- Stop: `Ctrl+C` for server and client; `docker compose -f db/docker-compose.yml down` for the database.
- Reset the database after a schema change: `docker compose -f db/docker-compose.yml down -v`, then `up -d`.
- "Running migrations" means resetting the database as above. See [Database](#database).
- **Windows + OneDrive:** `uv sync` can fail with hardlink or "Access is denied" errors. Set
  `UV_LINK_MODE=copy` and keep the virtualenvs outside OneDrive, for example
  `UV_PROJECT_ENVIRONMENT=C:\dev-venvs\unifai-server`.

## Environment variables

All are read by `server/app/config.py` (from the environment or `server/.env`). `server/.env.example` lists
the first group. No secret has a default, and `.env` is gitignored.

| Variable                | Required                       | Purpose / default                                                                  |
| ----------------------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| `DATABASE_URL`          | Yes                            | Postgres URL. Default `postgresql://unifai:unifai@localhost:5432/unifai` matches the Docker setup. |
| `OPENROUTER_API_KEY`    | One of this or the next pair   | If set, OpenRouter replaces both Gemini and Jev. Enough on its own to run matching. |
| `GEMINI_API_KEY`        | With `TYPESAFE_API_KEY`        | Gemini for text (interviews, chats, keywords, group judge).                        |
| `TYPESAFE_API_KEY`      | With `GEMINI_API_KEY`          | Jev for scores, dealbreakers, availability, pair judge.                            |
| `TICKETMASTER_API_KEY`  | Optional                       | Without it, no events are found.                                                   |
| `PHOTON_API_KEY`        | Optional                       | Notifications are a stub that only logs, with or without a key.                    |
| `CLIENT_URL`            | Optional                       | CORS origin and invite-link base. Default `http://localhost:3001`.                 |
| `GEMINI_MODEL`          | Optional                       | Default `gemini-3.8-flash`.                                                        |
| `JEV_MODEL`             | Optional                       | Default `jev-latest`.                                                              |
| `OPENROUTER_MODEL`      | Optional                       | Default `google/gemini-3.8-flash`.                                                 |
| `KEYWORD_COUNT`         | Optional                       | Default 20 (allowed 5-50).                                                         |
| `TOP_M`                 | Optional                       | Candidates per person, default 5 (1-20).                                           |
| `MAX_CONVERSATION_TURNS`| Optional                       | Default 12 (4-30).                                                                 |
| `MAX_CONCURRENT_CONVERSATIONS` | Optional                | Default 8 (1-32).                                                                  |
| `MIN_GROUP_SIZE` / `MAX_GROUP_SIZE` | Optional           | Defaults 4 and 8; min must not exceed max.                                         |
| `GROUP_SOLVER_SECONDS`  | Optional                       | CP-SAT time limit, default 10 (1-300).                                             |
| `DATABASE_URL_TEST`     | Tests only                     | Throwaway Postgres for `server/tests/integration/`. Tests are skipped without it.  |

Starting a matching run returns 503 unless `OPENROUTER_API_KEY` or `TYPESAFE_API_KEY` is set.

## Backend architecture

- **`main.py`**: creates the app, opens the DB pool in the lifespan, allows CORS from `CLIENT_URL` only, and
  exposes `GET /health` (which does not check the database).
- **`routers/`**: thin HTTP handlers. `universes.py` (create, look up by invite, list users),
  `onboarding.py` (join, self-report, interview, profile), `matching.py` (start, graph, pairs, groups).
- **`schemas.py`**: pydantic API models. `agent/profile.py` holds the profile models shared with the library.
- **`repo.py` and `db.py`**: raw SQL (no ORM) over an `AsyncConnectionPool`. Handlers get a connection from
  `get_conn`.
- **`deps.py`**: builds the cached `LLM`, `Jev`, `Interviewer` and `Judge`, choosing OpenRouter when its key is set.
- **`matching/`**: the pipeline stages described below, orchestrated by `pipeline.run_matching`.
- **`services/`**: Ticketmaster (httpx), Photon (stub), Browser Use scraper (optional, run as a background task after join).
- **Authentication and authorization: none.** Every route is public, including private profiles. Admin
  actions are not restricted.
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
5. **Rank**: cosine similarity, each person's top `TOP_M` unblocked candidates.
6. **Chat and judge**: only candidate pairs get an agent conversation, then a Jev verdict (vibe 1-10, logistics, dealbreakers).
7. **Groups** (CP-SAT): groups of 4-8 with no forbidden pair; place as many as possible, then maximize judged edge weight. Unplaced people are left out.
8. **Group review** (Gemini) may drop one misfit; then events are looked up and members notified.

Cost is bounded: at most about `n * TOP_M` conversations (not n²), each at most `MAX_CONVERSATION_TURNS` turns.
Details, failure behavior and the known scaling issue are in `AGENTS.md`.

## API documentation

Generated docs: <http://localhost:8000/docs>. No endpoint requires authentication.

| Method and path                         | Purpose                                                              |
| --------------------------------------- | -------------------------------------------------------------------- |
| `GET /health`                           | Liveness check                                                       |
| `POST /universes`                       | Create a universe; returns the invite code and `invite_url`          |
| `GET /universes/by-invite/{code}`       | Look up a universe from an invite code                               |
| `GET /universes/{id}`                   | Universe and its status                                              |
| `GET /universes/{id}/users`             | List participants                                                    |
| `GET /onboarding/prompt`                | The self-report prompt users run in their own AI                     |
| `POST /universes/{id}/users`            | Join a universe (starts optional scraping in the background)         |
| `POST /users/{id}/self-report`          | Save the pasted self-report                                          |
| `GET`/`POST /users/{id}/interview`      | Read the transcript / send a message and get the interviewer's reply |
| `POST /users/{id}/profile`              | Build the agent profile from all sources                             |
| `GET /users/{id}/profile`               | Read the profile (includes `private`; see gaps)                      |
| `POST /universes/{id}/matching`         | Start matching (202; 409 if running; 503 without a model key)        |
| `GET /universes/{id}/graph`             | 3D projected keyword scores per user, with group id                  |
| `GET /universes/{id}/pairs`             | Judged pairs with scores and rationale                               |
| `GET /pairs/{id}/messages`              | Pair transcript (messages only; private notes are hidden)            |
| `GET /universes/{id}/groups`            | Groups with members, score, rationale and events                     |

There is no progress endpoint, profile edit endpoint, consent or deletion endpoint, or notifications endpoint.

## Database

Postgres with `vector` and `pgcrypto`; `db/schema.sql` is the source of truth.

- **Entities**: `universes` -> `users` -> `agent_profiles` (public, private, raw sources, availability) and
  `onboarding_messages`; `keywords` -> `keyword_scores` (per user: score, dealbreaker); `pairs` ->
  `pair_messages` (kind `message` or `note`); `groups` -> `group_members` and `events`.
- **Cascade**: everything hangs off `universes` with `ON DELETE CASCADE`, so deleting a universe removes its data.
- **Pairs** store users sorted (`user_a < user_b`).
- **Migrations: none.** `db/docker-compose.yml` applies `schema.sql` and `seed.sql` only on first boot. Changing
  the schema means `down -v` locally, or re-applying by hand on a shared instance. A migration tool is an open decision.
- **Persistence**: local data lives in the `pgdata` Docker volume.
- **Seed data**: the `lahacks` universe with 30 fake people in clusters, with deliberate dealbreaker clashes.
- **Unused**: `agent_profiles.embedding` (vector(768)).

## Testing

```bash
cd server && uv run pytest     # 15 tests
cd agent  && uv run pytest     # 8 tests
cd client && npm run lint && npm run build
```

- **Unit** (all with fake models; no network): hard filter, ranking, scoring, CP-SAT groups, projection, group
  review fallback, Photon stub (server); conversation loop, judge, Jev and LLM clients (agent).
- **Integration**: `server/tests/integration/` has fixtures only (a throwaway universe) and no tests yet. They are
  skipped without `DATABASE_URL_TEST`.
- **Gaps**: no API-level tests, no tests for onboarding, interviewer, scraper, Ticketmaster or the full
  pipeline; nothing has run against real Gemini, Jev or OpenRouter at scale; no client tests; no CI or linter
  for Python.

## Deployment

Not production-ready. What exists:

- `db/docker-compose.yml` for local Postgres only. A health endpoint (`GET /health`, no DB check).
- Start command: `uv run uvicorn app.main:app --host 0.0.0.0 --port 8000`.

Missing: Dockerfiles for server and client, CI, a migration process, authentication and authorization, rate
limiting, secrets management, a job queue (runs die with the process), progress reporting, structured
logging and metrics, and a deployed environment. The shared database is intended to be Tiger Data, which has
to be loaded with `schema.sql` by hand.

## Current development status

| Component                       | Implemented | Partial                                  | Planned                          | Blocked / needs decision                    |
| ------------------------------- | :---------: | ---------------------------------------- | -------------------------------- | ------------------------------------------- |
| Universes + invites             | API         | No QR, no admin ownership                | QR code, admin token             | Auth model                                  |
| Onboarding                      | API         | Untested; scraping optional              | Profile review/edit              | Consent flow, scrape sources                |
| Agent persona + conversation    | Library     | `ask_my_human` is a stub                 | Server-side private-data check   |                                             |
| Pair/group judging              | Yes         | Group judge untested at scale            |                                  |                                             |
| Keywords, scoring, filter, rank | Yes         | Never run on a real model                | Over-blocking tuning (#17)       |                                             |
| Group formation                 | CP-SAT      | Weak at 100+ people                      | Greedy warm start; unplaced list |                                             |
| Events                          | Ticketmaster|                                          | City filter                      |                                             |
| Notifications                   |             | Photon stub                              | Real iMessage via Photon         | Is it in scope?                             |
| Auth / consent / deletion       |             |                                          | All                              | Auth approach; retention policy             |
| Database / migrations           | Schema+seed |                                          | Migration tool                   | Which tool                                  |
| Client                          |             | Scaffold                                 | All pages (#6, #49)              |                                             |
| Deployment / CI                 |             | Local Docker DB                          | Dockerfiles, CI, deploy          | Hosting target                              |

## Roadmap

Backend foundation first, then advanced AI features. Task numbers refer to `PROGRESS.md`.

1. **Run what exists**: start the DB, run the seed through the full pipeline on a real model (#8), and record
   time, failures and group sizes. Everything else depends on these numbers.
2. **Backend gaps for the demo**: matching progress (#29), skip incomplete profiles (#22), show unplaced
   people (#15), city-aware events (#28), fixture of a finished run (#43).
3. **Test and tooling foundation**: API tests with a test DB, ruff, CI, a migration tool.
4. **Client** (#6, #49) against the fixture, then deployment (#44) once the API is stable.
5. **Trust and safety**: auth, consent, data deletion, server-side private-data check, prompt-injection hardening.
6. **Scale and quality**: greedy warm start for grouping, over-blocking tuning, evaluation of match quality.
