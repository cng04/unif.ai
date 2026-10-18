# unif.ai: guide for AI coding agents

This file says **how to work in this repo**. For what the project is, what exists, how to run it, the API and
the database, read `README.md`. For the live task list and owners, read `PROGRESS.md`. Treat the code as the
source of truth; if a doc disagrees with it, fix the doc in the same change.

## Before you start

1. Read `README.md` (status table) and the `PROGRESS.md` task you are taking. Put your name in **Owner**.
2. Frontend work: read `client/AGENTS.md` first. This Next.js version has breaking changes.
3. Do not assume a feature exists because it is mentioned in a plan or the Excalidraw. Check the code.

## Commands to run before finishing

```bash
cd agent  && uv run pytest
cd server && uv run pytest
cd client && npm run lint && npm run build      # only if you touched client/
```

All must pass, and you must report honestly what you could not run (for example DB tests without
`DATABASE_URL_TEST`, or anything needing real model keys). On Windows with the repo in OneDrive, see the
`UV_LINK_MODE` / `UV_PROJECT_ENVIRONMENT` note in `README.md`. There is no linter or CI yet; match the
surrounding style (type hints, short modules, comments only for non-obvious why).

## Module ownership and boundaries

| Area | Owns | Does not own |
| ---- | ---- | ------------ |
| `agent/` | Prompts, persona, conversation loop, judge, interviewer, model clients (`LLM`, `Jev`). Synchronous, no DB, no HTTP framework. | Persistence, routes, orchestration |
| `server/app/routers/` | HTTP shape only: validate, call `repo` or a service, return a schema. | Business logic, SQL beyond trivial reads |
| `server/app/matching/` | The pipeline stages and their orchestration. | Prompts and model clients (those live in `agent/`) |
| `server/app/repo.py`, `db.py` | Shared SQL helpers and the pool. | Anything model-related |
| `server/app/services/` | One file per external integration. Each must work with its key unset. | Pipeline decisions |
| `client/` | UI. Talks only to the server, never the DB. | Matching logic |
| `db/` | `schema.sql`, `seed.sql`, compose file. | Application code |

Keep model calls behind the `LLM` and `Jev` protocols so tests can use fakes. Keep math, counting and date
comparisons in code, not in prompts.

## Rules

**Database.** There is no migration tool. A schema change means editing `db/schema.sql`, updating `seed.sql` and
any raw SQL in `repo.py` and routers, adding an idempotent patch to `db/migrations/` for existing databases
(`./run.sh migrate` applies them), adding the reset steps to your PR description (`docker compose down -v`
locally, re-apply by hand on the shared instance), and noting it in `PROGRESS.md`. Do not add an ORM. Do not
add a migration tool without a decision from the team; propose it in `PROGRESS.md` instead. Everything must stay
reachable through `universes ON DELETE CASCADE`, and tests must delete only rows they created.

**Security and privacy.**
- `agent_profiles.private` and agents' `note` rows must never reach another user, another agent verbatim, or a
  public endpoint. There is no auth yet; when adding an endpoint, state who should be allowed to call it.
- Never commit keys or `.env`. Keep `.env.example` in sync with `config.py` and the README table.
- Do not invent personal details in profiles or prompts; ground agents in the stored profile.
- Anything that scrapes or imports external data needs explicit user consent in the flow. Do not log full
  private profiles or transcripts at INFO.
- Treat user-provided text (self-report, interview, scraped pages) as untrusted input to prompts.

**Dependencies.** Prefer the standard library and what is already installed. A new dependency needs a one-line
justification in the PR and an entry in the README tech table. Do not add infrastructure (queues, caches, new
databases) without a clear need and a decision recorded in `PROGRESS.md`. Use `uv add` so `uv.lock` updates.

**Tests.** New behavior needs a test with fake models (see `server/tests/test_matching.py` and `FakeJev`). Never
let a test call a real model or depend on a shared database. Do not weaken or delete a failing test to get green.

