# Handoff: procedural World integration (temporary; delete when done)

Paste this file (or point Claude at it) to continue. It is untracked and not part of the product.

## The goal (condensed from the user's `/goal`)
Integrate the World mockup into unif.ai with real PostgreSQL data, backend APIs, incoming users, agents and the
matching pipeline. Single floor, explorable, procedurally generated **only** from keywords actually present;
drag-to-pan + zoom; reusable preset library; deterministic seeded layouts that don't regenerate when people join;
agents shown at their structures; real conversations from `pair_messages` (never private `note` rows); live vs
completed vs historical clearly distinguished, **never fabricate live activity**; demo/real isolation; repeatable
tests; update README.md / AGENTS.md / PROGRESS.md. Read `AGENTS.md` and `client/AGENTS.md` (this Next.js has
breaking changes; docs in `client/node_modules/next/dist/docs/`) first.

## Decisions the user made (do not re-ask)
- Show **completed** chats (not every one; cap ~40, labelled). Record pipeline progress so the World shows it live.
- Mid-onboarding people appear and show as **busy**. Polling with a version cursor (3-5 s).
- Participants see the same World minus hidden things (no dealbreakers/scores/flags/rationales); they see other
  people's sprites and names; add a "follow my character" control. Admins read every transcript.
- Keyword→structure: both hand-written synonyms and co-scores; unmatched keywords: leave out (or follow their crowd).
- **One structure per keyword cluster/preset**, min **2 people** to justify one; size, decoration and population
  all scale with the crowd. Always-present shared spaces: **spawn plaza + central meeting square**.
- Seed = universe id + keyword set (so a re-run with the same keywords keeps the layout). Organic campus, fixed-size
  map with empty land + decorative filler (trees, lamps...). Open-plan zones (merged structures share a zone).
- Agents **wander** their structures; pairs **walk to meet** for a live chat; completed chats only on selection;
  groups gather at a structure. Support 40-60 people.
- Demo flag: DB column `universes.is_demo`. Real-model end-to-end runs on synthetic people eventually. Vitest OK.
- Paper catalog ("World catalog · single floor" page, 18 rooms x 4 variants) is **general direction, not spec**.
  In-game sprites stay as they are; no new UI (overlays stay as the Paper "World visualizer" page).
- Paper drawings of structures are still being added; when they land, list **each conflict** with the existing
  boards as easy choices for the user before finalising visuals. (Paper MCP was disconnected last session.)

## Branch and state
Branch `world-procedural` (off merged `main` 6aaba26), **not pushed**. Commits:
- `71e4a07` **M1+M2+M8a server**: `server/app/routers/world.py` (`GET /admin/api/universes/{id}/world?since=`,
  `GET /users/{id}/world?since=`), `universes.matching_stage`/`is_demo`, `pairs.status` (`running`|`complete`) +
  `completed_at`, pipeline writes pairs `running` at chat start (`start_pair`/`drop_running_pair`/`save_pair`),
  judged-pair queries filter `status='complete'`, admin list `?mode=real|demo|all`, migration
  `db/migrations/003_world.sql`, tests `server/tests/integration/test_world.py` (server suite: 54 pass).
- `38116bf` M3 presets/selection + Vitest. `35482bd` docs. `1262299` **M4** layout.
- Client pure modules in `client/src/components/visualizer/world/`: `geometry.ts` (floor-free iso projection,
  `rng`/`hash`, furniture/spot types, `circleSeats`), `presets.ts` (19 presets w/ variants, `SIZES`, `SHARED`),
  `match.ts`, `select.ts` (`selectStructures`, MIN_PEOPLE=2, merge overlap 0.6, tiers), `plan.ts`
  (`planWorld(selection, seed)` -> `WorldPlan`: zones, furniture, paths, spots, circles, chatSpots, spawnTiles,
  benches, walk matrix; MAP 72x60; `worldSeed(universeId, keywords)`), `fixtures/*.world.json` (snapshots of the
  seeded LA Hacks universe and UI Demo), tests (37 pass with activity tests): `npx vitest run` in `client/`.

**Uncommitted working tree (client build currently BROKEN):**
- `client/src/components/visualizer/scenery.ts` rewritten to `buildScene(plan: WorldPlan) -> {ground, entities,
  labels, animators}` with ported furniture + new pieces (workbench, easel, planter, pen, tent, telescope, tree,
  bush, flowers, fountain, signpost). `tiles.ts` rewritten to `buildTileLayer(plan)` (grass/path/zone tints).
- `world/snapshot.ts` (TS types of the server snapshot) and `world/activity.ts` (+`activity.test.ts`):
  `deriveActivity(snapshot, selection, plan, now)` -> intents per member (`spawn`/`meet`/`group`/`bench`/`wander`),
  `live` pairs (only `status==='running'`), `replayable` completed chats with `provenance` live|completed|historical.
  (activity tests were passing when written.)
