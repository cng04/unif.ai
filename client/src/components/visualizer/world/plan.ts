// Layout: turns a structure selection into a single-floor campus. Pure and deterministic for a seed.
//
// - The Meeting Square sits in the middle (fountain, benches); the Spawn Plaza just south of it.
// - Each structure reserves the large-tier footprint at a seeded angle around the square (nudged toward its
//   preferred neighbours), so a tier change never moves anything, and a new member never changes the layout.
// - Each structure gets an entrance on the side facing the square; winding paths (weighted search over seeded
//   noise, reusing paths already laid) join every entrance to the square, plus four trails to the map's edges.
// - Inside, the chosen variant's furniture lines the back row and fills the centre; activity spots, one group
//   table and chat spots come out of that. Open plan: no walls, a merged structure shares one zone.
// - Trees, bushes, flowers and lamps dress the open land, spaced so they can never wall anything off.

import {
  hash, rng, type Activity, type Dir, type Furniture, type FurnitureKind, type Spot,
} from "./geometry";
import { MATCH_MIN, termScore } from "./match";
import { SHARED, SIZES, type Preset, type Tier, type Variant } from "./presets";
import type { Selection, Structure } from "./select";

// Fixed size, big enough for every preset in the library at its largest tier; unused land is landscape.
export const MAP_W = 72;
export const MAP_H = 60;
const GAP = 2; // tiles of open land kept between zones

export type ZoneKind = "structure" | "square" | "spawn";

export type Zone = {
  id: string;
  kind: ZoneKind;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  floor: [number, number];
  /** The tile just inside the zone that its path arrives at. */
  entrance: { x: number; y: number };
  structure?: Structure;
  /** Variant names, one per preset (structures only). */
  variants?: string[];
};

export type WorldPlan = {
  seed: number;
  width: number;
  height: number;
  zones: Zone[];
  /** Zone furniture and landscape decor, absolute tile coordinates. */
  furniture: (Furniture & { zone: string | null })[];
  paths: string[];
  spots: Record<string, Spot[]>;
  /** Top-left tile of each zone's 2x2 group centrepiece. */
  circles: Record<string, { x: number; y: number; pose: "sit" | "act"; activity: Activity }[]>;
  chatSpots: Record<string, [Spot, Spot][]>;
  spawnTiles: { x: number; y: number }[];
  /** Bench seats in the square, where unplaced people sit. */
  benches: Spot[];
  /** 0 walkable, 1 blocked; indexed [y][x]. */
  walk: number[][];
};

/** Seed from the universe and its keyword set only: a re-run with the same keywords keeps the same world. */
export function worldSeed(universeId: string, keywords: string[]): number {
  return hash(`${universeId}|${[...keywords].sort().join("|")}`);
}

export const tileKey = (x: number, y: number) => `${x},${y}`;

// Activities done standing at their spot; the rest sit.
const STANDING = new Set<Activity>(["cook", "dance", "guitar", "drums", "game", "run", "lift", "climb"]);
// Centre pieces a group can sit or stand around.
const CIRCLE_KINDS = new Set<FurnitureKind>(["table", "bigtable", "rug", "mat", "discofloor", "boulder", "tent", "pen"]);
const FLAT = new Set<FurnitureKind>(["rug", "mat", "discofloor", "flowers"]);
const TIER_RANK: Record<Tier, number> = { S: 0, M: 1, L: 2 };

