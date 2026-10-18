// One agent on screen: sprite, shadow, activity prop, speech/thought bubble and name tag, plus the state
// machine (IDLE, WALKING, SITTING, THINKING, TALKING, ACTIVITY) that follows a route the engine plans.

import { Container, Graphics, Rectangle, Sprite, Text, type Filter } from "pixi.js";
import { depthOf, dirFor, tileToScreen, type Activity, type Dir, type Spot } from "./world/geometry";
import type { Look } from "./character";
import { buildSheet, type AgentSheet, type Pose } from "./sprites";
import type { AgentState } from "./types";

/** Where the engine wants an agent to be and what to do on arrival. `key` identifies the task. */
export type Task = {
  key: string;
  x: number;
  y: number;
  dir?: Dir;
  arrive: Exclude<AgentState, "WALKING">;
  activity?: Activity;
  /** Do the activity sitting down (a seat at a desk, bar or group table). */
  seated?: boolean;
};

const SEATED_POSE: Partial<Record<Pose, Pose>> = {
  idle0: "sit", idle1: "sit", fwd0: "sitFwd0", fwd1: "sitFwd1", up0: "sitFwd1", up1: "sitFwd0",
};

/** A route is a list of tile steps. */
export type RouteStep = { x: number; y: number };

const WALK_SPEED = 2.6; // tiles per second

/** Which sprite frames and props each activity uses. */
const ACTIVITY_ANIM: Record<Activity, { frames: Pose[]; fps: number; prop?: "guitar" | "dumbbell" | "book" | "mug" }> = {
  chill: { frames: ["sit"], fps: 1 },
  drink: { frames: ["sit", "sit", "sitFwd1", "sit"], fps: 1.2, prop: "mug" },
  cook: { frames: ["fwd0", "fwd1"], fps: 3 },
  dance: { frames: ["up0", "idle0", "up1", "idle1"], fps: 4 },
  type: { frames: ["sitFwd0", "sitFwd1"], fps: 6 },
  read: { frames: ["sitFwd0"], fps: 1, prop: "book" },
  guitar: { frames: ["fwd0", "fwd1"], fps: 5, prop: "guitar" },
  keys: { frames: ["sitFwd0", "sitFwd1"], fps: 5 },
  drums: { frames: ["up1", "fwd0"], fps: 6 },
  game: { frames: ["fwd0", "fwd1"], fps: 6 },
  run: { frames: ["walk0", "walk1", "walk2", "walk3"], fps: 10 },
  lift: { frames: ["up1", "up0"], fps: 1.4, prop: "dumbbell" },
  climb: { frames: ["up0", "up1"], fps: 1.8 },
};

export function arrivalFor(spot: Spot): Task["arrive"] {
  if (spot.pose === "act") return "ACTIVITY";
  if (spot.pose === "sit") return spot.activity === "chill" || spot.activity === "drink" ? "SITTING" : "ACTIVITY";
  return spot.activity === "read" ? "ACTIVITY" : "IDLE";
}

export class AgentSprite {
  readonly root = new Container();
  readonly id: string;
  name: string;
  gx: number;
  gy: number;
  dir: Dir = "S";
  state: AgentState = "IDLE";
  task: Task | null = null;
  /** True once the current task's destination is reached. */
  arrived = true;
  /** In a conversation, whether this agent holds the speech bubble right now. */
  speaking = false;
  /** Latest public line, shown only while this agent is the one speaking. */
  quote: string | null = null;

  private sheet: AgentSheet;
  private lookKey: string;
  private body: Sprite;
  private prop = new Graphics();
  private shadow = new Graphics();
  private bubble = new Bubble();
  private label: Text;
  private route: RouteStep[] = [];
  private animT = Math.random() * 10;
  private spawnT = 0;
  private hovered = false;
  private selected = false;
  private activity: Activity | null = null;

