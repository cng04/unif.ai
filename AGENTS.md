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

Each run first deletes the universe's old pairs and groups.

1. **Keywords** (`keywords.py`): Gemini reads every person's onboarding document (profile plus interview
   transcript) and returns k keywords (`keyword_count`, default 20) covering interests, values, traits,
   and dealbreaker topics.
2. **Scores** (`scoring.py`): one Gemini call per person returns three things. These are a 0-1 score on
   every keyword (0.5 means no signal), which keywords are that person's dealbreakers, and their free time
   as fixed slots (`weekday_daytime`, `weekday_evening`, `weekend_daytime`, `weekend_evening`). Together
   the scores form an N x k matrix.
3. **Hard filter** (`hard_conflicts`): a pair is blocked if either person scores above 0.5 on a keyword the
   other marked as a dealbreaker, or if both gave availability and none of their slots overlap.
4. **Rank** (`candidate_pairs`): cosine similarity on the keyword vectors, then each person's top M
   unblocked matches (`top_m`, default 5).
5. **Chat and judge**: only those pairs get an agent-to-agent conversation (`pairing.py` ->
   `agent/conversation.py`). The judge (`agent/judge.py`) returns a vibe score (1-10), dealbreaker
   conflicts, and logistics fit.
6. **Edges**: only judged pairs get an edge, weighted by `Verdict.edge_weight`. Pairs that never chatted
   have no edge and add nothing to a group's score. There is no fallback weight for unjudged pairs.
7. **Groups** (`groups.py`, OR-Tools CP-SAT): groups of 4-8 in which no two members are a forbidden pair.
   A pair is forbidden if the hard filter blocked it or the judge found a conflict. The solver first
   places as many people as possible, then keeps that count fixed and maximizes the total edge weight
   inside groups. People who can't be placed are left out. The group judge then re-checks each group
   and can drop one misfit.
8. Ticketmaster events are found for each group's shared interests, and members are notified via Photon.

Because the objective sums the edges inside each group, larger groups capture more edges. Expect groups to
lean toward the size cap.

`projection.py` reduces the k-dim keyword scores to 3D for the playground view (`GET /universes/{id}/graph`).

### Why two people matched

The keyword vectors are stored in `keywords` and `keyword_scores` (`score`, `dealbreaker`). To explain
any pair:

```sql
SELECT k.name, a.score AS score_a, b.score AS score_b,
       a.dealbreaker AS a_avoids, b.dealbreaker AS b_avoids
FROM keyword_scores a
JOIN keyword_scores b USING (keyword_id)
JOIN keywords k ON k.id = keyword_id
WHERE a.user_id = :user_a AND b.user_id = :user_b
ORDER BY a.score * b.score DESC;
```

Shared high scores explain the similarity. A `true` in `a_avoids` next to a `score_b` above 0.5 (or the
reverse) explains a block. Availability slots are stored in `agent_profiles.availability`.

## Conventions

- Raw SQL through async psycopg 3 (`app/db.py` pool, `app/repo.py`). There is no ORM.
- The `agent` library is synchronous. The server calls it with `asyncio.to_thread`, and the number of
  concurrent conversations is capped by a semaphore.
- All LLM calls go through the `LLM` protocol in `agent/llm.py` (`GeminiLLM`: `gemini-2.5-flash`, plus
  768-dim embeddings). Tests use fakes of this protocol.
- Tuning knobs (`keyword_count`, `top_m`, turns, group sizes, `group_solver_seconds`) live in
  `server/app/config.py` and can be overridden with env vars.
- Rows in `pairs` store users in sorted order (`user_a < user_b`).

## Gotchas

- Local DB: `db/docker-compose.yml` runs the SQL files only on first boot. After changing the schema,
  run `docker compose down -v` to reset the volume. A shared Tiger Data instance needs the schema
  re-applied by hand. There are no migrations.
- `server/` requires Python below 3.15, because OR-Tools has no 3.15 wheels yet.
- The schema needs only the `vector` and `pgcrypto` extensions. No TimescaleDB-specific features are used.
- `client/` runs a new Next.js version. Read `client/AGENTS.md` before writing frontend code.
- Browser Use scraping is optional (`uv sync --extra scrape` in `server/`).
