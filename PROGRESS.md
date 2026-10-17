# unif.ai: progress and TODOs

Last updated: 2026-10-17 (as of commit `63b21e2`). Keep this file current: when you pick up a task, put
your name in **Owner**. When you finish it, check it off and add a line under [Changelog](#changelog).

See `README.md` for setup and `AGENTS.md` for architecture and conventions.

**Priorities (hackathon MVP):** **Must** means the demo breaks without it. **Should** means the demo is
noticeably better or safer. **After the hackathon** means it's cut for now. See [TODOs](#todos).

---

## At a glance

| Area                       | Status          | Notes                                                                           |
| -------------------------- | --------------- | ------------------------------------------------------------------------------- |
| DB schema + local Docker   | Done            | Seed has only **1 user**, which is too few to test matching (needs 4 or more).  |
| Server skeleton + routers  | Done            | No auth on any route. `server/.env.example` is referenced but missing.          |
| Onboarding API             | Done, untested  | Join, self-report, interview chat, profile build.                               |
| Scraping (Browser Use)     | Done, optional  | Behind the `scrape` extra. Never run end to end.                                |
| Interviewer agent          | Done, untested  | No tests.                                                                       |
| Keywords, scoring, filter  | Done            | Rewritten in `2cd6a5f`. Gemini keywords; Jev scores each user in parallel. Unit tests with a fake Jev. Never run on real Jev. |
| Agent-to-agent conversation| Done            | 2 unit tests. Never run against real Gemini at scale.                           |
| Judge (pair + group)       | Done            | Pair judge is Jev (2 tests with a fake). Group judge is Gemini, untested. Error handling gaps (see below). |
| Grouping (CP-SAT)          | Done            | Rewritten in `2cd6a5f` (OR-Tools). 4 unit tests. `review_groups` is untested. Far from optimal at 100+ people (see `AGENTS.md`). |
| 3D projection + graph API  | Done            | 1 shape test.                                                                   |
| Ticketmaster events        | Done            | Doesn't filter by city.                                                         |
| Photon notifications       | **Stub**        | Raises `NotImplementedError` when an API key is set.                            |
| Client (Next.js)           | **Skeleton**    | Default create-next-app scaffold (`ff06aff`). No pages or API calls yet.        |
| Auth                       | **Not started** | Every endpoint is public, including private profiles and agent notes.           |
| CI / lint                  | **Not started** | No CI workflow, linter, or formatter config.                                    |

**Test status (2026-10-17):** `uv run pytest` passes in `agent/` (4 tests) and `server/` (11 tests).

---

## What's built

### `agent/` (unifai_agent library)
- **`llm.py`**: `LLM` protocol plus `GeminiLLM` (`gemini-3.8-flash`, `gemini-embedding-001` at 768 dims).
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
- **Pipeline** (`matching/pipeline.py`, rewritten in `2cd6a5f`; full description in AGENTS.md): clear
  old results, then keywords, then per-person scores + dealbreakers + availability (in parallel), then a
  hard filter for blocked pairs, then each person's top-M unblocked matches, then a conversation and judge
  per pair, then CP-SAT groups with no forbidden pairs (people who can't be placed are left out), then a
  group review, then Ticketmaster events and a Photon notification. Status goes `matching` to `matched`,
  or back to `onboarding` on failure.
- **Services**: `ticketmaster.py` (Discovery API), `photon.py` (stub that only logs), `scraper.py`
  (Browser Use).
- **Config** (`config.py`): keyword_count 20, top_m 5, max_conversation_turns 12,
  max_concurrent_conversations 8, group size 4-8, group_solver_seconds 10. All can be overridden with env vars.

### `db/`
- `schema.sql`: universes, users, agent_profiles (with an unused `embedding vector(768)`),
  onboarding_messages, keywords, keyword_scores (with a `dealbreaker` flag), pairs, pair_messages, groups, group_members, events.
- `seed.sql`: one universe ("LA Hacks Demo", invite `lahacks`) and one user (Cynthia).
- `docker-compose.yml`: local Postgres from the `timescaledb-ha:pg17` image. It loads the schema and
  seed on first boot only.

---

## TODOs

These are ranked for a **hackathon MVP due in about 24 hours**. The test is simple: does the demo run
end to end, live, without embarrassing failures? Task numbers are permanent IDs (that's why they aren't
in order), so feel free to reference them in chat and PRs. New tasks start at #43.

### Timeline

| Hours  | Goal |
| ------ | ---- |
| 0-3    | **Unblock everyone:** env example, fixture data, fake model, deploy a hello-world. Agree on the demo script. |
| 3-16   | **Build:** client pages, pipeline fixes, one real Gemini run. |
| 16-20  | **Integrate and rehearse:** full demo on the deployed app at least twice, fixing what breaks. |
| 20-24  | **Feature freeze.** Only bug fixes, the demo fallback, slides, and a recording. |

### Must: the demo breaks without these

| #  | Task | Where | Owner |
| -- | ---- | ----- | ----- |
| 5  | [ ] Add `server/.env.example` (`DATABASE_URL`, `GEMINI_API_KEY`, `TICKETMASTER_API_KEY`, `PHOTON_API_KEY`, `CLIENT_URL`). Share the real keys in the team chat, never in the repo. | `server/` | |
| 7  | [ ] **Seed about 20 varied profiles** (some clear mismatches and dealbreaker conflicts) so matching makes 3-4 groups. Include `onboarding_messages` for each user, since keywords and scoring now read the interview transcript too. | `db/seed.sql` | |
| 43 | [ ] **Fixture data for a finished matching run:** precomputed keywords, keyword scores, pairs + transcripts, groups, events for the seed universe. Frontend can build every page without running the pipeline, and it's the **demo fallback** if Gemini fails live. | `db/seed.sql` or `db/fixture_matched.sql` | |
| 6  | [ ] **Build the client.** In demo order: create universe + invite QR, `/join/[code]` onboarding (name, paste self-report, interviewer chat), admin "start matching" + status, groups + events, then the 3D playground and pair transcripts. Read `client/AGENTS.md` first. | `client/` | |
| 8  | [ ] **Run the full pipeline on real Gemini** with the seed data. Record how long it takes, which pairs failed, and group sizes. If it takes longer than about 2 minutes, lower `max_conversation_turns` or `top_m` for the demo. Also count how many people the hard filter and CP-SAT leave out (see #17). | — | |
| 9  | [ ] **Photon:** make `send_message` log and return instead of raising `NotImplementedError` (or implement it, if iMessage is part of the demo). Right now, setting the key fails the whole run after groups are saved. | `server/app/services/photon.py` | |
| 10 | [ ] Wrap each `evaluate_group` call in error handling. One bad judge response currently fails the whole run. | `server/app/matching/groups.py` (`review_groups`) | |
| 19 | [x] ~~Clear the old results before re-running matching.~~ Done in `2cd6a5f` (`clear_results`). | `pipeline.py` | Caleb |
| 21 | [ ] Set the status to `matching` inside the start request (`UPDATE ... WHERE status <> 'matching' RETURNING`) so a double click doesn't start two runs. Allow re-running a `matched` universe. | `routers/matching.py` | |
| 27 | [ ] Add a retry with backoff to Gemini calls. 8 conversations at once will hit rate limits. | `agent/llm.py` | |
| 11 | [ ] Prepend `CONVERSATION_KICKOFF` to the opening agent's history so it never starts with an `assistant` message. Check in #8 whether Gemini actually complains; skip this if it doesn't. | `agent/persona.py` | |
| 44 | [ ] **Deploy early** (server, client, shared DB) and redeploy as features land, so "works on my machine" problems show up early. | — | |
| 45 | [ ] **`DEMO.md`:** exact click path, which universe and invite code, time per step, who presents, and what to do if a live call fails (switch to the #43 fixture). | repo root | |

### Should: the demo is noticeably better or safer

| #  | Task | Where | Owner |
| -- | ---- | ----- | ----- |
| 25 | [x] ~~Score profiles in parallel.~~ Done in `2cd6a5f`. | `pipeline.py` | Caleb |
| 29 | [ ] Matching progress (pairs done out of total) plus a progress bar, so the live wait looks intentional. | pipeline, new endpoint, client | |
| 2  | [ ] Drop `note` rows from `GET /pairs/{id}/messages` and strip `private` from `GET /users/{id}/profile`. Five minutes of work, and judges may ask about privacy. | `routers/matching.py`, `routers/onboarding.py` | |
| 15 | [ ] **Show unplaced people.** CP-SAT leaves out anyone it can't fit, and the group judge can drop one more per group. Neither is shown anywhere. At minimum, list them on the admin page. Better: put each in the best group with room that has no forbidden pair. | `groups.py`, `pipeline.py`, client | |
| 22 | [ ] Skip users with no built profile (half-finished onboarding during a live demo) and show the admin who isn't ready. | `repo.load_profiles`, pipeline | |
| 13 | [ ] Retry once when Gemini returns empty or invalid JSON (group judge, keywords, interviewer). The pair judge and scoring use Jev, which returns typed answers. Failed scoring already falls back to all 0.5. | `agent/judge.py` and others | |
| 24 | [x] ~~Match keyword scores by index.~~ Done with the Jev switch: answers come back keyed by question index (`score_{i}`), so names can't drift. | `scoring.py` | Caleb |
| 46 | [ ] Fake model mode (`FAKE_LLM=1`) that returns canned answers, so teammates can run the whole flow without a key or spending quota. It also works as a smoke test. | `agent/llm.py`, `server/app/deps.py` | |
| 47 | [ ] `Makefile`: `db`, `db-reset`, `server`, `client`, `simulate`, `test`. | repo root | |
| 48 | [ ] Generate TypeScript types from the API (`openapi-typescript http://localhost:8000/openapi.json`) so backend changes break the client build instead of breaking at demo time. | `client/` | |
| 12 | [ ] Don't drop the message when `end_conversation` comes before `send_message` in the same response. | `agent/persona.py` | |
| 28 | [ ] Ticketmaster: pass the group's most common city so events are local. | `ticketmaster.py`, `pipeline.py` | |
| 17 | [ ] After #8, check for over-blocking. Dealbreakers now forbid a pair in two places: the scoring prompt's dealbreaker keywords (hard filter) and the judge's `dealbreaker_conflicts`. Too many means lots of people left out. Tune the prompts if so. | `scoring.py`, `prompts.py` | |

### After the hackathon: cut for now

Not worth the time in 24 hours. Keep these for if the project continues. In the pitch, say the
private-data rule is enforced by the prompt for now, with a server-side check planned.

| #  | Task | Note |
| -- | ---- | ---- |
| 1  | [ ] Real auth (admin + per-user tokens) | For the demo, an `ADMIN_TOKEN` env var checked on `POST .../matching` is enough, if anything. |
| 3  | [ ] Server-side check for private data in outgoing messages | Pitch talking point. |
| 4  | [ ] Prompt injection hardening | |
| 14 | [ ] Notes collide when two users share a name | Avoid duplicate names in the seed. |
| 16 | [ ] Groups still failing after removing a member | |
| 18 | [ ] Implement or remove `ask_my_human` | Removing it is a one-line change if agents waste steps on it. |
| 20 | [ ] Clean up partial results after a failed run | #19 covers the rehearsal case. |
| 23 | [ ] Block joins during matching | |
| 26 | [ ] Short-lived DB connections in the pipeline | |
| 30-35 | [ ] Judge, group, conversation, interviewer, pipeline, API tests | #46 gives a cheap smoke test instead. |
| 36-37 | [ ] CI, ruff, eslint | |
| 38 | [ ] Use or remove the `embedding` column | |
| 39 | [ ] README cleanup | Do it at hour 22 if there's time; judges may read it. |
| 40 | [ ] Cost and latency logging | |
| 41 | [ ] Let users edit their generated profile | |
| 42 | [ ] Real Browser Use scrape | Only if scraping is part of the demo. LinkedIn will likely block it. |

---

## Suggested split for 4 people

This is a proposal. Rename or reshuffle as needed.

| Workstream                      | Must                     | Should              | Notes |
| ------------------------------- | ------------------------ | ------------------- | ----- |
| **A. Frontend**                 | 6                        | 29 (UI), 48         | The biggest chunk. Build against the #43 fixture from hour 3; don't wait for the pipeline. |
| **B. Agent + judge**            | 11, 27                   | 12, 13, 17, 46      | Owns `agent/`. Run `scripts/simulate.py` often. Can help A once the Must items are done. |
| **C. Matching pipeline**        | 7, 8, 10, 21, 43         | 15, 22, 24, 29      | #7 and #43 go first, since everyone needs that data. |
| **D. Platform + demo**          | 5, 9, 44, 45             | 2, 28, 47           | Owns deploys, integrations, and the demo script. Runs the rehearsals at hours 16-20. |

**Dependencies between workstreams:**
- Everyone needs #5 (env) right away. A needs #43 (fixture) to build pages with real-looking data.
- #8 (real run) needs #7 (seed). Its results decide whether #11 and #17 are needed and whether the demo
  config needs smaller numbers.
- Rehearsals (hours 16-20) need #44 (deploy) and #45 (demo script).

---

## Open questions for the team

Decide these in the first hour.

1. **What exactly is the demo?** Live onboarding of a judge or audience member, or the pre-seeded
   universe only? This decides how much of the onboarding UI is a Must.
2. **Live or recorded matching?** If the real run (#8) takes more than about 2 minutes, plan to start
   it before presenting, or show the #43 fixture.
3. **Is iMessage (Photon) or scraping (Browser Use) in the demo?** If not, stub them and move on (#9, #42).
4. **Deployment target:** where do the server and client run, and which DB do we use? (#44)
5. **Who presents, and who runs the laptop?**

---

## Changelog

Add a line here for each change merged to `main`.

- 2026-10-17: Jev (TypeSafe) now scores keywords, dealbreakers, and availability, and judges pair
  chemistry. Gemini still does keywords, chats, and the group judge. Needs `TYPESAFE_API_KEY`. Closes #24.
- 2026-10-17: Pipeline rewritten (`2cd6a5f`): keywords + hard filter + CP-SAT groups. Closes #19 and #25.
- 2026-10-17: Reranked the TODOs for the hackathon MVP; added #43-48.
- 2026-10-17: Client skeleton added (`ff06aff`).
- 2026-10-17: Wrote this file after reviewing the code at `68cb046`.
