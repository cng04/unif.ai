// The running world: scene graph, A* routing across floors, the director loop that turns pipeline data
// into tasks (rooms, conversations, group tables), and the camera (fit-to-width, vertical floor scroll).

import PF from "pathfinding";
import { Container, Text, type Application, type FederatedPointerEvent, type Filter } from "pixi.js";
import { GlowFilter, OutlineFilter } from "pixi-filters";
import { AgentSprite, arrivalFor, type RouteStep, type Task } from "./agent";
import { assignGroupSeats, homeRoom, resolvePhase, type Seat } from "./director";
import {
  ELEVATOR, FLOORS, FLOOR_GAP, FLOOR_H, FLOOR_W, ROOM_BY_ID, ROOMS, WORLD_H, floorTop, rng, roomAt,
  tileToWorld, walkMatrix, type FloorId, type Room, type RoomId, type Spot,
} from "./layout";
import { buildFloor, type FloorScene } from "./scenery";
import type { AgentState, ChatLine, Phase, ViewMode, WorldData, WorldPair } from "./types";

export type EngineEvents = {
  onSelect: (id: string | null) => void;
  onFloor: (floor: FloorId) => void;
  onFollow: (following: boolean) => void;
  onStatus: (status: { phase: Phase; talking: string[] }) => void;
  onNeedMessages: (pairId: string) => void;
};

export type AgentInfo = { state: AgentState; room: string; floor: FloorId; talkingPairId: string | null };

type Brain = {
  home: RoomId;
  mode: "free" | "chat" | "group";
  nextAt: number;
  /** Seconds to stay once the current task is reached. */
  dwell: number | null;
  reserved: string[];
  seat: Seat | null;
};

type Convo = {
  pair: WorldPair;
  a: AgentSprite;
  b: AgentSprite;
  createdAt: number;
  startedAt: number | null;
  until: number;
  line: number;
  nextLineAt: number;
};

const NEON = 0x7cffea;
/** `nextAt` sentinel: plan again right away, even mid-walk. */
const REPLAN_NOW = -1;
const tileKey = (floor: FloorId, x: number, y: number) => `${floor}:${x},${y}`;

export class WorldEngine {
  private camera = new Container();
  private floors = {} as Record<FloorId, { root: Container; scene: FloorScene }>;
  private grids = {} as Record<FloorId, PF.Grid>;
  private finder = new PF.AStarFinder({ diagonalMovement: PF.DiagonalMovement.Never });
  private filters: Filter[] = [
    new OutlineFilter({ thickness: 1.2, color: NEON, quality: 0.25 }),
    new GlowFilter({ distance: 10, outerStrength: 2.4, innerStrength: 0, color: NEON, quality: 0.3 }),
  ];

  private data: WorldData | null = null;
  private view: ViewMode = "auto";
  private phase: Phase | null = null;
  private speed = 1;
  private simT = 0;
  private agents = new Map<string, AgentSprite>();
  private brains = new Map<string, Brain>();
  private reserved = new Map<string, string>();
  private convos = new Map<string, Convo>();
  private pairQueue: string[] = [];
  private messages = new Map<string, ChatLine[]>();
  private random = rng(7);
  private statusAt = 0;

  private selected: string | null = null;
  private following = false;
  private camY = 0;
  private camTarget = 0;
  private snapAt = 0;
  private currentFloor: FloorId | null = null;
  private drag: { y: number; target: number; moved: boolean } | null = null;
  private suppressTap = false;
  private cleanup: (() => void)[] = [];

  constructor(private app: Application, private events: EngineEvents) {
    app.stage.addChild(this.camera);
    for (const { id, name } of FLOORS) {
      const scene = buildFloor(id);
      const root = new Container();
      const label = new Text({
        text: name.toUpperCase(),
        style: { fontFamily: "monospace", fontSize: 9, fill: 0xf3f1ed, letterSpacing: 2, fontWeight: "700" },
        resolution: 4,
      });
      label.position.set(10, floorTop(id) - FLOOR_GAP + 12);
      label.alpha = 0.75;
      root.addChild(label, scene.ground, scene.entities);
      this.camera.addChild(root);
      this.floors[id] = { root, scene };
      this.grids[id] = new PF.Grid(walkMatrix(id));
    }
    app.stage.eventMode = "static";
    app.stage.hitArea = app.screen;
    app.stage.on("pointertap", (e: FederatedPointerEvent) => {
      if (e.target === app.stage && !this.suppressTap) this.select(null);
    });
    this.bindInput(app.canvas);
    this.camY = this.camTarget = this.floorFocus("L1");
  }