**Documentation.** In the same change: update the README status table or endpoint list if behavior changed,
this file if a convention or pipeline detail changed, and `PROGRESS.md` (tick the task, add a changelog line).
Do not copy README content here or vice versa; link instead.

**Boundaries.** Do not implement beyond the task you took. Anything outward-facing (pushing, deploying, sending
real notifications, spending model quota at scale) needs explicit approval.

## Core concepts

- **Agent profile** (`agent_profiles`, `unifai_agent/profile.py`): built from scraped socials, a pasted
  self-report from the user's own AI, and an interviewer chat. It has a `public` part (shareable
  interests) and a `private` part (dealbreakers, values, logistics). Private data must never be revealed
  verbatim in agent-to-agent chats.
- **Universe status** moves `onboarding` -> `matching` -> `matched`. If matching fails, it resets to
  `onboarding`.
- `server` depends on `agent` through an editable uv path dependency, so changes in `agent/src` are picked up
  right away.

## Matching pipeline (`server/app/matching/pipeline.py`)

Each run first deletes the universe's old pairs and groups.

Two kinds of model are used. **Gemini** (generative) writes text: keywords, persona chats, and the group
judge. **Jev** (TypeSafe's discriminative model, `agent/jev.py`) answers typed questions with calibrated
probabilities: keyword scores, dealbreakers, availability, and the chemistry judge. Jev can't generate
text. A Noul (true/false) answer counts as yes above `YES = 0.5`.

1. **Keywords** (`keywords.py`, Gemini): reads every person's onboarding document (profile plus interview
   transcript) and returns k keywords (`keyword_count`, default 20) covering interests, values, traits,
   and dealbreaker topics.
2. **Scores** (`scoring.py`, Jev): one request per person. It contains a 5-level Score per keyword
   (normalized to 0-1, with "no signal" as the middle level, so 0.5), a dealbreaker Noul per keyword, and
   availability Nouls for fixed slots (`weekday_daytime`, `weekday_evening`, `weekend_daytime`,
   `weekend_evening`). The slots count only if the person said when they're free. Together the scores
   form an N x k matrix.
3. **Hard filter** (`hard_conflicts`): a pair is blocked if either person scores above 0.5 on a keyword the
   other marked as a dealbreaker, or if both gave availability and none of their slots overlap.
4. **Rank** (`candidate_pairs`): cosine similarity on the keyword vectors, then give each person up to M outgoing
   proposals (`top_m`, default 4). A small CP-SAT solve maximizes filled proposal slots first, then similarity.
   Reciprocal A->B / B->A proposals are one conversation, so the rejected direction goes to a next-best person.
   Incoming proposals do not count against M; a popular person can participate in more than M conversations.
5. **Chat and judge**: only those pairs get a Gemini agent-to-agent conversation (`pairing.py` ->
   `agent/conversation.py`). The chemistry judge (`Judge.evaluate`, Jev) asks a 5-level chemistry Score
   (mapped to a 1-10 vibe score), a logistics Choice (`strong` / `workable` / `incompatible`), and one
   Noul per stated dealbreaker of either person. The rationale is a template filled in code, since Jev
   returns no text.
6. **Edges**: only judged pairs get an edge, weighted by `Verdict.edge_weight`. Pairs that never chatted
   have no edge and add nothing to a group's score. There is no fallback weight for unjudged pairs.
7. **Groups** (`groups.py`, OR-Tools CP-SAT): groups of 3-8 in which no two members are a forbidden pair.
   A pair is forbidden if the hard filter blocked it or the judge found a conflict. The solver first
   places as many people as possible, then keeps that count fixed and maximizes the total edge weight
   inside groups. People who can't be placed are left out. The group judge (Gemini) then re-checks each
   group and can drop one misfit.
