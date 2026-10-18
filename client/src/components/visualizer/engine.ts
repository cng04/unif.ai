// The running single-floor World: scene graph, A* routing over the plan's walk matrix, the agents acting out
// what activity.ts derived from real data (never anything invented), replays of completed chats on request, and
// the camera (drag to pan, wheel / buttons to zoom, follow the selected agent).

import PF from "pathfinding";
import { Container, type Application, type FederatedPointerEvent, type Filter } from "pixi.js";
import { GlowFilter, OutlineFilter } from "pixi-filters";
import { AgentSprite, arrivalFor, type Task } from "./agent";
import { buildScene, type Scene } from "./scenery";
import type { AgentState } from "./types";
import type { Activity, Intent } from "./world/activity";
import { hash, mapBounds, rng, tileToScreen, type Spot } from "./world/geometry";
import { tileKey, type WorldPlan, type Zone } from "./world/plan";
import type { WorldSnapshot } from "./world/snapshot";

export type EngineEvents = {
  onSelect: (id: string | null) => void;
  onFollow: (following: boolean) => void;
  /** Pairs talking right now (server says running) and the replay in progress, if any. */
  onStatus: (status: { live: string[]; replay: string | null }) => void;
};

export type AgentInfo = { state: AgentState; zone: string; talkingPair: string | null; replaying: boolean };

type Brain = { key: string; nextAt: number };

const NEON = 0x7cffea;
export const MIN_SCALE = 0.35;
export const MAX_SCALE = 3.2;
const REPLAY_SECONDS = 14;

export class WorldEngine {
  private world = new Container();
  private scene: Scene | null = null;
  private plan: WorldPlan | null = null;
  private grid: PF.Grid | null = null;
  private finder = new PF.AStarFinder({ diagonalMovement: PF.DiagonalMovement.Never });
  private filters: Filter[] = [
    new OutlineFilter({ thickness: 1.2, color: NEON, quality: 0.25 }),
    new GlowFilter({ distance: 10, outerStrength: 2.4, innerStrength: 0, color: NEON, quality: 0.3 }),
  ];

  private activity: Activity | null = null;
  private agents = new Map<string, AgentSprite>();
  private brains = new Map<string, Brain>();
  private reserved = new Map<string, string>();
  private replay: { key: string; a: string; b: string; until: number } | null = null;
  private speed = 1;
  private simT = 0;
  private statusAt = 0;
  private random = rng(7);

  private selected: string | null = null;
  private following = false;
  private cam = { x: 0, y: 0, scale: 1 };
  private target = { x: 0, y: 0, scale: 1 };
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private suppressTap = false;
  private cleanup: (() => void)[] = [];

  constructor(private app: Application, private events: EngineEvents) {
    app.stage.addChild(this.world);
    app.stage.eventMode = "static";
    app.stage.hitArea = app.screen;
    app.stage.on("pointertap", (e: FederatedPointerEvent) => {
      if (e.target === app.stage && !this.suppressTap) this.select(null);
    });
    this.bindInput(app.canvas);
  }

  // ---------- public API ----------

  /** Hand the engine the latest data. The scene is rebuilt only when the generated layout actually changed. */
  setWorld(snapshot: WorldSnapshot, plan: WorldPlan, activity: Activity) {
    const layoutChanged = !this.plan || this.plan.seed !== plan.seed || this.plan.zones.length !== plan.zones.length;
    this.activity = activity;
    if (layoutChanged) this.buildScene(plan);

    const ids = new Set(snapshot.members.map((m) => m.id));
    for (const [id, sprite] of this.agents)
      if (!ids.has(id)) {
        this.release(id);
        sprite.destroy();
        this.agents.delete(id);
        this.brains.delete(id);
        if (this.selected === id) this.select(null);
      }
    for (const m of snapshot.members) {
      const existing = this.agents.get(m.id);
      if (existing) existing.name = m.name;
      else this.spawn(m.id, m.name);
    }
    this.applyIntents();
  }