- Still on the OLD three-floor code and importing deleted things: `engine.ts`, `agent.ts` (floor/elevator/ride),
  `director.ts`, `layout.ts`, `WorldCanvas.tsx` props, `world-stage.tsx`, the admin world `page.tsx`/`actions.ts`.
  `character.ts`/`sprites.ts`/`hud.tsx`/`bio-card.tsx`/`dialogue-drawer.tsx`/`pipeline-hud.tsx`/`agent-avatar.tsx`
  are reusable (they use `types.ts` WorldData/WorldAgent; will need adapting to the snapshot).

## Remaining work (in order)
1. **M5 engine rewrite** (`engine.ts`): one `Container` camera, `buildScene(plan)`, A* over `plan.walk` (pathfinding
   lib is already a dependency), pointer-drag pan, wheel + pinch + +/- zoom with min/max and clamped bounds,
   follow-selected, cull off-screen. `agent.ts`: remove `FloorId`/ride/elevator; use `tileToScreen`/`depthOf`
   from `world/geometry`. Delete `layout.ts`/`director.ts` once unused (move anything still needed). Keep the dev
   hooks `window.__unifaiWorld.snapshot()/exportSheets()` (the Edge test uses them).
2. **M6 visual**: engine takes `(snapshot, selection, plan, activity)`; applies intents (wander within home zone
   spots/paths; meet = walk to `spot`, then TALKING with bubble; group = sit at circle seat; bench; spawn). Replays
   of completed chats only on selection, badge **live / completed / replay / historical**. Poll the snapshot with
   `?since=` every ~4 s (server component can't poll: use a client fetch to a Next route or server action that
   calls `api` with the admin password; never expose the password to the browser). Zone labels from `Scene.labels`.
3. **M7 participant page** `/u/[userId]/world` using `GET /users/{id}/world` (no scores/dealbreakers/rationales;
   other pairs have `id: null`, so no transcript fetch for them) + "follow me" button. Bio card/drawer must hide
   admin-only fields when absent.
4. **M8b**: synthetic-universe seeder script (10/100/500 people, `is_demo=true`, no model calls) +
   admin mode switch (real/demo) in the World/admin pages (`GET /admin/api/universes?mode=`).
5. **M9**: commit the headless-Edge check as a script (`client/scripts/` or `design/`), run Vitest in `npm test`,
   docs (README endpoints/architecture, AGENTS.md rules, PROGRESS.md task + changelog), then merge
   `origin/main` (it moved: group-screen UI, connections graph pan/zoom, scraping...) and resolve conflicts.
6. Paper: when structure drawings are added, present each conflict as simple choices before restyling.

## How to run / verify
- DB: `docker compose -f db/docker-compose.yml up -d` (container `unifai-db`; DBs `unifai`, `unifai_test`; apply
  `db/migrations/003_world.sql` to both - already applied locally). Seed: `db/seed.sql` then
  `db/dev_graph_seed.sql`; `cd server && uv run python -m scripts.seed_demo` (UI Demo, id
  `ba24ca67-5f3b-5476-b4bb-3bf166b43627`; LA Hacks id `00000000-0000-0000-0000-000000000001`).
- Windows quirk: psycopg async needs a SelectorEventLoop. Scratch helpers (not in repo, may be gone): a uvicorn
  launcher using `asyncio.run(server.serve(), loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector()))`
  and a pytest plugin `pytest_asyncio_loop_factories` returning the same. Set `UV_LINK_MODE=copy`.
- Tests: `cd server && uv run --extra scrape pytest` (DB tests need `DATABASE_URL_TEST=postgresql://unifai:unifai@localhost:5432/unifai_test`),
  `cd agent && uv run pytest`, `cd client && npm test && npm run lint && npm run build`, `cd onboarding && npm test`.
- Browser check: headless Edge via puppeteer-core (was in the scratchpad; reinstall `puppeteer-core@24.10.0` in a
  scratch dir; Edge at `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`, args
  `--use-angle=swiftshader --enable-unsafe-swiftshader`). Dev server: `cd client && npm run dev` (port 3001,
  needs `ADMIN_PASSWORD` unset locally), API on 8000. If the dev server shows stale errors, delete `client/.next/dev`.

## Gotchas
- Private data rule: never read `agent_profiles.private` text or `kind='note'` messages into anything client-bound.
- `git add` with bracketed paths (`[universeId]`) needs `:(literal)` pathspecs; use Bash for those.
- `origin/main` is ahead by ~8 commits (incl. "set min group size to 3", UI changes): expect conflicts in
  PROGRESS.md/README.md/client files when merging. Git identity is set globally to the user's GitHub noreply.
- Do not push or merge to main without the user's say-so.