export function planWorld(selection: Selection, seed: number): WorldPlan {
  const W = MAP_W;
  const H = MAP_H;
  const occupied: Rect[] = [];
  const zones: Zone[] = [];
  const furniture: WorldPlan["furniture"] = [];
  const spots: WorldPlan["spots"] = {};
  const circles: WorldPlan["circles"] = {};
  const chatSpots: WorldPlan["chatSpots"] = {};

  // Shared spaces.
  const cx = Math.floor(W / 2);
  const cy = Math.floor(H / 2);
  const [sw, sh] = SHARED.square.size;
  const square: Zone = {
    id: "square", kind: "square", name: SHARED.square.name, x: cx - sw / 2, y: cy - sh / 2, w: sw, h: sh,
    floor: SHARED.square.floor, entrance: { x: cx, y: cy - sh / 2 + sh - 1 },
  };
  const [pw, ph] = SHARED.spawn.size;
  const spawn: Zone = {
    id: "spawn", kind: "spawn", name: SHARED.spawn.name, x: cx - Math.floor(pw / 2), y: square.y + sh + GAP + 1, w: pw, h: ph,
    floor: SHARED.spawn.floor, entrance: { x: cx, y: square.y + sh + GAP + 1 },
  };
  zones.push(square, spawn);
  occupied.push(withGap(square), withGap(spawn));

  // Structures: seeded angle, nudged toward placed neighbours; the reserved rect is always the L footprint.
  const [lw, lh] = SIZES.L;
  const order = [...selection.structures].sort((a, b) => hash(`${seed}|${a.id}`) - hash(`${seed}|${b.id}`) || a.id.localeCompare(b.id));
  const angles = new Map<string, number>();
  for (const s of order) {
    let angle = (hash(`${seed}|angle|${s.id}`) % 360) * (Math.PI / 180);
    const neighbours = s.presets.flatMap((p) => p.near ?? []).map((id) => [...angles].find(([sid]) => sid.split("+").includes(id))?.[1]);
    const placedNear = neighbours.filter((a): a is number => a !== undefined);
    if (placedNear.length) angle = meanAngle(placedNear) + ((hash(`${seed}|side|${s.id}`) % 2) * 2 - 1) * 0.5;
    const reserved = placeAround(cx, cy, lw, lh, angle, occupied, W, H);
    if (!reserved) continue; // the map is full; never happens at 40-60 people (at most ~19 presets)
    occupied.push(withGap(reserved));
    angles.set(s.id, Math.atan2(reserved.y + lh / 2 - cy, reserved.x + lw / 2 - cx));
    const [zw, zh] = SIZES[s.tier];
    const zone: Zone = {
      id: s.id, kind: "structure", name: s.presets.map((p) => p.name).join(" & "),
      x: reserved.x + Math.floor((lw - zw) / 2), y: reserved.y + Math.floor((lh - zh) / 2), w: zw, h: zh,
      floor: [0, 0], entrance: { x: 0, y: 0 }, structure: s,
    };
    const variants = s.presets.map((p) => pickVariant(p, seed, s.keywords));
    zone.floor = variants[0].floor;
    zone.variants = variants.map((v) => v.name);
    zone.entrance = entranceFacing(zone, cx, cy);
    zones.push(zone);
    furnish(zone, s, variants, seed, furniture, spots, circles, chatSpots);
  }

  // Square and plaza furniture: fountain, benches round it, planters; spawn signpost.
  furniture.push({ kind: "fountain", x: cx - 1, y: cy - 1, w: 2, h: 2, block: true, zone: "square" });
  const benches: Spot[] = [];
  for (const [bx, by, dir] of [[cx - 3, cy - 3, "S"], [cx + 2, cy - 3, "S"], [cx - 3, cy + 2, "N"], [cx + 2, cy + 2, "N"]] as const) {
    furniture.push({ kind: "bench", x: bx, y: by, w: 1, h: 1, block: false, zone: "square" });
    benches.push({ x: bx, y: by, dir: dir as Dir, pose: "sit", activity: "chill" });
  }
  for (const [px, py] of [[square.x, square.y], [square.x + sw - 1, square.y], [square.x, square.y + sh - 1], [square.x + sw - 1, square.y + sh - 1]])
    furniture.push({ kind: "planter", x: px, y: py, w: 1, h: 1, block: true, zone: "square" });
  chatSpots.square = [];
  for (const [x, y] of [[cx - 3, cy - 1], [cx + 2, cy - 1], [cx - 3, cy + 1], [cx + 2, cy + 1], [cx - 1, cy - 3], [cx - 1, cy + 3]])
    chatSpots.square.push([{ x, y, dir: "E", pose: "stand", activity: "chill" }, { x: x + 1, y, dir: "W", pose: "stand", activity: "chill" }]);
  furniture.push({ kind: "signpost", x: spawn.x + 1, y: spawn.y + 1, w: 1, h: 1, block: true, zone: "spawn" });
  const spawnTiles: { x: number; y: number }[] = [];
  for (let y = spawn.y + 2; y < spawn.y + ph - 1; y++) for (let x = spawn.x + 1; x < spawn.x + pw - 1; x++) spawnTiles.push({ x, y });

  // Paths: every structure entrance and the plaza to the square, then four trails to the edges.
  // Paths go around structures and the plaza; they only end at the square.
  const blocked = (x: number, y: number) => zones.some((z) => z.kind !== "square" && inside(z, x, y));
  const noise = rng(hash(`${seed}|noise`));
  const cost: number[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => 1 + noise() * 2.5));
  const paths = new Set<string>();
  const squareEdge = (x: number, y: number) => inside(square, x, y);
  const lay = (from: { x: number; y: number }, done: (x: number, y: number) => boolean) => {
    for (const [x, y] of weightedPath(from, done, cost, blocked, W, H, paths)) {
      if (!inside(square, x, y)) paths.add(tileKey(x, y));
    }
  };
  for (const z of zones.filter((z) => z.kind === "structure")) lay(outside(z, z.entrance), squareEdge);
  lay({ x: spawn.entrance.x, y: spawn.y - 1 }, squareEdge);
  for (const [ex, ey] of [[cx, 1], [1, cy], [W - 2, cy]] as const) lay({ x: ex, y: ey }, squareEdge);

  // Decor on open land: never on or next to a path, zone or other blocking decor, so nothing gets walled in.
  const decorRng = rng(hash(`${seed}|decor`));
  const nearZone = (x: number, y: number) => zones.some((z) => x >= z.x - 1 && x <= z.x + z.w && y >= z.y - 1 && y <= z.y + z.h);
  const nearPath = (x: number, y: number) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => paths.has(tileKey(x + dx, y + dy)));
  const blockers = new Set<string>();
  const crowded = (x: number, y: number) => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => blockers.has(tileKey(x + dx, y + dy)));
  let lampStep = 0;
  for (const key of [...paths].sort()) {
    if (++lampStep % 7) continue;
    const [px, py] = key.split(",").map(Number);
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const x = px + dx;
      const y = py + dy;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1 || paths.has(tileKey(x, y)) || nearZone(x, y) || crowded(x, y)) continue;
      furniture.push({ kind: "lamp", x, y, w: 1, h: 1, block: true, zone: null });
      blockers.add(tileKey(x, y));
      break;
    }
  }
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      if (nearZone(x, y) || nearPath(x, y) || crowded(x, y)) continue;
      const roll = decorRng();
      if (roll < 0.05) {
        furniture.push({ kind: "tree", x, y, w: 1, h: 1, block: true, zone: null });
        blockers.add(tileKey(x, y));
      } else if (roll < 0.075) {
        furniture.push({ kind: "bush", x, y, w: 1, h: 1, block: true, zone: null });
        blockers.add(tileKey(x, y));
      } else if (roll < 0.1) furniture.push({ kind: "flowers", x, y, w: 1, h: 1, block: false, zone: null });
    }

  const walk = Array.from({ length: H }, () => Array<number>(W).fill(0));
  for (const f of furniture)
    if (f.block) for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) if (walk[y]) walk[y][x] = 1;

  return { seed, width: W, height: H, zones, furniture, paths: [...paths].sort(), spots, circles, chatSpots, spawnTiles, benches, walk };
}