  constructor(
    id: string,
    name: string,
    x: number,
    y: number,
    onTap: (agent: AgentSprite) => void,
    look?: Look | null,
  ) {
    this.id = id;
    this.name = name;
    this.gx = x;
    this.gy = y;
    this.lookKey = JSON.stringify(look ?? null);
    this.sheet = buildSheet(id, look);
    this.body = new Sprite(this.sheet.frames.S.idle0);
    this.body.anchor.set(0.5, 1);
    this.body.roundPixels = true;
    this.shadow.ellipse(0, 0, 6, 2.5).fill({ color: 0x000000, alpha: 0.25 });
    this.label = new Text({
      text: name,
      style: { fontFamily: "monospace", fontSize: 7, fill: 0xffffff, fontWeight: "700", stroke: { color: 0x1d1b1a, width: 2.5 } },
      resolution: 4,
    });
    this.label.anchor.set(0.5, 1);
    this.label.position.set(0, -26);
    this.label.visible = false;
    this.root.addChild(this.shadow, this.body, this.prop, this.label, this.bubble.root);
    this.root.eventMode = "static";
    this.root.cursor = "pointer";
    this.root.hitArea = new Rectangle(-8, -26, 16, 28);
    this.root.on("pointertap", () => onTap(this));
    this.root.on("pointerover", () => {
      this.hovered = true;
      this.refreshLabel();
    });
    this.root.on("pointerout", () => {
      this.hovered = false;
      this.refreshLabel();
    });
    this.root.scale.set(0);
    this.place();
  }

  /** Repaint the sheet when the person (or their agent) changed the look; a no-op for the same look. */
  setLook(look?: Look | null) {
    const key = JSON.stringify(look ?? null);
    if (key === this.lookKey) return;
    this.lookKey = key;
    this.sheet = buildSheet(this.id, look);
    this.body.texture = this.sheet.frames[this.dir].idle0;
    this.refreshLabel();
  }

  get accent(): number {
    return this.sheet.palette.accent;
  }

  /** The generated 13x4 sheet canvas (poses x directions S, N, E, W), for exporting the art. */
  get sheetCanvas(): HTMLCanvasElement {
    return this.sheet.frames.S.idle0.source.resource as HTMLCanvasElement;
  }

  setSelected(on: boolean, filters: Filter[]) {
    this.selected = on;
    this.body.filters = on ? filters : null;
    this.refreshLabel();
  }

  /** Follow a new task along a precomputed route (empty route = already there). */
  assign(task: Task, route: RouteStep[]) {
    this.task = task;
    this.route = route;
    this.arrived = route.length === 0;
    this.speaking = false;
    if (this.arrived) this.settle();
    else this.state = "WALKING";
  }

  /** Change what the agent is doing in place, without moving. */
  setState(state: Exclude<AgentState, "WALKING">, dir?: Dir) {
    if (this.state === "WALKING") return;
    this.state = state;
    if (dir) this.dir = dir;
    if (state !== "ACTIVITY" && state !== "SITTING") this.activity = null;
  }

  update(dt: number, simT: number) {
    this.animT += dt;
    if (this.spawnT < 1) {
      this.spawnT = Math.min(1, this.spawnT + dt * 2.5);
      const s = easeOutBack(this.spawnT);
      this.root.scale.set(s);
    }
    if (this.state === "WALKING") this.walk(dt);
    this.animate(simT);
    this.place();
  }

