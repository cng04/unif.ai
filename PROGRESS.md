# unif.ai: progress and TODOs

Last updated: 2026-10-17 (as of commit `b856488`). Keep this file current: when you pick up a task, put
your name in **Owner**. When you finish it, check it off and add a line under [Changelog](#changelog).

See `README.md` for setup and `AGENTS.md` for architecture and conventions.

**Priorities (hackathon MVP):** **Must** means the demo breaks without it. **Should** means the demo is
noticeably better or safer. **After the hackathon** means it's cut for now. See [TODOs](#todos).

---

## At a glance

| Area                       | Status          | Notes                                                                           |
| -------------------------- | --------------- | ------------------------------------------------------------------------------- |
| DB schema + local Docker   | Done            | Seed has only **1 user**, which is too few to test matching (needs 4 or more).  |
| Server skeleton + routers  | Done            | No auth on any route. `server/.env.example` added.               |
| Onboarding API             | Done, untested  | Join, self-report, interview chat, profile build.                               |
| Scraping (Browser Use)     | Done, optional  | Behind the `scrape` extra. Never run end to end.                                |
| Interviewer agent          | Done, untested  | No tests.                                                                       |
| Keywords, scoring, filter  | Done            | Rewritten in `2cd6a5f`. Gemini keywords; Jev scores each user in parallel. Unit tests with a fake Jev. Never run on real Jev. |
| Agent-to-agent conversation| Done            | 2 unit tests. Never run against real Gemini at scale.                           |
| Judge (pair + group)       | Done            | Pair judge is Jev (2 tests with a fake). Group judge is Gemini, untested. Error handling gaps (see below). |
| Grouping (CP-SAT)          | Done            | Rewritten in `2cd6a5f` (OR-Tools). 4 unit tests. `review_groups` is untested. Far from optimal at 100+ people (see `AGENTS.md`). |
| 3D projection + graph API  | Done            | 1 shape test.                                                                   |
| Group plans (events)       | Done, untested live | Browser Use search with Ticketmaster fallback, 3 plans per group fitted to free time and budget. Never run end to end. |
| Photon notifications       | **Stub**        | Logs only, even when a key is set (#9).                                        |
| Client (Next.js)           | **Skeleton**    | Default create-next-app scaffold (`ff06aff`). No pages or API calls yet.        |
| Auth                       | **Not started** | Every endpoint is public, including private profiles and agent notes.           |
| CI / lint                  | **Not started** | No CI workflow, linter, or formatter config.                                    |

**Test status (2026-10-17):** `uv run pytest` passes in `agent/` (8 tests) and `server/` (15 tests). DB integration tests are skipped unless `DATABASE_URL_TEST` is set.

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
- **`tools.py`**: the persona agent's one tool is `send_message`, with an optional private `note` for the judge.
- **`persona.py`**: `PersonaAgent.respond()` retries up to `max_steps` (3) until the agent sends a message.
- **`conversation.py`**: `run_conversation(a, b, max_turns=6)` alternates speakers and returns a
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
  hard filter for blocked pairs, then a degree-capped set of top unblocked matches, then a conversation and judge
  per pair, then CP-SAT groups with no forbidden pairs (people who can't be placed are left out), then a
  group review. Status goes `matching` to `matched`, or back to `onboarding` on failure. After `matched`,
  each group gets 3 plans (`plans.py`) and a Photon notification.
- **Services**: `ticketmaster.py` (Discovery API), `photon.py` (stub that only logs), `scraper.py`
  (Browser Use), `event_search.py` (Browser Use search for group plans).
- **Config** (`config.py`): keyword_count 20, top_m 4, max_conversation_turns 6,
  max_concurrent_conversations 50, group size 3-8, group_solver_seconds 10. All can be overridden with env vars.

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
in order), so feel free to reference them in chat and PRs. New tasks start at #50.

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
| 5  | [x] Add `server/.env.example` (`DATABASE_URL`, `GEMINI_API_KEY`, `TICKETMASTER_API_KEY`, `PHOTON_API_KEY`, `CLIENT_URL`). Share the real keys in the team chat, never in the repo. | `server/` | |
| 7  | [x] Seeded two varied 40-person public-figure demos plus a 15-person live-run pool, with profiles, deliberate mismatches and onboarding transcripts (`lahacks`, `encore40`, `celeb15`). | `db/seed.sql`, `db/seed_celebrity_encore.sql`, `db/seed_celebrity_fifteen.sql` | Cursor |
| 43 | [ ] **Fixture data for a finished matching run:** precomputed keywords, keyword scores, pairs + transcripts, groups, events for the seed universe. Frontend can build every page without running the pipeline, and it's the **demo fallback** if Gemini fails live. | `db/seed.sql` or `db/fixture_matched.sql` | |
| 6  | [ ] **Build the client.** In demo order: create universe + invite QR, `/join/[code]` onboarding (name, paste self-report, interviewer chat), admin "start matching" + status, groups + events, then the 3D playground (#49) and pair transcripts. Read `client/AGENTS.md` first. | `client/` | |
| 49 | [ ] **Keyword playground (3D).** A three.js scatter plot where the user picks 3 keywords as the X/Y/Z axes. Each point is one person in the universe, placed by their Jev keyword scores (0-1) on those 3 keywords. The viewer's own point is highlighted. People the viewer had a simulated chat with (a row in `pairs`) are colored; everyone else is grey. Clicking a colored point opens that agent-to-agent transcript (`GET /pairs/{id}/messages`, with `note` rows dropped per #2). Needs a new endpoint that returns the universe's keywords plus each user's raw per-keyword scores (`GET /universes/{id}/graph` only returns the 3D projection), and a way to know who the viewer is (user id from onboarding). | `client/`, `routers/matching.py` | |
| 51 | [x] **Agent world (2.5D pixel art).** `/admin/universes/[universeId]/world`: a PixiJS building (L2 study/music/arcade, L1 lounge/kitchen/party, B1 gym/bouldering/unplaced bench) where agents spawn in the lounge, A*-walk to rooms matching their keyword scores (public interests as fallback) on a 32x32 iso tilemap, pair up to talk for each judged pair, and sit at tables per CP-SAT group; unplaced people wait on B1. Click an agent for a bio card and camera follow; click a talking one for the transcript. Admin-only (the `/admin` basic auth in `client/src/proxy.ts`); linked from the overview and admin nav, uses admin group labels. Checked in headless Edge (all phases, sprite click, drawer, floors); see changelog. | `client/src/components/visualizer/`, `client/src/app/admin/universes/[universeId]/world/` | Matt-Chow |
| 8  | [ ] **Run the full pipeline on real Gemini** with the seed data. Record how long it takes, which pairs failed, and group sizes. If it takes longer than about 2 minutes, lower `max_conversation_turns` or `top_m` for the demo. Also count how many people the hard filter and CP-SAT leave out (see #17). | — | |
| 9 | [x] **Photon:** make `send_message` log and return instead of raising `NotImplementedError` (or implement it, if iMessage is part of the demo). Right now, setting the key fails the whole run after groups are saved. | `server/app/services/photon.py` | |
| 10 | [x] Wrap each `evaluate_group` call in error handling. One bad judge response currently fails the whole run. | `server/app/matching/groups.py` (`review_groups`) | |
| 19 | [x] ~~Clear the old results before re-running matching.~~ Done in `2cd6a5f` (`clear_results`). | `pipeline.py` | Caleb |
| 21 | [x] Set the status to `matching` inside the start request (`UPDATE ... WHERE status <> 'matching' RETURNING`) so a double click doesn't start two runs. Allow re-running a `matched` universe. | `routers/matching.py` | |
| 27 | [ ] Add a retry with backoff to Gemini calls. 8 conversations at once will hit rate limits. | `agent/llm.py` | |
| 11 | [ ] Prepend `CONVERSATION_KICKOFF` to the opening agent's history so it never starts with an `assistant` message. Check in #8 whether Gemini actually complains; skip this if it doesn't. | `agent/persona.py` | |
| 44 | [ ] **Deploy early** (server, client, shared DB) and redeploy as features land, so "works on my machine" problems show up early. | — | |
| 50 | [x] Include FastAPI CLI dependencies for deployment startup. | `server/pyproject.toml`, `server/uv.lock` | Codex |
| 52 | [x] Route OpenRouter scoring and pair judging through Jev's native System One API instead of emulating typed decisions with a generative chat model. | `agent/jev.py`, `server/app/deps.py` | Cursor |
| 53 | [x] **Admin "add person" for live demos.** `/admin/universes/[universeId]/add`: interview a judge in person for ~30s (Chrome dictation, iPhone mic via Continuity, or typing), one click builds their agent with the usual profile builder and adds them, onboarded. Shows public fields only, a QR to their `/u/<id>` page, "match now", and undo. Nobody is messaged; socials are scraped only with a consent tick. | `server/app/routers/admin_api.py`, `client/src/components/add-person.tsx` | Claude Code |
| 45 | [ ] **`DEMO.md`:** exact click path, which universe and invite code, time per step, who presents, and what to do if a live call fails (switch to the #43 fixture). | repo root | |

### Should: the demo is noticeably better or safer

| #  | Task | Where | Owner |
| -- | ---- | ----- | ----- |
| 25 | [x] ~~Score profiles in parallel.~~ Done in `2cd6a5f`. | `pipeline.py` | Caleb |
| 29 | [ ] Matching progress (pairs done out of total) plus a progress bar, so the live wait looks intentional. | pipeline, new endpoint, client | |
| 2  | [~] Done for `note` rows in `GET /pairs/{id}/messages`. `private` stays on `GET /users/{id}/profile` because users review it, and that needs auth (#1). Five minutes of work, and judges may ask about privacy. | `routers/matching.py`, `routers/onboarding.py` | |
| 15 | [ ] **Show unplaced people.** CP-SAT leaves out anyone it can't fit, and the group judge can drop one more per group. Neither is shown anywhere. At minimum, list them on the admin page. Better: put each in the best group with room that has no forbidden pair. | `groups.py`, `pipeline.py`, client | |
| 22 | [ ] Skip users with no built profile (half-finished onboarding during a live demo) and show the admin who isn't ready. | `repo.load_profiles`, pipeline | |
| 13 | [ ] Retry once when Gemini returns empty or invalid JSON (group judge, keywords, interviewer). The pair judge and scoring use Jev, which returns typed answers. Failed scoring already falls back to all 0.5. | `agent/judge.py` and others | |
| 24 | [x] ~~Match keyword scores by index.~~ Done with the Jev switch: answers come back keyed by question index (`score_{i}`), so names can't drift. | `scoring.py` | Caleb |
| 46 | [ ] Fake model mode (`FAKE_LLM=1`) that returns canned answers, so teammates can run the whole flow without a key or spending quota. It also works as a smoke test. | `agent/llm.py`, `server/app/deps.py` | |
| 47 | [ ] `Makefile`: `db`, `db-reset`, `server`, `client`, `simulate`, `test`. | repo root | |
| 48 | [ ] Generate TypeScript types from the API (`openapi-typescript http://localhost:8000/openapi.json`) so backend changes break the client build instead of breaking at demo time. | `client/` | |
| 12 | [x] Removed `end_conversation`; every pair now runs the configured fixed number of turns. | `agent/persona.py`, `tools.py` | Cursor |
| 28 | [x] ~~Ticketmaster: pass the group's most common city so events are local.~~ Done with group plans: a search area from members' `area`. | `plans.py` | |
| 50 | [ ] **Plan voting.** "i'm in / can't" per plan, per-member status, and "goes ahead at N yeses" from the design. Needs a table and endpoints. | `db/`, `routers/`, client | |
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
| 39 | [x] README cleanup | Do it at hour 22 if there's time; judges may read it. |
| 40 | [ ] Cost and latency logging | |
| 41 | [ ] Let users edit their generated profile | |
| 42 | [ ] Real Browser Use scrape | Only if scraping is part of the demo. LinkedIn will likely block it. |

---

## Suggested split for 4 people

This is a proposal. Rename or reshuffle as needed.

| Workstream                      | Must                     | Should              | Notes |
| ------------------------------- | ------------------------ | ------------------- | ----- |
| **A. Frontend**                 | 6, 49                    | 29 (UI), 48         | The biggest chunk. Build against the #43 fixture from hour 3; don't wait for the pipeline. |
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

- 2026-10-18: Admin "add person" page (#53) for 2-minute demos: `POST /admin/api/universes/{id}/people` stores the
  dictated or typed notes as the person's interview, runs `Interviewer.build_profile`, marks them onboarded and returns
  only the public profile. Also `GET /admin/api/users/{id}/public` (scrape progress) and `DELETE /admin/api/users/{id}`
  (undo). New client dependency `qrcode`; client `APP_URL` sets the QR's base URL. No schema change.
- 2026-10-18: Fix "you have a group" opening "no group yet": the group screens called `GET /users/{id}/group`,
  which was never added to the server. Added it (`me.py`, `UserGroup` schema, integration tests). The `you` tab now
  links to the group instead of repeating its members and plans.
- 2026-10-18: `db/dev_events_seed.sql`: 3 fake plans per demo group, themed by the group's strongest keyword, for
  groups with no events yet (real plans are left alone). Run by hand after `dev_graph_seed.sql`.
- 2026-10-18: #51 World is now one procedurally generated single-floor campus (branch `world-procedural`, M4-M8): layout from the universe's keywords (`world/select.ts` -> `world/plan.ts`, seeded by universe id + keyword set, stable when people join), drag-pan/zoom engine, agents act out only what the data says (`world/activity.ts`; chats are live only while `pairs.status = 'running'`), participant page `/u/{id}/world` with follow-me, admin real/demo switch (`/admin?mode=demo`), synthetic seeder `server/scripts/seed_synthetic.py`, Vitest tests and `client/scripts/world-check.mjs`. API client fetches are now `no-store`. Remaining: Paper structure drawings (conflict list for the user), real-model runs on synthetic people, merge `origin/main`.
- 2026-10-18: World integration M1-M3 (branch `world-procedural`): `GET /admin/api/universes/{id}/world` and `GET /users/{id}/world` snapshots with a `since` cursor; the pipeline records its stage and writes pairs as `running` at chat start; `universes.is_demo` (seeded fixtures marked demo). **Schema change:** apply `db/migrations/003_world.sql` (`./run.sh migrate`) or `docker compose down -v` locally. World generation started: preset library + keyword-driven structure selection with Vitest tests (`npm test` in `client/`).
- 2026-10-18: Lowered the default minimum group size from 4 to 3 and updated matching prompts and user-facing copy.
- 2026-10-18: Added rerunnable `db/seed_celebrity_fifteen.sql`: a separate 15-person public-figure universe
  (`celeb15`) with fictional demo profiles and onboarding transcripts for shorter live matching runs.
- 2026-10-17: Connections graphs: both views sit on a small spring layout (`client/src/lib/elastic.ts`). 2D pans,
  zooms (wheel, pinch, buttons) and lets you drag any dot, which stays where dropped; 3D dots can be dragged and
  spring back, PCA is rescaled per axis so people no longer clump, labels fade with depth, and your lines carry a
  decorative pulse out (ember) and back (periwinkle). "me" is labelled "me (name)". Chat bubbles alternate sides
  with an 18% margin and name the speaker on every turn. Type scale bumped (micro 10px, meta 10.5px, label 12px).
  Checked with lint, build and SSR smoke tests; not yet checked by hand in a browser.
- 2026-10-17: Added rerunnable `db/seed_celebrity_encore.sql`: a second 40-person universe (`encore40`) with
  different real public figures, 40 fictional public-persona profiles, and 160 onboarding messages. Closes #7.
- 2026-10-17: OpenRouter chat temperatures now belong to the rotated models rather than people: GPT-OSS is
  restrained (`0.50`), DeepSeek balanced (`0.80`), and GLM wild (`1.05`). Each pair samples ±`0.08` once and
  keeps that temperature for all turns; seeded profiles remain neutral (`0.70`).
- 2026-10-17: Pair agents now complete all configured turns instead of ending early, and the agent-world
  animation restarts when a late transcript arrives and stays active long enough to show every line.
- 2026-10-17: Candidate ranking now gives every person up to `TOP_M` outgoing proposals. Reciprocal proposals
  become one conversation and the rejected direction gets a next-best replacement (`n * TOP_M` maximum).
- 2026-10-17: Fixed batched `keyword_scores` persistence to cast serial keyword IDs as `int[]` rather than
  `uuid[]`; the earlier cast failed immediately after successful parallel scoring.
- 2026-10-17: OpenRouter Jev configuration now ignores stale chat-model entries (such as Claude or Gemini)
  and falls back to native `~typesafe/jev-latest`, preventing System One 400s after an env-only deployment.
- 2026-10-17: #52 OpenRouter now uses native Jev (`~typesafe/jev-latest`) through the System One endpoint for calibrated scoring and pair judging.
- 2026-10-17: Faster matching defaults (`top_m=4`, `max_conversation_turns=6`, `max_concurrent_conversations=50`), 512-token cap and multi-model Flash rotation defaults for OpenRouter chat, and batched/streamed DB writes (`save_signals`, `save_pair`, `save_group`).
- 2026-10-17: Tiger Data scripts: `db/migrate-tiger.sh` applies `db/migrations/` to the shared DB and `db/tiger-sql.sh`
  edits its data (psql shell, or SQL with a rolled-back dry run before commit). Both, and `db/push-to-tiger.sh`,
  share `db/tiger-lib.sh` and read `TIGER_DATABASE_URL` from `db/.env`. Tested against the local DB as target.
- 2026-10-17: #51 agent world matched to Paper: open warehouse floors (no walls, zone tints, pillars, design-system palette), overlays rebuilt to the "World visualizer" page (top bar, floor selector, pipeline HUD with auto/speed/follow, bio card with the agent's sprite as avatar, dialogue drawer with loading/empty states); Paper's canvas placeholders now show real renders and the legacy male/female sprite artboards were removed in favour of "Sprites · in-game". Headless-Edge check and layout check pass.
- 2026-10-17: Group plans: after matching, each group gets 3 events or activities from a Browser Use web search
  (Ticketmaster fallback), fitted in code to the group's shared free slot and lowest budget, shown on the `you` tab.
  New `groups.plans_status`/`plans_summary` and `events.time_label`/`price`/`reason`/`rank` columns
  (`db/migrations/002_group_plans.sql`), and `POST /groups/{id}/plans`. Closes #28; voting is #50.
- 2026-10-17: #51 follow-up: new admin-only `GET /admin/api/universes/{id}/scores` (keyword vectors and keyword-level
  dealbreakers, no private text; test added) drives room affinity and the bio card; floors are 32x32 pixel-art iso
  tiles; a headless-Edge run checked every phase, a real sprite click (glow, follow, bio card, transcript drawer),
  floor buttons and the wheel, with no console errors.
- 2026-10-17: Admin "abort matching" button (`POST /admin/api/universes/{id}/matching/abort`) cancels a run and reopens onboarding; `db/push-to-tiger.sh` replaces the Tiger Data tables with a copy of the local Docker DB.
- 2026-10-17: #51 agent world at `/admin/universes/[universeId]/world` (PixiJS 8 + `@pixi/react`, `pathfinding` A*, `pixi-filters` glow).
  Reads `/users`, `/graph`, `/pairs`, `/groups` and each profile's public part on the server; the browser never
  gets `private`. Polls every 5s while matching, so new pairs walk over and talk live. Lint, build and a
  layout/seating reachability check pass; rendering and clicks still need a look in a real browser.
  Gap: room choice uses public interests because no endpoint exposes per-user keyword names (see #49).
- 2026-10-17: Enabled the FastAPI `standard` extra and refreshed the server lockfile so deployment startup has the FastAPI CLI dependencies.
- 2026-10-17: `seed.sql` now has 40 celebrity profiles (athletes, actors, musicians, politicians, historical figures) in 8 clusters of 5 with dealbreaker clashes; `dev_graph_seed.sql` follows with 8 clusters.
- 2026-10-17: OpenRouter can now stand in for both Gemini and Jev (one key runs the pipeline); conversations and `main.py` log at INFO.
- 2026-10-17: Added #49 (3D keyword playground with user-picked axes and clickable chat transcripts).
- 2026-10-17: Jev (TypeSafe) now scores keywords, dealbreakers, and availability, and judges pair
  chemistry. Gemini still does keywords, chats, and the group judge. Needs `TYPESAFE_API_KEY`. Closes #24.
- 2026-10-17: Pipeline rewritten (`2cd6a5f`): keywords + hard filter + CP-SAT groups. Closes #19 and #25.
- 2026-10-17: Reranked the TODOs for the hackathon MVP; added #43-48.
- 2026-10-17: Client skeleton added (`ff06aff`).
- 2026-10-17: Wrote this file after reviewing the code at `68cb046`.
- 2026-10-17: Hardening (`temp_store` merged into `main`): config bounds checks and a group-size check,
  stage logging in the pipeline, `review_groups` falls back to an unreviewed neutral verdict on judge errors
  (#10), Photon logs instead of raising (#9), matching start is an atomic claim so a double click gets a 409
  (#21), pair messages no longer expose private agent notes (#2, partly). Test setup fixed: tests no longer
  wipe tables, and DB tests are skipped without `DATABASE_URL_TEST`. Added `server/.env.example`.
- 2026-10-17: Docs audit: README is now the canonical overview (status table, architecture, env vars, API, DB,
  testing, deployment gaps, roadmap); AGENTS.md is the agent operating guide (commands, ownership, rules);
  `.env.example` lists every setting. Closes #39.