  // ---------- public API ----------

  setData(data: WorldData) {
    this.data = data;
    const ids = new Set(data.agents.map((a) => a.id));
    for (const [id, sprite] of this.agents)
      if (!ids.has(id)) {
        for (const convo of this.convos.values()) if (convo.a === sprite || convo.b === sprite) this.endConvo(convo);
        this.release(id);
        sprite.destroy();
        this.agents.delete(id);
        this.brains.delete(id);
        if (this.selected === id) this.select(null);
      }
    for (const agent of data.agents) {
      const existing = this.agents.get(agent.id);
      if (existing) {
        existing.name = agent.name;
        continue;
      }
      this.spawn(agent.id, agent.name);
    }
    // New pairs (live during matching) jump the queue; known ones keep their rotation order.
    const known = new Set(this.pairQueue);
    const fresh = data.pairs.filter((p) => !known.has(p.id)).map((p) => p.id);
    const live = new Set(data.pairs.map((p) => p.id));
    this.pairQueue = [...fresh, ...this.pairQueue.filter((id) => live.has(id))];
    for (const convo of this.convos.values()) if (!live.has(convo.pair.id)) this.endConvo(convo);
    this.replan();
  }

  setView(view: ViewMode) {
    this.view = view;
    this.replan();
  }

  setSpeed(speed: number) {
    this.speed = speed;
  }