  private walk(dt: number) {
    let budget = WALK_SPEED * dt;
    while (budget > 0 && this.route.length) {
      const step = this.route[0];
      const dx = step.x - this.gx;
      const dy = step.y - this.gy;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.001) this.dir = dirFor(dx, dy, this.dir);
      if (dist <= budget) {
        this.gx = step.x;
        this.gy = step.y;
        budget -= dist;
        this.route.shift();
      } else {
        this.gx += (dx / dist) * budget;
        this.gy += (dy / dist) * budget;
        budget = 0;
      }
    }
    if (!this.route.length) {
      this.arrived = true;
      this.settle();
    }
  }

  private settle() {
    const task = this.task;
    if (!task) {
      this.state = "IDLE";
      return;
    }
    this.state = task.arrive;
    if (task.dir) this.dir = task.dir;
    this.activity = task.arrive === "ACTIVITY" || task.arrive === "SITTING" ? (task.activity ?? null) : null;
    if (task.arrive === "SITTING" && !this.activity) this.activity = "chill";
  }

  private animate(simT: number) {
    const frames = this.sheet.frames[this.dir];
    let pose: Pose = "idle0";
    let lift = 0;
    let propKind: (typeof ACTIVITY_ANIM)[Activity]["prop"];
    switch (this.state) {
      case "WALKING":
        pose = (["walk0", "walk1", "walk2", "walk3"] as const)[Math.floor(this.animT * 8) % 4];
        break;
      case "SITTING":
      case "ACTIVITY": {
        const anim = ACTIVITY_ANIM[this.activity ?? "chill"];
        pose = anim.frames[Math.floor(this.animT * anim.fps) % anim.frames.length];
        if (this.task?.seated) pose = SEATED_POSE[pose] ?? pose;
        propKind = anim.prop;
        if (this.activity === "climb") lift = 7 + 4 * Math.sin(this.animT * 0.9);
        if (this.activity === "dance") lift = Math.abs(Math.sin(this.animT * 5)) * 2;
        break;
      }
      default:
        pose = Math.floor(this.animT * 1.6) % 2 ? "idle1" : "idle0";
    }
    this.body.texture = frames[pose];
    this.body.y = -lift;
    this.drawProp(propKind, pose);
    this.prop.y = -lift;
    this.shadow.scale.set(1 - Math.min(lift, 10) / 25);

    if (this.state === "THINKING") this.bubble.show("think", simT);
    else if (this.state === "TALKING" && this.speaking && this.quote) this.bubble.showText(this.quote);
    else if (this.state === "TALKING" && this.speaking) this.bubble.show("talk", simT);
    else this.bubble.hide();
    this.bubble.root.y = -lift;
  }

  private lastProp = "";
  private drawProp(kind: (typeof ACTIVITY_ANIM)[Activity]["prop"], pose: Pose) {
    const key = `${kind}:${this.dir}:${pose}`;
    if (key === this.lastProp) return;
    this.lastProp = key;
    const g = this.prop;
    g.clear();
    if (!kind || this.dir === "N") return;
    const side = this.dir === "E" || this.dir === "W";
    g.scale.x = this.dir === "W" ? -1 : 1;
    if (kind === "guitar") {
      const strum = pose === "fwd1" ? 1 : 0;
      g.ellipse(side ? 2 : -1, -8, 3.5, 2.8).fill(0x9a5b2e);
      g.circle(side ? 2 : -1, -8, 1).fill(0x3b2414);
      g.poly([side ? 4 : 1, -10, side ? 9 : 6, -14 - strum, side ? 10 : 7, -13 - strum, side ? 5 : 2, -9]).fill(0x5a3c22);
    } else if (kind === "dumbbell") {
      const hy = pose === "up0" ? -19 : -16;
      for (const hx of side ? [1] : [-5, 4]) {
        g.rect(hx - 2, hy, 5, 1).fill(0x9a958b);
        g.rect(hx - 3, hy - 1, 1.5, 3).fill(0x24272c);
        g.rect(hx + 2.5, hy - 1, 1.5, 3).fill(0x24272c);
      }
    } else if (kind === "book") {
      g.rect(side ? 1 : -3, -12, 5, 4).fill(0x8197cf);
      g.rect(side ? 1 : -3, -12, 5, 1).fill(0xf3f1ed);
    } else if (kind === "mug") {
      const up = pose === "sitFwd1" ? -3 : 0;
      g.rect(side ? 3 : 3, -8 + up, 3, 3).fill(0xf3f1ed);
      g.rect(side ? 3 : 3, -8 + up, 3, 1).fill(0x6e4b2a);
    }
  }

  private place() {
    const p = tileToScreen(this.gx, this.gy);
    this.root.position.set(p.x, p.y);
    this.root.zIndex = depthOf(this.gx, this.gy) + 6;
  }

  private refreshLabel() {
    this.label.visible = this.hovered || this.selected;
    this.label.style.fill = this.selected ? this.sheet.palette.accent : 0xffffff;
  }

  destroy() {
    const source = this.body.texture.source;
    this.root.destroy({ children: true });
    // The sheet's textures share one source; destroying the sprite can already release it.
    if (!source.destroyed) source.destroy();
  }
}