// ---- structure interiors ----

/** The variant drawn for the structure's own keywords (strongest match), else a seeded pick. */
function pickVariant(preset: Preset, seed: number, keywords: string[]): Variant {
  let best: Variant | null = null;
  let top = 0;
  for (const variant of preset.variants) {
    const score = Math.max(0, ...keywords.flatMap((k) => (variant.terms ?? []).map((t) => termScore(k, t))));
    if (score >= MATCH_MIN && score > top) {
      best = variant;
      top = score;
    }
  }
  return best ?? preset.variants[hash(`${seed}|variant|${preset.id}`) % preset.variants.length];
}

function furnish(
  zone: Zone, s: Structure, variants: Variant[], seed: number,
  out: WorldPlan["furniture"], spots: WorldPlan["spots"], circles: WorldPlan["circles"], chats: WorldPlan["chatSpots"],
) {
  const r = rng(hash(`${seed}|furnish|${s.id}`));
  const used = new Set<string>();
  const take = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) used.add(tileKey(xx, yy));
  };
  const free = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++)
        if (xx < zone.x || yy < zone.y || xx >= zone.x + zone.w || yy >= zone.y + zone.h || used.has(tileKey(xx, yy))) return false;
    return true;
  };
  // Keep the entrance and the tile inside it clear.
  take(zone.entrance.x, zone.entrance.y, 1, 1);
  const slots = variants.flatMap((v, i) => v.furniture.filter((f) => TIER_RANK[f.from ?? "S"] <= TIER_RANK[s.tier]).map((f) => ({ f, preset: s.presets[i] })));
  spots[zone.id] = [];
  circles[zone.id] = [];

  // Edge row: back of the zone; each tile gets an activity spot in front of it.
  let ex = zone.x + 1;
  const activityOf = (preset: Preset, i: number) => preset.activities[i % preset.activities.length];
  let n = 0;
  for (const { f, preset } of slots.filter((x) => x.f.place === "edge")) {
    const w = f.w ?? 1;
    const h = f.h ?? 1;
    if (ex + w > zone.x + zone.w - 1) break;
    if (!free(ex, zone.y, w, h)) { ex += 1; continue; }
    out.push({ kind: f.kind, x: ex, y: zone.y, w, h, block: !FLAT.has(f.kind), zone: zone.id });
    take(ex, zone.y, w, h + 1);
    for (let i = 0; i < w; i++) {
      const activity = activityOf(preset, n++);
      spots[zone.id].push({ x: ex + i, y: zone.y + h, dir: "N", pose: STANDING.has(activity) ? "act" : "sit", activity });
    }
    ex += w;
  }

  // The group table first (every structure can host a group): the preset's own 2x2 centrepiece if it has one,
  // else a plain table, with its ring of 8 seats kept clear.
  const centre = slots.filter((x) => x.f.place === "center");
  const ringSlot = centre.find(({ f }) => CIRCLE_KINDS.has(f.kind) && (f.w ?? 2) === 2 && (f.h ?? 2) === 2);
  const ringKind: FurnitureKind = ringSlot?.f.kind ?? "table";
  const lead = ringSlot?.preset ?? s.presets[0];
  ring: for (let y = zone.y + 3; y + 3 <= zone.y + zone.h; y++)
    for (let x = zone.x + 1; x + 3 <= zone.x + zone.w; x++)
      if (free(x - 1, y - 1, 4, 4)) {
        out.push({ kind: ringKind, x, y, w: 2, h: 2, block: !FLAT.has(ringKind), zone: zone.id });
        take(x - 1, y - 1, 4, 4);
        circles[zone.id].push({ x, y, pose: lead.group.pose, activity: lead.group.activity });
        break ring;
      }

  // The other centre pieces wherever they fit, leaving a tile of space around each.
  for (const { f } of centre.filter((x) => x !== ringSlot)) {
    const w = f.w ?? 2;
    const h = f.h ?? 2;
    place: for (let y = zone.y + 2; y + h <= zone.y + zone.h; y++)
      for (let x = zone.x + 1; x + w <= zone.x + zone.w; x++)
        if (free(x - 1, y - 1, w + 2, h + 2) || (FLAT.has(f.kind) && free(x, y, w, h))) {
          out.push({ kind: f.kind, x, y, w, h, block: !FLAT.has(f.kind), zone: zone.id });
          take(x, y, w, h);
          break place;
        }
  }

  // Chat spots: two facing tiles on the front rows.
  chats[zone.id] = [];
  for (let y = zone.y + zone.h - 1; y >= zone.y + 2 && chats[zone.id].length < 3; y--)
    for (let x = zone.x + 1; x + 1 < zone.x + zone.w && chats[zone.id].length < 3; x += 3)
      if (free(x, y, 2, 1)) {
        chats[zone.id].push([{ x, y, dir: "E", pose: "stand", activity: "chill" }, { x: x + 1, y, dir: "W", pose: "stand", activity: "chill" }]);
        take(x, y, 2, 1);
      }

  // Scatter pieces on what's left (never next to the entrance).
  for (const { f } of slots.filter((x) => x.f.place === "scatter"))
    for (let tries = 0; tries < 20; tries++) {
      const x = zone.x + Math.floor(r() * zone.w);
      const y = zone.y + Math.floor(r() * zone.h);
      if (!free(x, y, 1, 1) || Math.abs(x - zone.entrance.x) + Math.abs(y - zone.entrance.y) < 2) continue;
      out.push({ kind: f.kind, x, y, w: 1, h: 1, block: !FLAT.has(f.kind), zone: zone.id });
      take(x, y, 1, 1);
      break;
    }
}