  setMessages(pairId: string, lines: ChatLine[]) {
    this.messages.set(pairId, lines);
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

  goToFloor(floor: FloorId) {
    this.setFollow(false);
    this.camTarget = this.floorFocus(floor);
  }

  info(id: string): AgentInfo | null {
    const sprite = this.agents.get(id);
    if (!sprite) return null;
    const convo = [...this.convos.values()].find((c) => c.startedAt !== null && (c.a === sprite || c.b === sprite));
    return {
      state: sprite.state,
      room: roomAt(sprite.floor, Math.round(sprite.gx)).name,
      floor: sprite.floor,
      talkingPairId: convo?.pair.id ?? null,
    };
  }

  update(dt: number) {
    const simDt = Math.min(dt, 0.1) * this.speed;
    this.simT += simDt;
    if (this.data) this.direct();
    for (const sprite of this.agents.values()) sprite.update(simDt, this.simT);
    for (const { scene } of Object.values(this.floors)) for (const animate of scene.animators) animate(this.simT);
    this.updateCamera(dt);
    if (this.simT >= this.statusAt && this.phase) {
      this.statusAt = this.simT + 0.5;
      const talking = [...this.convos.values()].filter((c) => c.startedAt !== null).map((c) => c.pair.id);
      this.events.onStatus({ phase: this.phase, talking });
    }
  }

  destroy() {
    for (const fn of this.cleanup) fn();
    for (const sprite of this.agents.values()) sprite.destroy();
    this.agents.clear();
    this.camera.destroy({ children: true });
  }

  // ---------- director ----------

  /** Recompute homes and seats after new data, a view change or a phase change. */
  private replan() {
    if (!this.data) return;
    const phase = resolvePhase(this.data, this.view);
    const phaseChanged = phase !== this.phase;
    this.phase = phase;
    if (phaseChanged || phase !== "chats") for (const convo of [...this.convos.values()]) this.endConvo(convo);
    const seats = phase === "groups" ? assignGroupSeats(this.data) : new Map<string, Seat>();
    for (const agent of this.data.agents) {
      const brain = this.brains.get(agent.id);
      if (!brain) continue;
      const seat = seats.get(agent.id) ?? null;
      const home = phase === "groups" ? (seat ? seat.room.id : "bench") : homeRoom(agent, phase);
      const mode = seat ? "group" : brain.mode === "chat" ? "chat" : "free";
      const seatChanged = (seat?.spot.x ?? -1) !== (brain.seat?.spot.x ?? -1) || (seat?.spot.y ?? -1) !== (brain.seat?.spot.y ?? -1);
      if (home !== brain.home || mode !== brain.mode || seatChanged || phaseChanged) {
        brain.home = home;
        brain.mode = mode;
        brain.seat = seat;
        brain.nextAt = REPLAN_NOW;
        brain.dwell = null;
      }
    }
  }

  private direct() {
    const data = this.data!;
    const thinkingAllowed = data.universe.status === "matching" || this.view !== "auto";
    if (this.phase === "chats") this.scheduleConvos();
    this.updateConvos();

    for (const [id, sprite] of this.agents) {
      const brain = this.brains.get(id)!;
      if (sprite.arrived && brain.dwell !== null) {
        brain.nextAt = this.simT + brain.dwell;
        brain.dwell = null;
      }
      if (brain.mode === "chat") continue;
      if (brain.mode === "group" && brain.seat) {
        const { room, spot, groupId } = brain.seat;
        this.give(sprite, brain, {
          key: `group:${groupId}:${spot.x},${spot.y}`,
          floor: room.floor, x: spot.x, y: spot.y, dir: spot.dir,
          arrive: arrivalFor(spot), activity: spot.activity, seated: spot.pose === "sit",
        }, [tileKey(room.floor, spot.x, spot.y)], null);
        continue;
      }
      // Mid-walk agents keep going unless their home just changed.
      if ((!sprite.arrived && brain.nextAt !== REPLAN_NOW) || this.simT < brain.nextAt) continue;
      this.wander(sprite, brain, thinkingAllowed);
    }
  }

  /** Free time in the home room: an activity spot, a stroll, or (while matching) a think. */
  private wander(sprite: AgentSprite, brain: Brain, thinkingAllowed: boolean) {
    const room = ROOM_BY_ID[brain.home];
    const inRoom = sprite.floor === room.floor && sprite.gx >= room.x0 && sprite.gx <= room.x1;
    const roll = this.random();
    const unscored = !this.data!.agents.find((a) => a.id === sprite.id)?.scored;
    const thinkChance = unscored && this.data!.universe.status === "matching" ? 0.45 : 0.2;
    if (inRoom && sprite.arrived && thinkingAllowed && roll < thinkChance) {
      sprite.setState("THINKING");
      brain.nextAt = this.simT + 2.5 + this.random() * 2.5;
      return;
    }
    if (inRoom && roll < 0.62) {
      const spot = this.freeSpot(room);
      if (spot) {
        this.give(sprite, brain, {
          key: `spot:${room.id}:${spot.x},${spot.y}:${this.simT.toFixed(1)}`,
          floor: room.floor, x: spot.x, y: spot.y, dir: spot.dir,
          arrive: arrivalFor(spot), activity: spot.activity, seated: spot.pose === "sit",
        }, [tileKey(room.floor, spot.x, spot.y)], 9 + this.random() * 10);
        return;
      }
    }
    const tile = this.freeTile(room);
    if (!tile) {
      brain.nextAt = this.simT + 2;
      return;
    }
    this.give(sprite, brain, {
      key: `walk:${room.id}:${tile.x},${tile.y}:${this.simT.toFixed(1)}`,
      floor: room.floor, x: tile.x, y: tile.y, arrive: "IDLE",
    }, [tileKey(room.floor, tile.x, tile.y)], 3 + this.random() * 5);
  }

  private scheduleConvos() {
    const max = Math.max(1, Math.min(6, Math.round(this.agents.size / 5)));
    let attempts = this.pairQueue.length;
    while (this.convos.size < max && attempts-- > 0) {
      const pairId = this.pairQueue.shift()!;
      this.pairQueue.push(pairId);
      const pair = this.data!.pairs.find((p) => p.id === pairId);
      if (!pair || this.convos.has(pairId)) continue;
      const a = this.agents.get(pair.a);
      const b = this.agents.get(pair.b);
      if (!a || !b || this.brains.get(a.id)!.mode !== "free" || this.brains.get(b.id)!.mode !== "free") continue;
      if (a.isRiding || b.isRiding) continue;
      const spots = this.freeChatSpots([this.brains.get(a.id)!.home, this.brains.get(b.id)!.home]);
      if (!spots) continue;
      const [sa, sb, room] = spots;
      for (const [sprite, spot, side] of [[a, sa, "a"], [b, sb, "b"]] as const) {
        const brain = this.brains.get(sprite.id)!;
        brain.mode = "chat";
        this.give(sprite, brain, {
          key: `chat:${pair.id}:${side}`, floor: room.floor, x: spot.x, y: spot.y, dir: spot.dir, arrive: "IDLE",
        }, [tileKey(room.floor, spot.x, spot.y)], null);
      }
      this.convos.set(pair.id, { pair, a, b, createdAt: this.simT, startedAt: null, until: 0, line: 0, nextLineAt: 0 });
      if (!this.messages.has(pair.id)) this.events.onNeedMessages(pair.id);
    }
  }

  private updateConvos() {
    for (const convo of [...this.convos.values()]) {
      const { a, b } = convo;
      if (convo.startedAt === null) {
        const close = a.floor === b.floor && Math.hypot(a.gx - b.gx, a.gy - b.gy) <= 1.01;
        if (a.arrived && b.arrived && close) {
          convo.startedAt = this.simT;
          const lines = this.messages.get(convo.pair.id);
          convo.until = this.simT + (lines?.length ? Math.min(20, Math.max(8, lines.length * 2.2)) : 10);
          convo.nextLineAt = this.simT;
          a.setState("TALKING");
          b.setState("TALKING");
        } else if (this.simT - convo.createdAt > 30) this.endConvo(convo);
        continue;
      }
      if (this.simT >= convo.nextLineAt) {
        const lines = this.messages.get(convo.pair.id);
        const aSpeaks = lines?.length ? lines[convo.line % lines.length].speakerId === a.id : convo.line % 2 === 0;
        a.speaking = aSpeaks;
        b.speaking = !aSpeaks;
        convo.line++;
        convo.nextLineAt = this.simT + 2.2;
      }
      if (this.simT >= convo.until) this.endConvo(convo);
    }
  }

  private endConvo(convo: Convo) {
    this.convos.delete(convo.pair.id);
    for (const sprite of [convo.a, convo.b]) {
      sprite.speaking = false;
      sprite.setState("IDLE");
      const brain = this.brains.get(sprite.id);
      if (brain && brain.mode === "chat") {
        brain.mode = "free";
        brain.nextAt = this.simT + 0.5;
        this.release(sprite.id);
      }
    }
  }

  /** Hand an agent a task (if it's new), routing it there and reserving its destination tiles. */
  private give(sprite: AgentSprite, brain: Brain, task: Task, reserve: string[], dwell: number | null) {
    if (sprite.task?.key === task.key || sprite.isRiding) return;
    this.release(sprite.id);
    for (const k of reserve) this.reserved.set(k, sprite.id);
    brain.reserved = reserve;
    brain.dwell = dwell;
    brain.nextAt = Infinity;
    sprite.assign(task, this.route(sprite, task));
  }

  private release(id: string) {
    const brain = this.brains.get(id);
    if (!brain) return;
    for (const k of brain.reserved) if (this.reserved.get(k) === id) this.reserved.delete(k);
    brain.reserved = [];
  }

  private spawn(id: string, name: string) {
    const lounge = ROOM_BY_ID.lounge;
    const tile = this.freeTile(lounge) ?? { x: lounge.x0 + 4, y: 9 };
    const sprite = new AgentSprite(
      id, name, lounge.floor, tile.x, tile.y,
      (agent, floor) => this.floors[floor].scene.entities.addChild(agent.root),
      (agent) => {
        if (!this.suppressTap) this.select(agent.id);
      },
    );
    this.floors[lounge.floor].scene.entities.addChild(sprite.root);
    this.agents.set(id, sprite);
    const brain: Brain = { home: "lounge", mode: "free", nextAt: this.simT + this.random() * 2, dwell: null, reserved: [], seat: null };
    this.brains.set(id, brain);
    this.reserved.set(tileKey(lounge.floor, tile.x, tile.y), id);
    brain.reserved = [tileKey(lounge.floor, tile.x, tile.y)];
  }

  // ---------- spots and routing ----------

  private freeSpot(room: Room): Spot | null {
    const free = room.spots.filter((s) => !this.reserved.has(tileKey(room.floor, s.x, s.y)));
    return free.length ? free[Math.floor(this.random() * free.length)] : null;
  }

  private freeTile(room: Room): { x: number; y: number } | null {
    const matrix = walkMatrix(room.floor);
    const blocked = new Set(room.spots.map((s) => `${s.x},${s.y}`));
    for (const [a, b] of room.chatSpots) blocked.add(`${a.x},${a.y}`).add(`${b.x},${b.y}`);
    for (let i = 0; i < 40; i++) {
      const x = room.x0 + Math.floor(this.random() * (room.x1 - room.x0 + 1));
      const y = 1 + Math.floor(this.random() * (matrix.length - 1));
      if (matrix[y][x] || blocked.has(`${x},${y}`) || this.reserved.has(tileKey(room.floor, x, y))) continue;
      return { x, y };
    }
    return null;
  }

  private freeChatSpots(prefer: RoomId[]): [Spot, Spot, Room] | null {
    const rooms = [...new Set([...prefer.map((id) => ROOM_BY_ID[id]), ...ROOMS])].filter((r) => r.id !== "bench" || prefer.includes("bench"));
    for (const room of rooms)
      for (const [a, b] of room.chatSpots)
        if (!this.reserved.has(tileKey(room.floor, a.x, a.y)) && !this.reserved.has(tileKey(room.floor, b.x, b.y)))
          return [a, b, room];
    return null;
  }

  /** Tile steps to the task, riding the elevator when it's on another floor. */
  private route(sprite: AgentSprite, task: Task): RouteStep[] {
    const sx = Math.round(sprite.gx);
    const sy = Math.round(sprite.gy);
    const steps: RouteStep[] = [];
    if (sx !== sprite.gx || sy !== sprite.gy) steps.push({ kind: "tile", x: sx, y: sy });
    if (sprite.floor === task.floor) return steps.concat(this.path(task.floor, sx, sy, task.x, task.y));
    return steps.concat(
      this.path(sprite.floor, sx, sy, ELEVATOR.x, ELEVATOR.y),
      [{ kind: "ride", to: task.floor }],
      this.path(task.floor, ELEVATOR.x, ELEVATOR.y, task.x, task.y),
    );
  }

  private path(floor: FloorId, sx: number, sy: number, tx: number, ty: number): RouteStep[] {
    if (sx === tx && sy === ty) return [];
    const found = this.finder.findPath(sx, sy, tx, ty, this.grids[floor].clone());
    // No path (e.g. standing on a blocked tile after a layout change): walk straight there.
    if (found.length < 2) return [{ kind: "tile", x: tx, y: ty }];
    return found.slice(1).map(([x, y]) => ({ kind: "tile" as const, x, y }));
  }

  // ---------- camera and input ----------

  private get scale() {
    return this.app.screen.width / FLOOR_W;
  }

  private get viewH() {
    return this.app.screen.height / this.scale;
  }

  private floorFocus(floor: FloorId): number {
    return floorTop(floor) + FLOOR_H / 2 - this.viewH / 2 - 4;
  }

  private updateCamera(dt: number) {
    const k = this.scale;
    if (!Number.isFinite(k) || k <= 0) return;
    this.camera.scale.set(k);
    const viewH = this.viewH;
    if (this.following && this.selected) {
      const sprite = this.agents.get(this.selected);
      if (sprite) this.camTarget = tileToWorld(sprite.floor, sprite.gx, sprite.gy).y - 16 - viewH / 2;
    }
    if (this.snapAt && performance.now() >= this.snapAt) {
      this.snapAt = 0;
      this.camTarget = this.floorFocus(this.nearestFloor(this.camTarget + viewH / 2));
    }
    const max = Math.max(0, WORLD_H - viewH);
    this.camTarget = Math.min(max, Math.max(0, this.camTarget));
    this.camY += (this.camTarget - this.camY) * Math.min(1, dt * 6);
    this.camera.position.set(0, -this.camY * k);

    for (const { id } of FLOORS) {
      const top = floorTop(id) - FLOOR_GAP;
      this.floors[id].root.visible = top + FLOOR_H + FLOOR_GAP * 2 > this.camY && top < this.camY + viewH;
    }
    const floor = this.nearestFloor(this.camY + viewH / 2);
    if (floor !== this.currentFloor) {
      this.currentFloor = floor;
      this.events.onFloor(floor);
    }
  }

  private nearestFloor(y: number): FloorId {
    let best = FLOORS[0].id;
    let dist = Infinity;
    for (const { id } of FLOORS) {
      const d = Math.abs(floorTop(id) + FLOOR_H / 2 - y);
      if (d < dist) [best, dist] = [id, d];
    }
    return best;
  }

  private bindInput(canvas: HTMLCanvasElement) {
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.setFollow(false);
      this.camTarget += e.deltaY / this.scale;
      this.snapAt = performance.now() + 450;
    };
    const onDown = (e: PointerEvent) => {
      this.drag = { y: e.clientY, target: this.camTarget, moved: false };
      this.suppressTap = false;
    };
    const onMove = (e: PointerEvent) => {
      if (!this.drag) return;
      const dy = e.clientY - this.drag.y;
      if (Math.abs(dy) > 6) {
        this.drag.moved = true;
        this.setFollow(false);
      }
      if (this.drag.moved) this.camTarget = this.drag.target - dy / this.scale;
    };
    const onUp = () => {
      if (this.drag?.moved) {
        this.suppressTap = true;
        this.snapAt = performance.now() + 150;
      }
      this.drag = null;
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    canvas.style.touchAction = "none";
    this.cleanup.push(() => {
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    });
  }
}
