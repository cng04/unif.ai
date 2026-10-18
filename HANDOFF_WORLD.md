# Handoff: procedural World (temporary; delete when done)

State as of the last session. Branch `world-procedural` (local only, **not pushed**, merged with `origin/main`
at `71c5acc`). Work is functionally complete; what's left is decisions and polish.

## Done and verified
- Server: `GET /admin/api/universes/{id}/world?since=` and `GET /users/{id}/world?since=` (participant view hides
  scores, dealbreakers, judge flags/rationales, other people's pair ids); pipeline records `universes.matching_stage`
  and writes pairs `running` at chat start / `complete` when judged (merged with upstream's streaming saves);
  `universes.is_demo`; migration `db/migrations/003_world.sql` (apply to any other database).
- Client `client/src/components/visualizer/world/`: `presets.ts` (19 themed presets with variants), `match.ts`,
  `select.ts` (one structure per preset, >= 2 people, merges overlapping crowds), `plan.ts` (seeded organic campus,
  72x60, paths, decor; seed = universe id + keyword set), `activity.ts` (intents from data only; live = `running`),
  `snapshot.ts`. Renderer: `engine.ts` (drag-pan, wheel/+/- zoom, follow, A*), `scenery.ts`, `tiles.ts`, `agent.ts`.
  Overlays: `WorldCanvas.tsx`, `pipeline-hud.tsx`, `bio-card.tsx`, `dialogue-drawer.tsx`.
- Pages: `/admin/universes/{id}/world` (admin) and `/u/{id}/world` (participant, follows own agent).
- Admin list `/admin` = real universes; `/admin?mode=demo` = demo/test. Seeders: `server/scripts/seed_demo.py`,
  `db/dev_graph_seed.sql`, `server/scripts/seed_synthetic.py --people N --stage matched|matching|onboarding`.
- Tests (all green on the merge): server 59, agent 13, client Vitest 37 (`npm test`), lint + build clean,
  `client/scripts/world-check.mjs` (headless Edge; `npm i --no-save puppeteer-core`).
- Docs updated: README.md, AGENTS.md, PROGRESS.md.

## Still open
1. **Paper structure drawings**: user is still adding them. When present, list every conflict with the existing
   visuals as simple choices before restyling (preset art lives in `scenery.ts` `drawFurniture` + `presets.ts`).
2. **Real-model end-to-end run on synthetic people** (user asked "eventually"): needs model keys; use
   `seed_synthetic.py --stage onboarding` then start matching from the admin.
3. Layout: adding a *new structure* can shift later-placed ones (placement is first-fit in seeded order); members
   joining never do. Consider reserving fixed slots if that matters.
4. Performance: ~11 fps in software-rendered headless Edge with 60 agents (static tiles are cached as one texture);
   untested on a real GPU. Next lever: cull/cache static decor.
5. Not done: participant scoping is still link-id only (no auth, as elsewhere); `docker` stack doesn't run the client.
6. Decide when to push/merge `world-procedural` into `main` (needs the user's go-ahead) and delete this file.

## Run it
- DB: `docker compose -f db/docker-compose.yml up -d`; apply migrations to `unifai` and `unifai_test`.
- API (Windows needs a SelectorEventLoop launcher for psycopg async; uvicorn alone fails), client: `cd client &&
  npm run dev` (port 3001). `UV_LINK_MODE=copy`. Server tests: `cd server && uv run pytest` (DB tests need
  `DATABASE_URL_TEST`; Windows needs the same loop workaround via a pytest plugin).
- Gotchas: private `agent_profiles.private`/`note` rows never go client-bound; `git add` with `[brackets]` paths
  needs `:(literal)`; if the dev server shows stale errors delete `client/.next/dev` and `.next/cache`.