  setSpeed(speed: number) {
    this.speed = speed;
  }

  select(id: string | null, follow = true) {
    if (this.selected) this.agents.get(this.selected)?.setSelected(false, this.filters);
    this.selected = id && this.agents.has(id) ? id : null;
    if (this.selected) this.agents.get(this.selected)!.setSelected(true, this.filters);
    this.setFollow(Boolean(this.selected) && follow);
    this.events.onSelect(this.selected);
  }

  setFollow(on: boolean) {
    if (on === this.following) return;
    this.following = on && Boolean(this.selected);
    this.events.onFollow(this.following);
  }

  /** Zoom around the view centre (or a screen point), clamped. */
  zoomBy(factor: number, at?: { x: number; y: number }) {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.target.scale * factor));
    const sx = at?.x ?? this.app.screen.width / 2;
    const sy = at?.y ?? this.app.screen.height / 2;
    const wx = this.target.x + (sx - this.app.screen.width / 2) / this.target.scale;
    const wy = this.target.y + (sy - this.app.screen.height / 2) / this.target.scale;
    this.target.scale = next;
    this.target.x = wx - (sx - this.app.screen.width / 2) / next;
    this.target.y = wy - (sy - this.app.screen.height / 2) / next;
    this.clamp(this.target);
    this.setFollow(false);
  }

  /** Centre the view on the meeting square at a comfortable zoom. */
  resetView() {
    if (!this.plan) return;
    const square = this.plan.zones.find((z) => z.id === "square")!;
    const c = tileToScreen(square.x + square.w / 2, square.y + square.h / 2);
    this.target = { x: c.x, y: c.y, scale: Math.min(2, Math.max(0.8, this.app.screen.width / 760)) };
    this.setFollow(false);
  }

  centerOn(id: string) {
    const s = this.agents.get(id);
    if (!s) return;
    const p = tileToScreen(s.gx, s.gy);
    this.target.x = p.x;
    this.target.y = p.y - 12;
  }

  /** Re-enact a completed chat between two agents in the square, until `REPLAY_SECONDS` pass. Labelled as a
   * replay by the UI; it never runs for a live pair (those are driven by the server's `running` status). */
  startReplay(key: string, a: string, b: string) {
    if (!this.plan || !this.agents.has(a) || !this.agents.has(b)) return;
    const live = new Set(this.activity?.live ?? []);
    if (live.has(key)) return;
    const spots = (this.plan.chatSpots.square ?? []).find(([x, y]) => !this.reserved.has(tileKey(x.x, x.y)) && !this.reserved.has(tileKey(y.x, y.y)));
    if (!spots) return;
    this.stopReplay();
    this.replay = { key, a, b, until: this.simT + REPLAY_SECONDS };
    for (const [id, spot, partner] of [[a, spots[0], b], [b, spots[1], a]] as const) {
      this.release(id);
      this.reserved.set(tileKey(spot.x, spot.y), id);
      this.brains.get(id)!.key = `replay:${key}`;
      this.go(id, spot, "IDLE", `replay:${key}`, partner);
    }
  }

  stopReplay() {
    if (!this.replay) return;
    const { a, b } = this.replay;
    this.replay = null;
    for (const id of [a, b]) {
      this.release(id);
      const brain = this.brains.get(id);
      if (brain) brain.key = "";
    }
    this.applyIntents();
  }

  info(id: string): AgentInfo | null {
    const sprite = this.agents.get(id);
    if (!sprite || !this.plan) return null;
    const intent = this.activity?.intents[id];
    const replaying = this.replay?.a === id || this.replay?.b === id;
    return {
      state: sprite.state,
      zone: this.zoneAt(sprite.gx, sprite.gy)?.name ?? "the grounds",
      talkingPair: replaying ? this.replay!.key : intent?.kind === "meet" ? intent.pair : null,
      replaying,
    };
  }

  /** Test hook (dev builds only): each agent's state and canvas-pixel position, plus the camera. */
  testSnapshot() {
    return {
      scale: this.cam.scale,
      selected: this.selected,
      following: this.following,
      live: this.activity?.live ?? [],
      replay: this.replay?.key ?? null,
      agents: [...this.agents.values()].map((s) => {
        const p = tileToScreen(s.gx, s.gy);
        return {
          id: s.id, name: s.name, state: s.state, gx: s.gx, gy: s.gy,
          x: this.world.x + p.x * this.cam.scale, y: this.world.y + (p.y - 12) * this.cam.scale,
        };
      }),
    };
  }

  /** Design hook (dev builds only): each agent's sprite sheet as a PNG data URL, upscaled without smoothing. */
  exportSheets(scale = 1) {
    return [...this.agents.values()].map((s) => {
      const src = s.sheetCanvas;
      const out = document.createElement("canvas");
      out.width = src.width * scale;
      out.height = src.height * scale;
      const ctx = out.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(src, 0, 0, out.width, out.height);
      return { id: s.id, name: s.name, png: out.toDataURL("image/png") };
    });
  }

  update(dt: number) {
    const simDt = Math.min(dt, 0.1) * this.speed;
    this.simT += simDt;
    if (this.replay && this.simT >= this.replay.until) this.stopReplay();
    this.wander();
    this.converse();
    for (const sprite of this.agents.values()) sprite.update(simDt, this.simT);
    for (const animate of this.scene?.animators ?? []) animate(this.simT);
    this.updateCamera(dt);
    if (this.simT >= this.statusAt) {
      this.statusAt = this.simT + 0.5;
      this.events.onStatus({ live: this.activity?.live ?? [], replay: this.replay?.key ?? null });
    }
  }

  destroy() {
    for (const fn of this.cleanup) fn();
    for (const sprite of this.agents.values()) sprite.destroy();
    this.agents.clear();
    this.world.destroy({ children: true });
  }

  // ---------- scene ----------

  private buildScene(plan: WorldPlan) {
    this.scene?.ground.destroy({ children: true });
    this.scene?.entities.destroy({ children: false });
    this.scene?.labels.destroy({ children: true });
    this.plan = plan;
    this.grid = new PF.Grid(plan.walk);
    this.scene = buildScene(plan);
    this.world.removeChildren();
    this.world.addChild(this.scene.ground, this.scene.entities, this.scene.labels);
    // Agents that already exist move into the new scene.
    for (const sprite of this.agents.values()) this.scene.entities.addChild(sprite.root);
    for (const brain of this.brains.values()) brain.key = "";
    this.reserved.clear();
    if (!this.viewSet) {
      this.viewSet = true;
      this.resetView();
      this.cam = { ...this.target };
    }
  }

  private viewSet = false;

  private spawn(id: string, name: string) {
    if (!this.plan || !this.scene) return;
    const tiles = this.plan.spawnTiles;
    const t = tiles[hash(id) % tiles.length];
    const sprite = new AgentSprite(id, name, t.x, t.y, (agent) => {
      if (!this.suppressTap) this.select(agent.id);
    });
    this.scene.entities.addChild(sprite.root);
    this.agents.set(id, sprite);
    this.brains.set(id, { key: "", nextAt: 0 });
  }

  private zoneAt(x: number, y: number): Zone | undefined {
    const gx = Math.round(x);
    const gy = Math.round(y);
    return this.plan?.zones.find((z) => gx >= z.x && gy >= z.y && gx < z.x + z.w && gy < z.y + z.h);
  }

  // ---------- behaviour ----------

  private applyIntents() {
    if (!this.activity || !this.plan) return;
    for (const [id, intent] of Object.entries(this.activity.intents)) {
      const brain = this.brains.get(id);
      if (!brain || this.replay?.a === id || this.replay?.b === id) continue;
      const key = intentKey(intent);
      if (key === brain.key) continue;
      brain.key = key;
      brain.nextAt = 0;
      this.release(id);
      switch (intent.kind) {
        case "spawn": {
          const t = this.plan.spawnTiles[hash(id) % this.plan.spawnTiles.length];
          this.go(id, { x: t.x, y: t.y, dir: "S", pose: "stand", activity: "chill" }, intent.thinking ? "THINKING" : "IDLE", key);
          break;
        }
        case "meet":
          this.go(id, intent.spot, "IDLE", key, intent.partner);
          break;
        case "group":
          this.go(id, intent.spot, arrivalFor(intent.spot), key);
          break;
        case "bench":
          if (intent.spot) this.go(id, intent.spot, "SITTING", key);
          else this.goToZone(id, "square", key);
          break;
        case "wander":
          break; // picked on a timer in wander()
      }
    }
  }

  /** Walk an agent to `spot`; `arrive` is its state on arrival. */
  private go(id: string, spot: Spot, arrive: Task["arrive"], key: string, partner?: string) {
    const sprite = this.agents.get(id);
    if (!sprite || !this.plan) return;
    this.reserved.set(tileKey(spot.x, spot.y), id);
    const task: Task = {
      key: `${key}:${spot.x},${spot.y}`, x: spot.x, y: spot.y, dir: spot.dir, arrive,
      activity: spot.activity, seated: spot.pose === "sit",
    };
    if (partner) this.partners.set(id, partner);
    else this.partners.delete(id);
    sprite.assign(task, this.route(sprite, task.x, task.y));
  }

  private partners = new Map<string, string>();

  private goToZone(id: string, zoneId: string, key: string) {
    const zone = this.plan?.zones.find((z) => z.id === zoneId);
    const tile = zone && this.freeTileIn(zone);
    if (tile) this.go(id, { ...tile, dir: "S", pose: "stand", activity: "chill" }, "IDLE", key);
  }

  private freeTileIn(zone: Zone): { x: number; y: number } | null {
    const walk = this.plan!.walk;
    for (let i = 0; i < 40; i++) {
      const x = zone.x + Math.floor(this.random() * zone.w);
      const y = zone.y + Math.floor(this.random() * zone.h);
      if (!walk[y][x] && !this.reserved.has(tileKey(x, y))) return { x, y };
    }
    return null;
  }

  /** Ambient life for people with no pipeline-driven task: a stroll or an activity spot in a home structure. */
  private wander() {
    if (!this.activity || !this.plan) return;
    for (const [id, intent] of Object.entries(this.activity.intents)) {
      if (intent.kind !== "wander" || this.replay?.a === id || this.replay?.b === id) continue;
      const sprite = this.agents.get(id);
      const brain = this.brains.get(id);
      if (!sprite || !brain || !sprite.arrived || this.simT < brain.nextAt) continue;
      this.release(id);
      const zoneId = intent.zones[Math.floor(this.random() * intent.zones.length)];
      const zone = this.plan.zones.find((z) => z.id === zoneId) ?? this.plan.zones.find((z) => z.id === "square")!;
      const spots = (this.plan.spots[zone.id] ?? []).filter((s) => !this.reserved.has(tileKey(s.x, s.y)));
      brain.nextAt = this.simT + 6 + this.random() * 9;
      if (spots.length && this.random() < 0.55) {
        const spot = spots[Math.floor(this.random() * spots.length)];
        this.go(id, spot, arrivalFor(spot), `wander:${this.simT.toFixed(1)}`);
      } else {
        const tile = this.freeTileIn(zone);
        if (tile) this.go(id, { ...tile, dir: "S", pose: "stand", activity: "chill" }, "IDLE", `wander:${this.simT.toFixed(1)}`);
      }
    }
  }

  /** Once both partners of a chat (live, or a replay) have arrived they face each other and take turns. */
  private converse() {
    for (const [id, partnerId] of this.partners) {
      const a = this.agents.get(id);
      const b = this.agents.get(partnerId);
      if (!a || !b || !a.arrived || !b.arrived) continue;
      if (a.state !== "TALKING") a.setState("TALKING");
      a.speaking = (Math.floor(this.simT / 2.2) + (id < partnerId ? 0 : 1)) % 2 === 0;
    }
    for (const [id, sprite] of this.agents)
      if (!this.partners.has(id) && sprite.state === "TALKING") {
        sprite.speaking = false;
        sprite.setState("IDLE");
      }
  }

  private release(id: string) {
    for (const [k, v] of this.reserved) if (v === id) this.reserved.delete(k);
    this.partners.delete(id);
  }

  private route(sprite: AgentSprite, tx: number, ty: number): { x: number; y: number }[] {
    const sx = Math.round(sprite.gx);
    const sy = Math.round(sprite.gy);
    const steps: { x: number; y: number }[] = [];
    if (sx !== sprite.gx || sy !== sprite.gy) steps.push({ x: sx, y: sy });
    if (sx === tx && sy === ty) return steps.length ? steps.concat([{ x: tx, y: ty }]) : [];
    const found = this.finder.findPath(sx, sy, tx, ty, this.grid!.clone());
    // No path (e.g. standing on a tile that became blocked): walk straight there.
    if (found.length < 2) return steps.concat([{ x: tx, y: ty }]);
    return steps.concat(found.slice(1).map(([x, y]) => ({ x, y })));
  }

  // ---------- camera and input ----------

  private clamp(c: { x: number; y: number }) {
    if (!this.plan) return;
    const b = mapBounds(this.plan.width, this.plan.height);
    c.x = Math.min(b.maxX, Math.max(b.minX, c.x));
    c.y = Math.min(b.maxY, Math.max(b.minY, c.y));
  }

  private updateCamera(dt: number) {
    if (this.following && this.selected) {
      const s = this.agents.get(this.selected);
      if (s) {
        const p = tileToScreen(s.gx, s.gy);
        this.target.x = p.x;
        this.target.y = p.y - 12;
      }
    }
    this.clamp(this.target);
    const k = Math.min(1, dt * 8);
    this.cam.x += (this.target.x - this.cam.x) * k;
    this.cam.y += (this.target.y - this.cam.y) * k;
    this.cam.scale += (this.target.scale - this.cam.scale) * k;
    this.world.scale.set(this.cam.scale);
    this.world.position.set(
      Math.round(this.app.screen.width / 2 - this.cam.x * this.cam.scale),
      Math.round(this.app.screen.height / 2 - this.cam.y * this.cam.scale),
    );
  }

  private bindInput(canvas: HTMLCanvasElement) {
    const rect = () => canvas.getBoundingClientRect();
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = rect();
      this.zoomBy(Math.exp(-e.deltaY * 0.0015), { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    const onDown = (e: PointerEvent) => {
      this.drag = { x: e.clientX, y: e.clientY, moved: false };
      this.suppressTap = false;
    };
    const onMove = (e: PointerEvent) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      if (!this.drag.moved && Math.hypot(dx, dy) < 5) return;
      this.drag.moved = true;
      this.setFollow(false);
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      for (const c of [this.target, this.cam]) {
        c.x -= dx / this.cam.scale;
        c.y -= dy / this.cam.scale;
        this.clamp(c);
      }
    };
    const onUp = () => {
      if (this.drag?.moved) this.suppressTap = true;
      this.drag = null;
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    canvas.style.touchAction = "none";
    canvas.style.cursor = "grab";
    this.cleanup.push(() => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    });
  }
}

function intentKey(i: Intent): string {
  switch (i.kind) {
    case "spawn": return `spawn:${i.thinking}`;
    case "meet": return `meet:${i.pair}:${i.spot.x},${i.spot.y}`;
    case "group": return `group:${i.group}:${i.spot.x},${i.spot.y}`;
    case "bench": return `bench:${i.spot ? `${i.spot.x},${i.spot.y}` : "-"}`;
    case "wander": return `wander:${i.zones.join(",")}`;
  }
}
