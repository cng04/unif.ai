# Running unif.ai locally

Three processes, each in its own terminal, started in this order:

| Service | Dir       | URL                          |
| ------- | --------- | ---------------------------- |
| DB      | `db/`     | `localhost:5432`             |
| Server  | `server/` | http://localhost:8000 (`/docs` for Swagger) |
| Client  | `client/` | http://localhost:3001        |

## Prerequisites

- Docker Desktop (running)
- Python 3.11 to 3.14 (OR-Tools has no 3.15 wheels yet)
- [uv](https://docs.astral.sh/uv/): `brew install uv`
- Node 20+

## 1. Database (Postgres + pgvector in Docker)

```bash
cd db
docker compose up -d
```

`schema.sql` and `seed.sql` run automatically, but only on the first boot of the volume. Check it's up:

```bash
docker exec unifai-db psql -U unifai -d unifai -c "SELECT name, status FROM universes;"
```

Reset the database (needed after any change to `schema.sql` or `seed.sql`):

```bash
cd db
docker compose down -v && docker compose up -d
```

If port 5432 is already taken, start with `DB_PORT=5433 docker compose up -d` and change the port in
`DATABASE_URL` below.

## 2. Server (FastAPI)

First time only:

```bash
cd server
cp .env.example .env
```

Fill in `.env`. The minimum to run matching is either `GEMINI_API_KEY` + `TYPESAFE_API_KEY`, or
`OPENROUTER_API_KEY` alone (which replaces both). `DATABASE_URL` already points at the Docker DB.
`TICKETMASTER_API_KEY` is optional, and `PHOTON_API_KEY` does nothing yet (Photon only logs).

Run:

```bash
cd server
uv run uvicorn app.main:app --reload --port 8000
```

`uv run` installs dependencies on first use, including the `agent/` library as an editable path
dependency, so edits in `agent/src` are picked up on reload. For Browser Use scraping, run
`uv sync --extra scrape` once.

Check it's up:

```bash
curl localhost:8000/health
```

## 3. Client (Next.js)

```bash
cd client
npm install   # first time only
npm run dev   # serves on port 3001
```

The server only allows CORS from `CLIENT_URL` (default `http://localhost:3001`). If you run the client on
another port, update `CLIENT_URL` in `server/.env` and restart the server.

## Triggering a matching run

With the seed data loaded, find a universe id and start matching:

```bash
UNIVERSE_ID=$(docker exec unifai-db psql -U unifai -d unifai -tAc "SELECT id FROM universes LIMIT 1")
curl -X POST localhost:8000/universes/$UNIVERSE_ID/matching   # 202 on start, 409 if already running
```

Watch progress from another terminal:

```bash
watch -n 5 'docker exec unifai-db psql -U unifai -d unifai -c "
SELECT (SELECT status FROM universes) status,
       (SELECT count(*) FROM keywords) keywords,
       (SELECT count(*) FROM keyword_scores) scores,
       (SELECT count(*) FROM pairs) pairs,
       (SELECT count(*) FROM pair_messages) messages,
       (SELECT count(*) FROM groups) groups;"'
```

Results: `GET /universes/{id}/groups`, `/pairs`, and `/graph`.

## Tests

```bash
cd agent && uv run pytest
cd server && uv run pytest
```

Server DB integration tests (`server/tests/integration/`) are skipped unless `DATABASE_URL_TEST` points
at a throwaway Postgres loaded with `db/schema.sql`.

## Stopping

- Client and server: `Ctrl+C`
- DB: `cd db && docker compose down` (keeps data) or `docker compose down -v` (wipes it)