// ---- geometry helpers ----

type Rect = { x: number; y: number; w: number; h: number };

function withGap(r: Rect): Rect {
  return { x: r.x - GAP, y: r.y - GAP, w: r.w + GAP * 2, h: r.h + GAP * 2 };
}

function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function inside(z: Rect, x: number, y: number) {
  return x >= z.x && y >= z.y && x < z.x + z.w && y < z.y + z.h;
}

function meanAngle(angles: number[]) {
  return Math.atan2(angles.reduce((s, a) => s + Math.sin(a), 0), angles.reduce((s, a) => s + Math.cos(a), 0));
}

/** The first free w x h rect around (cx, cy), searching outward in rings and sideways from `angle`. */
function placeAround(cx: number, cy: number, w: number, h: number, angle: number, occupied: Rect[], W: number, H: number): Rect | null {
  for (let radius = 11; radius < Math.max(W, H); radius += 1.5)
    for (let k = 0; k <= 24; k++) {
      const a = angle + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 12);
      const rect = {
        x: Math.round(cx + Math.cos(a) * radius * 1.15 - w / 2),
        y: Math.round(cy + Math.sin(a) * radius - h / 2),
        w,
        h,
      };
      if (rect.x < 1 || rect.y < 1 || rect.x + w > W - 1 || rect.y + h > H - 1) continue;
      if (occupied.some((o) => overlaps(o, rect))) continue;
      return rect;
    }
  return null;
}