8. The universe is marked `matched`. Then, outside the pipeline's DB connection, each group gets 3 plans
   (`plans.py`, as its own task so aborting matching never touches it, a few groups at a time;
   `groups.plans_status` is `pending` until done, then `ready` or `none`).
   Code keeps every slot the most members are free in (empty availability counts as flexible), the lowest
   budget tier in the group, and the top shared public interests. Gemini turns members' private `area` and
   `travel` into one coarse search area; only that string, the interests, slot, dates and price cap go to
   Browser Use (`services/event_search.py`, needs `BROWSER_USE_API_KEY`). Ticketmaster is the fallback. Code drops
   candidates outside the slot (by venue-local time) or over budget, Gemini picks 3 with a one-line reason
   built only from interest counts, and members are notified via Photon. `POST /groups/{id}/plans` re-runs it.

**Known issue:** at around 100 or more people, CP-SAT hits `group_solver_seconds` far from optimal. In a
synthetic benchmark with 5 judged edges per person, the edge weight kept inside groups was 45% at 30
people, 27% at 100, and 3% at 200 (about what random grouping keeps). Everyone was still placed in a
valid group. A greedy warm start is the planned fix.

`projection.py` reduces the k-dim keyword scores to 3D (PCA) for `GET /universes/{id}/graph` and the web app's 3D view
(`GET /users/{id}/graph`).

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

## Web app (`client/`)

Mobile-first. People reach it through a personal link from their agent: `/u/{user_id}` redirects to
`/u/{user_id}/connections`. Tabs are `connections` (ego graph), `agent` (the interview chat, continued),
and `you` (own profile plus group). `/u/{user_id}/pairs/{pair_id}` shows one agent-to-agent conversation.
Pages are server components that call the API through `src/lib/api.ts` (`API_URL`, default
`http://localhost:8000`), so the browser never talks to FastAPI directly. Design tokens mirror the Paper
file and live in `src/app/globals.css`. There is no auth yet: the user id in the URL is the only identity.

The connections tab defaults to 3D, with a `2d · 3d` toggle (`?view=2d` for the ego graph). Tapping a match opens
the agent conversation in a drawer (`?pair={pair_id}`, `components/pair-drawer.tsx`) instead of navigating. Both graphs put nodes on springs
(`src/lib/elastic.ts`): the 2D view pans, zooms and keeps dragged dots where they're dropped; in 3D a dragged dot
springs back to the place its scores give it. A press that moves under 5px counts as a tap. The 3D view (`components/connections-graph-3d.tsx`, three.js
via react-three-fiber, loaded lazily) places the whole universe by keyword scores, either PCA or three keywords picked as
axes (`?axes=a,b,c`).

The app reads `GET /users/{id}/connections`, `GET /users/{id}/graph`, and `GET /users/{id}/pairs/{pair_id}`
(`server/app/routers/me.py`).
They name only the user's own pairs and group members, return everyone else as anonymous ids, and never
return judge rationales, dealbreaker flags, or private profile fields.

The onboarding bot sends that link once dealbreakers are confirmed (`onboarding/src/flow.ts`, `APP_URL` in
`onboarding/.env`; unset means no link is sent).

**Admin** (`/admin`): universes list, universe overview (pipeline strip, members, keywords, run matching),
groups, and the agent world (`/world`: PixiJS pixel-art building, `src/components/visualizer/`; overlays follow
the Paper "World visualizer" page, floors the "Warehouse · open floor" artboards, and `character.ts` is the
Pixi-free sprite painter shared by the canvas and the bio-card avatar), under
`/admin/universes/{id}`. The world reads the public endpoints plus `/admin/api` (including `/scores`, the keyword
vectors and keyword-level dealbreaker flags) and passes only public profile fields, keyword vectors and judge output
to the browser; never `agent_profiles.private` text. Dev builds expose `window.__unifaiWorld.snapshot()` (agent
states and screen positions) for browser checks. It reads
`/admin/api/*` (`server/app/routers/admin_api.py`). Both the `/admin` pages (`src/proxy.ts`) and the API ask for
HTTP basic auth with `ADMIN_PASSWORD` when it's set; the client forwards its own `ADMIN_PASSWORD` to the API, so
set the same value in both. Pipeline stages, group labels (`g-01`...), weakest ties and leftovers are all derived
from stored rows; there is no stored progress or approval state. The older server-rendered admin
(`server/app/routers/web.py`) still works, since the Docker stack doesn't deploy the client yet.

