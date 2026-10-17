# unif.ai: progress and TODOs

Last updated: 2026-10-17 (as of commit `ff06aff`). Keep this file current: when you pick up a task, put
your name in **Owner**. When you finish it, check it off and add a line under [Changelog](#changelog).

See `README.md` for setup and `AGENTS.md` for architecture and conventions.

**Priorities:** **P0** blocks a demo or launch, or is a privacy issue. **P1** is needed for a reliable
run with real users. **P2** is polish or nice-to-have.

---

## At a glance

| Area                       | Status          | Notes                                                                           |
| -------------------------- | --------------- | ------------------------------------------------------------------------------- |
| DB schema + local Docker   | Done            | Seed has only **1 user**, which is too few to test matching (needs 4 or more).  |
| Server skeleton + routers  | Done            | No auth on any route. `server/.env.example` is referenced but missing.          |
| Onboarding API             | Done, untested  | Join, self-report, interview chat, profile build.                               |
| Scraping (Browser Use)     | Done, optional  | Behind the `scrape` extra. Never run end to end.                                |
| Interviewer agent          | Done, untested  | No tests.                                                                       |
| Feature extraction/scoring | Done, untested  | Scoring runs one LLM call per user, one after another (slow).                   |
| Agent-to-agent conversation| Done            | 2 unit tests. Never run against real Gemini at scale.                           |
| Judge (pair + group)       | Done, untested  | No tests. Error handling gaps (see below).                                      |
| Grouping (Louvain)         | Done            | 2 unit tests. `review_groups` is untested.                                      |
| 3D projection + graph API  | Done            | 1 shape test.                                                                   |
| Ticketmaster events        | Done            | Doesn't filter by city.                                                         |
| Photon notifications       | **Stub**        | Raises `NotImplementedError` when an API key is set.                            |
| Client (Next.js)           | **Skeleton**    | Default create-next-app scaffold (`ff06aff`). No pages or API calls yet.        |
| Auth                       | **Not started** | Every endpoint is public, including private profiles and agent notes.           |
| CI / lint                  | **Not started** | No CI workflow, linter, or formatter config.                                    |

**Test status:** the test suites weren't run while writing this. `uv` wasn't installed on the machine
that wrote this, and there's no `.venv`. Whoever runs `uv run pytest` in `agent/` and `server/` first,
please record the result here.

---

## What's built

### `agent/` (unifai_agent library)
- **`llm.py`**: `LLM` protocol plus `GeminiLLM` (`gemini-2.5-flash`, `gemini-embedding-001` at 768 dims).
  Supports tool calls and structured output through `response_model`.
- **`profile.py`**: `AgentProfile` with `PublicProfile` (name, interests, vibe, looking_for) and
  `PrivateProfile` (dealbreakers, values, energy, logistics). Also `SelfReport`, the shape of the JSON
  users paste in.
- **`prompts.py`**: the self-report prompt users run in their own AI, the persona system prompt,
  the pair and group judge prompts, the interviewer prompt, and the profile-builder prompt.
- **`tools.py`**: the persona agent's tools: `send_message`, `take_note`, `end_conversation`,
  `check_availability`, `lookup_profile`, `ask_my_human` (stub).
- **`persona.py`**: `PersonaAgent.respond()` loops over tool calls, up to `max_steps` (4), until the
  agent sends a message or ends the conversation.
- **`conversation.py`**: `run_conversation(a, b, max_turns=12)` alternates speakers and returns a
  `Transcript` (messages, private notes, end reason).
- **`judge.py`**: `Judge.evaluate` returns a `Verdict` (vibe 1-10, dealbreaker conflicts, logistics fit,
  rationale). `Verdict.edge_weight` is 0 when there's any dealbreaker or the logistics are
  `incompatible`. `Judge.evaluate_group` returns a `GroupVerdict` that can name one member to remove.
- **`interviewer.py`**: the onboarding chat (`reply`) and `build_profile` (merges scraped data, the
  self-report, and the interview into a `ProfileDraft`).
- **`scripts/simulate.py`**: runs one real Gemini conversation (Cynthia vs. Marco) and prints the verdict.

### `server/` (FastAPI)
- **Universes**: `POST /universes`, `GET /universes/by-invite/{code}`, `GET /universes/{id}`,
  `GET /universes/{id}/users`.
- **Onboarding**: `GET /onboarding/prompt`, `POST /universes/{id}/users` (join; scraping runs in the
  background), `POST /users/{id}/self-report`, `GET|POST /users/{id}/interview`,
  `POST|GET /users/{id}/profile`.
- **Matching**: `POST /universes/{id}/matching` (background task), `GET /universes/{id}/graph`,
  `GET /universes/{id}/pairs`, `GET /pairs/{id}/messages`, `GET /universes/{id}/groups`.
- **Pipeline** (`matching/pipeline.py`): features, then scores, then nearest-neighbor pairs (in
  parallel, capped by a semaphore), then a conversation and judge per pair, then Louvain groups, then a
  group review, then Ticketmaster events and a Photon notification. Status goes `matching` to `matched`,
  or back to `onboarding` on failure.
- **Services**: `ticketmaster.py` (Discovery API), `photon.py` (stub that only logs), `scraper.py`
  (Browser Use).
- **Config** (`config.py`): feature_count 12, candidate_neighbors 6, max_conversation_turns 12,
  max_concurrent_conversations 8, group size 4-8. All can be overridden with env vars.

### `db/`
- `schema.sql`: universes, users, agent_profiles (with an unused `embedding vector(768)`),
  onboarding_messages, features, user_feature_scores, pairs, pair_messages, groups, group_members, events.
- `seed.sql`: one universe ("LA Hacks Demo", invite `lahacks`) and one user (Cynthia).
- `docker-compose.yml`: local Postgres from the `timescaledb-ha:pg17` image. It loads the schema and
  seed on first boot only.

---

## TODOs

### P0: privacy and security

| #  | Task | Where | Owner |
| -- | ---- | ----- | ----- |
| 1  | [ ] **Add auth.** Every route is public right now. Minimum: an admin token per universe (for starting matching and viewing pairs, transcripts, and groups) and a per-user token issued on join (for that user's onboarding and profile routes). | `server/app/routers/*`, `deps.py` | |
| 2  | [ ] **Stop exposing agent notes and private profiles.** `GET /pairs/{id}/messages` returns `note` rows, which are built from PRIVATE profiles. `GET /users/{id}/profile` returns the full `private` section to anyone. Filter out notes, or make them admin-only, and only return `private` to its owner. | `routers/matching.py` (`get_pair_messages`), `routers/onboarding.py` (`get_profile`) | |
| 3  | [ ] **Enforce the private-data rule in conversations.** Agents keep private data private only because the prompt asks them to. Add a check on outgoing `send_message` text (for example, fuzzy-match it against PRIVATE fields and ask the agent to rephrase or drop the message), plus a test with a scripted fake model that tries to leak. | `agent/persona.py`, `agent/tests/` | |
| 4  | [ ] **Reduce prompt injection from profile text.** Self-report and scraped text goes straight into the other agent's prompt and the judge's prompt. Wrap profiles in clear delimiters and tell the model to treat them as data. | `agent/prompts.py`, `judge.py`, `interviewer.py` | |
| 5  | [ ] Confirm `.env` and other secrets are never committed (`.env` is already in `.gitignore`). Add `server/.env.example` listing `DATABASE_URL`, `GEMINI_API_KEY`, `TICKETMASTER_API_KEY`, `PHOTON_API_KEY`, `CLIENT_URL`. | `server/` | |

### P0: needed for a working demo

| #  | Task | Where | Owner |
| -- | ---- | ----- | ----- |
| 6  | [ ] **Build the client.** Pages: admin creates a universe and gets an invite link + QR, `/join/[code]` onboarding (name/socials, paste self-report, interviewer chat, review profile), admin dashboard (start matching, status), 3D playground (`/graph`), pair transcripts, groups + events. Read `client/AGENTS.md` first. | `client/` | |
| 7  | [ ] **Seed data for matching.** Seed has 1 user. Add about 16-24 varied profiles (including clear mismatches and dealbreaker conflicts) so the pipeline makes several groups. | `db/seed.sql` | |
| 8  | [ ] **Run the full pipeline once against real Gemini** on the seed data and write down the results: duration, pairs that failed, group sizes, whether the judge's scores look sensible. | — | |
| 9  | [ ] **Photon.** Either implement `send_message`, or make it log and return instead of raising. Right now, setting `PHOTON_API_KEY` makes notification raise an error after groups are saved, which fails the whole run. | `server/app/services/photon.py` | |
| 10 | [ ] **One failed group-judge call fails the whole run.** Wrap each `evaluate_group` call in `review_groups` with error handling. On failure, keep the group with no review (or a default verdict) and log it. | `server/app/matching/groups.py` (`review_groups`) | |

### P1: conversation and judge correctness

| #  | Task | Where | Owner |
| -- | ---- | ----- | ----- |
| 11 | [ ] The opening agent's history starts with an `assistant` message after its first turn, because the kickoff prompt is only added when history is empty. Gemini may reject this or lose context. Prepend `CONVERSATION_KICKOFF` to that agent's real history. | `agent/persona.py` (`respond`) | |
| 12 | [ ] If one response contains `end_conversation` before `send_message`, the message is dropped. Collect the message first, then handle the end. | `agent/persona.py` | |
| 13 | [ ] `Verdict` / `GroupVerdict` parsing: `resp.text or "{}"` gives a confusing validation error when the response is empty. Retry once, then raise a clear error. The same pattern appears in `features.py`, `scoring.py`, and `interviewer.py`. | `agent/judge.py` and others | |
| 14 | [ ] If two users have the same name, their private notes collide in the judge prompt (keyed by name), and the transcript is ambiguous. Key by user_id, or add a suffix to repeated names. | `agent/judge.py` (`evaluate`) | |
| 15 | [ ] **A removed group member is left with no group.** When the group judge removes someone, that person is dropped. Put them in the best group with room (as `_absorb_small` does), or report them to the admin as unmatched. | `server/app/matching/groups.py` | |
| 16 | [ ] If a group still has `works=False` after removing one member, it's kept silently. Decide what to do: flag it to the admin, try removing another member, or merge it. | `groups.py` | |
| 17 | [ ] Any dealbreaker the judge lists sets the edge weight to 0. Check during the real run (#8) whether the judge lists too many, and add calibration to the prompt if so. | `agent/judge.py`, `prompts.py` | |
| 18 | [ ] `ask_my_human` is a stub that always says the human isn't available. Either implement it (queue a question for the user) or remove it so agents don't waste steps on it. | `agent/tools.py`, `persona.py` | |

### P1: pipeline and server reliability

| #  | Task | Where | Owner |
| -- | ---- | ----- | ----- |
| 19 | [ ] **Re-running matching duplicates data.** `groups`, `group_members`, and `events` are never cleared, and old `pairs` remain. Clear them at the start of a run, or version runs with a `matching_runs` table. The `/graph` query also returns a user twice if they're in two groups. | `pipeline.py`, `routers/matching.py` (`get_graph`) | |
| 20 | [ ] **A failed run leaves partial results.** Features, pairs, and groups are committed as the run goes, then status resets to `onboarding`. Clean up on failure, or keep the partial data and add a `failed` status with an error message. | `pipeline.py`, `db/schema.sql` | |
| 21 | [ ] **Race on start.** `start_matching` checks `status != 'matching'`, but the status is only set later, inside the background task, so two quick clicks start two runs. Set the status right away with `UPDATE ... WHERE status <> 'matching' RETURNING`. Also decide whether a `matched` universe can be re-run. | `routers/matching.py` | |
| 22 | [ ] Users who never built a profile (only a name) are still matched. Skip them, or require `POST /profile` before matching, and show the admin who isn't ready. | `repo.load_profiles`, pipeline | |
| 23 | [ ] Block new joins while a universe is `matching` or `matched`. | `routers/onboarding.py` (`join_universe`) | |
| 24 | [ ] Feature scores are matched to features by name. If the LLM changes a name slightly, that score silently becomes 0.5. Match by index, or constrain the names with an enum in the schema. | `matching/scoring.py` | |
| 25 | [ ] `score_profiles` runs one LLM call per user, one after another. Run them in parallel with the same semaphore. | `scoring.py`, `pipeline.py` | |
| 26 | [ ] The pipeline holds one DB connection for the whole run, which can be minutes. That's fine for now, but it should get short-lived connections per write if the pool is small. | `pipeline.py` | |
| 27 | [ ] Add a per-call timeout and retry/backoff to the Gemini calls (rate limits will show up with about 8 conversations at once). | `agent/llm.py` | |
| 28 | [ ] Ticketmaster: pass a city (from the most common `logistics.area` among the group) and handle errors other than 200 by logging them. | `services/ticketmaster.py`, `pipeline.py` | |
| 29 | [ ] Report matching progress (for example, pairs done out of total) so the client can show a progress bar. | pipeline, new endpoint | |

### P1: tests

| #  | Task | Where | Owner |
| -- | ---- | ----- | ----- |
| 30 | [ ] Judge tests with a fake model: parsing a `Verdict`, `edge_weight` cases (dealbreaker, incompatible, workable, strong), invalid or empty JSON. | `agent/tests/test_judge.py` | |
| 31 | [ ] `review_groups` tests: a member is removed, the min-size guard holds, a failed judge call is handled (after #10), the removed member is placed somewhere (after #15). | `server/tests/` | |
| 32 | [ ] Conversation edge cases: hitting `max_steps`, a text-only response (the nudge path), `end_conversation` with a message, hitting max turns. | `agent/tests/test_conversation.py` | |
| 33 | [ ] Interviewer and `build_profile` with a fake model. | `agent/tests/` | |
| 34 | [ ] Pipeline integration test: fake model + local DB, run `run_matching` end to end, check the rows written and the final status. | `server/tests/` | |
| 35 | [ ] API tests with FastAPI `TestClient` for the onboarding and matching routes, including the auth checks after #1 and #2. | `server/tests/` | |

### P2: infra, docs, polish

| #  | Task | Where | Owner |
| -- | ---- | ----- | ----- |
| 36 | [ ] CI (GitHub Actions): `uv run pytest` in `agent/` and `server/`, plus `npm run lint` / `build` in `client/` once it exists. | `.github/workflows/` | |
| 37 | [ ] Add `ruff` (lint + format) to both Python packages, and eslint/prettier to the client. | `pyproject.toml` | |
| 38 | [ ] Either use the `agent_profiles.embedding` column (for example, for candidate pairs or dedup) or remove it. `LLM.embed` is never called. | `db/schema.sql`, `agent/llm.py` | |
| 39 | [ ] Fix the README: `.env.example` is missing, and it mentions "Tiger Data" while AGENTS.md says no Timescale features are used. | `README.md` | |
| 40 | [ ] Log costs and latency per matching run (number of LLM calls, tokens), so we can estimate cost per universe. | `agent/llm.py`, pipeline | |
| 41 | [ ] Let users review and edit their generated profile before matching (especially the PRIVATE section). | client + `PUT /users/{id}/profile` | |
| 42 | [ ] Run a real Browser Use scrape against LinkedIn, Instagram, and X, and record what actually works. LinkedIn will likely block it. | `services/scraper.py` | |

---

## Suggested split for 4 people

This is a proposal. Rename or reshuffle as needed.

| Workstream                       | Tasks                         | Notes |
| -------------------------------- | ----------------------------- | ----- |
| **A. Frontend**                  | 6, 29 (UI side), 41           | The biggest chunk; only the scaffold exists. Start with onboarding and the admin dashboard; the 3D playground can come later. |
| **B. Agent + judge quality**     | 3, 4, 11-14, 17, 18, 30, 32, 33 | Owns `agent/`. Run `scripts/simulate.py` often. |
| **C. Matching pipeline**         | 7, 8, 10, 15, 16, 19-27, 31, 34 | Owns `server/app/matching/`. #7 and #8 come first, since everyone needs seed data. |
| **D. Platform + integrations**   | 1, 2, 5, 9, 28, 35-40, 42     | Auth, API, Photon, Ticketmaster, CI. #1 and #2 affect A's API calls, so agree on the token scheme early. |

**Dependencies between workstreams:**
- A needs the auth scheme from D (#1) before building its API client. Until then, A can build against
  the current open API.
- B's private-data test (#3) and C's real run (#8) both need the seed data from #7.
- C's #31 depends on #10 and #15.

---

## Open questions for the team

1. **Auth model.** Magic links, admin password per universe, or tokens in the invite link? This
   affects #1 and the client.
2. **Re-running matching.** Can an admin re-run on a `matched` universe? If so, do earlier groups get
   replaced or kept as history? (#19, #21)
3. **Unmatched people.** What happens to someone who ends up in no group: a smaller group, the admin
   places them, or they wait for the next round? (#15, #16)
4. **Who sees transcripts?** Admin only, the two users involved, or nobody? (#2)
5. **Deployment target.** Where do the server and client run for the demo, and is the DB the shared
   Tiger Data instance or something else?

---

## Changelog

Add a line here for each change merged to `main`.

- 2026-10-17: Client skeleton added (`ff06aff`).
- 2026-10-17: Wrote this file after reviewing the code at `68cb046`.
