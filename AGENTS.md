# unif.ai: project context

AI agents represent people, chat with each other, and sort a pool of people into small friend groups
(4-8). An admin creates a **universe** (a hackathon, a club, and so on), shares an invite code or QR code,
people onboard, and then the admin starts matching. See `README.md` for setup.

## Layout

| Dir       | What it is                                                                 |
| --------- | -------------------------------------------------------------------------- |
| `client/` | Next.js 16 + React 19 + Tailwind 4. Talks only to the server, never the DB. |
| `server/` | FastAPI app (`app/main.py`): routes, matching pipeline, integrations.      |
| `agent/`  | `unifai_agent` Python library: LLM wrapper, persona, interviewer, judge.   |
| `db/`     | `schema.sql`, `seed.sql`, and a local Docker Postgres.                     |

`server` depends on `agent` through an editable uv path dependency, so changes in `agent/src` are
picked up right away.

## Core concepts

- **Agent profile** (`agent_profiles`, `unifai_agent/profile.py`): built from scraped socials, a pasted
  self-report from the user's own AI, and an interviewer chat. It has a `public` part (shareable
  interests) and a `private` part (dealbreakers, values, logistics). Private data must never be revealed
  verbatim in agent-to-agent chats.
- **Universe status** moves `onboarding` -> `matching` -> `matched`. If matching fails, it resets to
  `onboarding`.

## Matching pipeline (`server/app/matching/pipeline.py`)

1. Gemini extracts k shared features (`features.py`) and scores each user 0-1 per feature (`scoring.py`).
2. Each user is paired with their nearest neighbors in feature space, and each pair runs an
   agent-to-agent conversation (`pairing.py` -> `agent/conversation.py`).
3. The judge (`agent/judge.py`) returns a vibe score (1-10), dealbreaker conflicts, and logistics fit.
4. The verdicts form a weighted graph. Louvain community detection splits it into groups of 4-8
   (`groups.py`, networkx), and the judge reviews each group as a whole.
5. Ticketmaster events are found for each group's shared interests, and members are notified via Photon.

`projection.py` reduces the k-dim feature scores to 3D for the playground view (`GET /universes/{id}/graph`).

## Conventions

- Raw SQL through async psycopg 3 (`app/db.py` pool, `app/repo.py`). There is no ORM.
- The `agent` library is synchronous. The server calls it with `asyncio.to_thread`, and the number of
  concurrent conversations is capped by a semaphore.
- All LLM calls go through the `LLM` protocol in `agent/llm.py` (`GeminiLLM`: `gemini-2.5-flash`, plus
  768-dim embeddings). Tests use fakes of this protocol.
- Tuning knobs (feature count, neighbors, turns, group sizes) live in `server/app/config.py` and can be
  overridden with env vars.
- Rows in `pairs` store users in sorted order (`user_a < user_b`).

## Gotchas

- Local DB: `db/docker-compose.yml` runs the SQL files only on first boot. After changing the schema,
  run `docker compose down -v` to reset the volume.
- The schema needs only the `vector` and `pgcrypto` extensions. No TimescaleDB-specific features are used.
- `client/` runs a new Next.js version. Read `client/AGENTS.md` before writing frontend code.
- Browser Use scraping is optional (`uv sync --extra scrape` in `server/`).