## Conventions

- Raw SQL through async psycopg 3 (`app/db.py` pool, `app/repo.py`). There is no ORM.
- The `agent` library is synchronous. The server calls it with `asyncio.to_thread`, and the number of
  concurrent conversations is capped by a semaphore.
- All generative calls go through the `LLM` protocol in `agent/llm.py` (`GeminiLLM`: `gemini_model`, default `gemini-3.8-flash`,
  plus 768-dim embeddings). All Jev calls go through the `Jev` protocol in `agent/jev.py` (the
  `typesafe-sdk` client, model `jev_model`, default `jev-latest`). Tests use fakes of both.
  **OpenRouter mode:** if `OPENROUTER_API_KEY` is set, `server/app/deps.py` uses `OpenRouterLLM` for text and
  `OpenRouterJev` for typed questions through OpenRouter's native System One API. One key is enough to run the whole
  pipeline. Persona chats (`openrouter_chat_model`) and Jev versions (`openrouter_jev_model`) can take comma-separated
  model lists and rotate pairs across them; `openrouter_chat_temperatures` assigns one sampling temperature per chat
  model (or one for all), overriding profile temperature for those chats. Each pair samples once within
  `openrouter_chat_temperature_jitter` of that base and keeps the result for every turn. `openrouter_rpm` paces each
  model under the account's cap. Jev IDs include `typesafe/jev-1.13`, `typesafe/jev-1.14`, and `~typesafe/jev-latest`.
- Jev works best with literal, single-judgment questions and a state that holds only what the question
  needs. Keep math, counting, and date comparisons in code. See the TypeSafe "jaggedness" docs.
- Tuning knobs (`keyword_count`, `top_m`, turns, group sizes, `group_solver_seconds`) live in
  `server/app/config.py` and can be overridden with env vars.
- Rows in `pairs` store users in sorted order (`user_a < user_b`).

## Gotchas

- Local DB: `db/docker-compose.yml` runs the SQL files only on first boot. After changing the schema,
  run `docker compose down -v` to reset the volume. A shared Tiger Data instance needs the schema
  re-applied by hand, or the `db/migrations/` patches applied (`db/migrate-tiger.sh`). Edit its data with
 `db/tiger-sql.sh` (dry run first), not `db/push-to-tiger.sh`, which wipes it.
- `server/` requires Python below 3.15, because OR-Tools has no 3.15 wheels yet.
- The schema needs only the `vector` and `pgcrypto` extensions. No TimescaleDB-specific features are used.
- `client/` runs a new Next.js version. Read `client/AGENTS.md` before writing frontend code.
- Browser Use (account scraping, event search) is a regular server dependency, but scraping only runs with
  `BROWSER_USE_API_KEY` set. The bot always waits briefly for scrape results before the interview.
- Failure handling in the pipeline: `extract_keywords` returns `[]` on error (the run then resets the universe to
  `onboarding`), `score_person` falls back to all-0.5 scores, and `review_groups` keeps a group with a neutral
  verdict if the group judge errors. `POST /universes/{id}/matching` claims the universe atomically
  (`repo.claim_matching`) and returns 409 if a run is already in progress. Runs are asyncio tasks tracked in
 `matching/runs.py`; the admin abort (`POST /admin/api/universes/{id}/matching/abort`, the "abort matching" button)
 cancels the run, deletes its partial pairs and groups, and resets to `onboarding`. It also unsticks a universe
 whose run died with a restarted server. Model calls already in worker threads finish and are discarded.
- Photon assigns shared iMessage lines at join (`assign_line`, needs `PHOTON_API_KEY` and `PHOTON_PROJECT_ID`),
  but `send_message` is still a stub: match notifications only log.
- `GET /pairs/{id}/messages` returns only `kind = 'message'` rows; agents' private `note` rows are never exposed.