/** "..." bubble: cycling dots when thinking, jumping dots when talking. */
class Bubble {
  readonly root = new Container();
  private bg = new Graphics();
  private dots = new Graphics();
  private caption: Text;
  private kind: string | null = null;

  constructor() {
    this.caption = new Text({
      text: "",
      style: { fontFamily: "monospace", fontSize: 8, fill: 0x1d1b1a, wordWrap: true, wordWrapWidth: 96, align: "center" },
      resolution: 2,
    });
    this.caption.anchor.set(0.5, 0);
    this.caption.visible = false;
    this.root.addChild(this.bg, this.dots, this.caption);
    this.root.visible = false;
  }

  showText(text: string) {
    const shown = text.length > 72 ? `${text.slice(0, 71).trimEnd()}…` : text;
    this.root.visible = true;
    this.dots.clear();
    this.caption.visible = true;
    if (this.kind === `quote:${shown}`) return;
    this.kind = `quote:${shown}`;
    this.caption.text = shown;
    const w = Math.ceil(Math.min(108, this.caption.width + 10));
    const h = Math.ceil(this.caption.height + 6);
    this.bg.clear();
    this.bg.roundRect(-w / 2, -42 - h, w, h, 4).fill(0xffffff).stroke({ color: 0x1d1b1a, width: 1 });
    this.bg.poly([-2, -42.5, 3, -42.5, -3, -38.5]).fill(0xffffff).stroke({ color: 0x1d1b1a, width: 0.8 });
    this.caption.position.set(0, -39 - h);
  }

  show(kind: "think" | "talk", t: number) {
    this.caption.visible = false;
    if (kind !== this.kind) {
      this.kind = kind;
      this.bg.clear();
      if (kind === "think") {
        this.bg.roundRect(-9, -43, 18, 10, 5).fill(0xffffff).stroke({ color: 0x1d1b1a, width: 1 });
        this.bg.circle(-3, -31, 1.8).fill(0xffffff).stroke({ color: 0x1d1b1a, width: 0.8 });
        this.bg.circle(-5, -28, 1.1).fill(0xffffff).stroke({ color: 0x1d1b1a, width: 0.6 });
      } else {
        this.bg.roundRect(-10, -43, 20, 11, 3).fill(0xffffff).stroke({ color: 0x1d1b1a, width: 1 });
        this.bg.poly([-2, -32.5, 3, -32.5, -3, -28.5]).fill(0xffffff).stroke({ color: 0x1d1b1a, width: 0.8 });
        this.bg.rect(-1.6, -33.4, 4.2, 1.4).fill(0xffffff);
      }
    }
    this.root.visible = true;
    this.dots.clear();
    if (kind === "think") {
      const n = Math.floor(t * 2.5) % 4;
      for (let i = 0; i < n; i++) this.dots.circle(-4 + i * 4, -38, 1.1).fill(0x6e6a61);
    } else {
      for (let i = 0; i < 3; i++) {
        const hop = Math.max(0, Math.sin(t * 9 - i * 0.9)) * 2.2;
        this.dots.circle(-4.5 + i * 4.5, -37.5 - hop, 1.2).fill(0x1d1b1a);
      }
    }
  }

  hide() {
    this.root.visible = false;
    this.caption.visible = false;
  }
}

function easeOutBack(t: number): number {
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}