/** Middle of the zone side that faces (tx, ty), just inside the zone. */
function entranceFacing(z: Rect, tx: number, ty: number) {
  const dx = tx - (z.x + z.w / 2);
  const dy = ty - (z.y + z.h / 2);
  if (Math.abs(dx) > Math.abs(dy)) return { x: dx > 0 ? z.x + z.w - 1 : z.x, y: z.y + Math.floor(z.h / 2) };
  return { x: z.x + Math.floor(z.w / 2), y: dy > 0 ? z.y + z.h - 1 : z.y };
}

/** The tile just outside a zone's entrance. */
function outside(z: Rect, e: { x: number; y: number }) {
  if (e.x === z.x) return { x: e.x - 1, y: e.y };
  if (e.x === z.x + z.w - 1) return { x: e.x + 1, y: e.y };
  if (e.y === z.y) return { x: e.x, y: e.y - 1 };
  return { x: e.x, y: e.y + 1 };
}

/** Cheapest 4-connected route from `from` to any tile where `done` holds (Dijkstra over seeded costs, laid paths
 * cost a fraction, so new paths join the network instead of running alongside it). */
function weightedPath(
  from: { x: number; y: number },
  done: (x: number, y: number) => boolean,
  cost: number[][],
  blocked: (x: number, y: number) => boolean,
  W: number,
  H: number,
  laid: Set<string>,
): [number, number][] {
  const dist = new Map<string, number>([[tileKey(from.x, from.y), 0]]);
  const prev = new Map<string, string>();
  const open: [number, number, number][] = [[0, from.x, from.y]];
  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i][0] < open[best][0]) best = i;
    const [d, x, y] = open.splice(best, 1)[0];
    const key = tileKey(x, y);
    if (d > (dist.get(key) ?? Infinity)) continue;
    if (done(x, y)) {
      const out: [number, number][] = [];
      for (let k: string | undefined = key; k; k = prev.get(k)) out.push(k.split(",").map(Number) as [number, number]);
      return out.reverse();
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || blocked(nx, ny)) continue;
      const nk = tileKey(nx, ny);
      const nd = d + (laid.has(nk) ? 0.3 : cost[ny][nx]);
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        prev.set(nk, key);
        open.push([nd, nx, ny]);
      }
    }
  }
  return [];
}
