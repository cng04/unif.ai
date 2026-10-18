// The building: three open warehouse floors (no walls; zones by tint and furniture, as in the Paper "Warehouse ·
// open floor" artboards) of three zones each on an isometric tile grid, plus the spots agents use (activities,
// chats, group circles) and the A* walkability matrix. Pure data and math, no Pixi.

import type { WorldAgent } from "./types";

export const TILE_W = 32;
export const TILE_H = 16;
export const COLS = 29;
export const ROWS = 11;
/** Headroom above the back row for tall furniture (bookshelves, arcade cabinets, pillars). */
export const WALL_H = 44;
/** Gap between floors in world pixels, where the floor label sits. */
export const FLOOR_GAP = 36;

/** Screen size of one floor: the iso diamond of the grid, the back walls above it, and the 16px block sides of the
 * 32x32 front-edge tiles below it. Tiles project as 32x16 diamonds (2:1 iso); each tile image is 32x32. */
export const FLOOR_W = (COLS + ROWS) * (TILE_W / 2);
export const FLOOR_H = (COLS + ROWS) * (TILE_H / 2) + WALL_H + 20;

export type FloorId = "L2" | "L1" | "B1";
/** Top to bottom, the order they're stacked on screen. */
export const FLOORS: { id: FloorId; name: string }[] = [
  { id: "L2", name: "L2 · creative & focus" },
  { id: "L1", name: "L1 · main hub" },
  { id: "B1", name: "B1 · active & unplaced" },
];

export function floorTop(floor: FloorId): number {
  return FLOORS.findIndex((f) => f.id === floor) * (FLOOR_H + FLOOR_GAP) + FLOOR_GAP;
}
export const WORLD_H = FLOORS.length * (FLOOR_H + FLOOR_GAP) + FLOOR_GAP;

/** Center of tile (x, y) on its floor, in world pixels. Fractional tiles interpolate. */
export function tileToWorld(floor: FloorId, x: number, y: number): { x: number; y: number } {
  return {
    x: (x - y) * (TILE_W / 2) + ROWS * (TILE_W / 2),
    y: (x + y) * (TILE_H / 2) + TILE_H / 2 + WALL_H + floorTop(floor),
  };
}

export type Dir = "N" | "S" | "E" | "W";

/** Grid step to sprite facing: +x runs down-right, +y down-left, so -y (toward the back wall) is "N". */
export function dirFor(dx: number, dy: number, fallback: Dir = "S"): Dir {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "E" : "W";
  if (dy !== 0) return dy > 0 ? "S" : "N";
  return fallback;
}

export type Activity =
  | "chill"
  | "cook"
  | "drink"
  | "dance"
  | "type"
  | "read"
  | "guitar"
  | "keys"
  | "drums"
  | "game"
  | "run"
  | "lift"
  | "climb";

export type Spot = { x: number; y: number; dir: Dir; pose: "sit" | "act" | "stand"; activity: Activity };

export type FurnitureKind =
  | "bookshelf" | "tv" | "plant" | "lamp" | "couch" | "rug"
  | "counter" | "stove" | "fridge" | "bar" | "stool"
  | "dj" | "speaker" | "discofloor"
  | "desk" | "bigtable"
  | "amp" | "drums" | "piano"
  | "arcade"
  | "treadmill" | "rack" | "mat"
  | "climbwall" | "boulder"
  | "bench"
  | "table" | "elevator";

export type Furniture = { kind: FurnitureKind; x: number; y: number; w: number; h: number; block: boolean };

export type RoomId = "lounge" | "kitchen" | "party" | "study" | "music" | "arcade" | "gym" | "boulder" | "bench";

export type Room = {
  id: RoomId;
  floor: FloorId;
  name: string;
  x0: number;
  x1: number;
  /** Light checker in the zone's tint. */
  floorColors: [number, number];
  /** What a group does around its centerpiece here. */
  groupActivity: Activity;
  groupPose: "sit" | "act";
  centerpiece: FurnitureKind;
  furniture: Furniture[];
  spots: Spot[];
  /** Two facing tiles each. */
  chatSpots: [Spot, Spot][];
  /** Top-left tile of each 2x2 group centerpiece; members stand or sit on the 8 tiles around it. */
  circles: { x: number; y: number }[];
  /** Interest words that pull an agent into this room. */
  keywords: RegExp;
};

/** Every floor has an elevator pad at the back of its middle zone, at the same tile. */
export const ELEVATOR = { x: 14, y: 0 };
const ROOM_X = [0, 10, 20] as const;

/** Stone pillars on the old partition lines between zones; they block movement. */
export const PILLARS: Record<FloorId, { x: number; y: number }[]> = {
  L2: [{ x: 9, y: 3 }, { x: 19, y: 1 }, { x: 9, y: 8 }, { x: 19, y: 7 }],
  L1: [{ x: 9, y: 2 }, { x: 19, y: 4 }, { x: 19, y: 9 }],
  B1: [{ x: 9, y: 2 }, { x: 19, y: 1 }, { x: 19, y: 8 }],
};

type RoomSpec = Omit<Room, "x0" | "x1" | "furniture" | "spots" | "chatSpots" | "circles"> & {
  /** Local-x furniture and spots, shifted into the room's columns. */
  furniture: Furniture[];
  spots: Spot[];
};

const f = (kind: FurnitureKind, x: number, y: number, w = 1, h = 1, block = true): Furniture => ({
  kind, x, y, w, h, block,
});
const s = (x: number, y: number, dir: Dir, pose: Spot["pose"], activity: Activity): Spot => ({
  x, y, dir, pose, activity,
});

const SPECS: RoomSpec[] = [
  // ---- L2 ----
  {
    id: "study", floor: "L2", name: "Quiet Study", floorColors: [0xefebe4, 0xe7e2d9],
    groupActivity: "read", groupPose: "sit", centerpiece: "bigtable",
    keywords: /read|book|study|writ|poet|science|research|learn|philosoph|history|math|cod(e|ing)|program|tech|startup|ai\b|language|museum|podcast/i,
    furniture: [f("bookshelf", 0, 0, 2), f("desk", 2, 0, 2), f("plant", 4, 0), f("desk", 5, 0, 2), f("bookshelf", 7, 0, 2), f("rug", 1, 2, 7, 2, false)],
    spots: [s(2, 1, "N", "sit", "type"), s(3, 1, "N", "sit", "type"), s(5, 1, "N", "sit", "type"), s(6, 1, "N", "sit", "type"), s(0, 1, "N", "stand", "read"), s(8, 1, "N", "stand", "read")],
  },
  {
    id: "music", floor: "L2", name: "Music Studio", floorColors: [0xf0e8d8, 0xe9dfcc],
    groupActivity: "guitar", groupPose: "act", centerpiece: "rug",
    keywords: /music|guitar|piano|sing|band|concert|jazz|vinyl|song|drum|dj|art\b|arts|paint|draw|film|photo|creative|theat|danc(e|ing) class|museum/i,
    furniture: [f("amp", 0, 0), f("drums", 1, 0, 2), f("speaker", 3, 0), f("piano", 5, 0, 2), f("amp", 7, 0), f("plant", 8, 0)],
    spots: [s(0, 1, "N", "act", "guitar"), s(1, 1, "N", "act", "drums"), s(2, 1, "N", "act", "drums"), s(5, 1, "N", "sit", "keys"), s(6, 1, "N", "sit", "keys"), s(7, 1, "N", "act", "guitar")],
  },
  {
    id: "arcade", floor: "L2", name: "Gaming Arcade", floorColors: [0xd9dcea, 0xd0d4e5],
    groupActivity: "game", groupPose: "sit", centerpiece: "table",
    keywords: /game|gaming|arcade|anime|esport|nintendo|chess|dnd|d&d|tabletop|board ?game|puzzle|trivia|movie|comic|sci-?fi/i,
    furniture: [0, 1, 2, 3, 5, 6, 7, 8].map((x) => f("arcade", x, 0)),
    spots: [0, 1, 2, 3, 5, 6, 7, 8].map((x) => s(x, 1, "N", "act", "game")),
  },
  // ---- L1 ----
  {
    id: "lounge", floor: "L1", name: "Onboarding Lounge", floorColors: [0xefebe4, 0xe7e2d9],
    groupActivity: "chill", groupPose: "sit", centerpiece: "table",
    keywords: /convers|chat|deep talk|people|friends|meet|community|volunteer|chill|relax|tea\b/i,
    furniture: [f("bookshelf", 0, 0), f("plant", 1, 0), f("tv", 3, 0, 3), f("lamp", 7, 0), f("couch", 8, 0), f("rug", 2, 1, 5, 2, false)],
    spots: [s(3, 1, "N", "sit", "chill"), s(4, 1, "N", "sit", "chill"), s(5, 1, "N", "sit", "chill"), s(2, 2, "N", "sit", "chill"), s(6, 2, "N", "sit", "chill")],
  },
  {
    id: "kitchen", floor: "L1", name: "Kitchen & Bar", floorColors: [0xede2d0, 0xe5d8c4],
    groupActivity: "drink", groupPose: "sit", centerpiece: "table",
    keywords: /cook|food|bak(e|ing)|brunch|breakfast|coffee|caf[eé]|wine|beer|cocktail|restaurant|supper|dinner|foodie|eat|bbq|ramen|sushi|pizza|taco|kitchen|chef/i,
    furniture: [f("fridge", 0, 0), f("stove", 1, 0, 2), f("counter", 3, 0), f("bar", 5, 0, 4)],
    spots: [s(1, 1, "N", "act", "cook"), s(2, 1, "N", "act", "cook"), s(3, 1, "N", "act", "cook"), s(5, 1, "N", "sit", "drink"), s(6, 1, "N", "sit", "drink"), s(7, 1, "N", "sit", "drink"), s(8, 1, "N", "sit", "drink")],
  },
  {
    id: "party", floor: "L1", name: "Party Plaza", floorColors: [0xe6e6ee, 0xdedfea],
    groupActivity: "dance", groupPose: "act", centerpiece: "speaker",
    keywords: /party|danc|club|nightlife|festival|rave|karaoke|bar hop|night out|social|drinks|edm|house music|techno/i,
    furniture: [f("speaker", 0, 0), f("plant", 1, 0), f("dj", 3, 0, 3), f("plant", 7, 0), f("speaker", 8, 0), f("discofloor", 1, 1, 7, 3, false)],
    spots: [2, 3, 4, 5, 6].map((x) => s(x, 2, "N", "act", "dance") as Spot).concat([s(3, 1, "N", "act", "dance"), s(5, 1, "N", "act", "dance")]),
  },
  // ---- B1 ----
  {
    id: "gym", floor: "B1", name: "Gym & Track", floorColors: [0xf0ddd3, 0xe9d3c7],
    groupActivity: "lift", groupPose: "act", centerpiece: "mat",
    keywords: /gym|fitness|run|lift|workout|yoga|pilates|sport|soccer|football|basketball|tennis|volleyball|cycl|bike|swim|marathon|crossfit|martial|box(ing)?\b|pickleball/i,
    furniture: [f("treadmill", 0, 0), f("treadmill", 1, 0), f("treadmill", 2, 0), f("rack", 4, 0, 3), f("plant", 8, 0)],
    spots: [s(0, 1, "N", "act", "run"), s(1, 1, "N", "act", "run"), s(2, 1, "N", "act", "run"), s(4, 1, "N", "act", "lift"), s(5, 1, "N", "act", "lift"), s(6, 1, "N", "act", "lift")],
  },
  {
    id: "boulder", floor: "B1", name: "Bouldering Wall", floorColors: [0xefebe4, 0xe7e2d9],
    groupActivity: "climb", groupPose: "act", centerpiece: "boulder",
    keywords: /climb|boulder|hik(e|ing)|outdoor|camp|trail|surf|ski|snowboard|nature|adventure|travel|kayak|backpack|mountain|national park/i,
    // A free-standing wall (no room walls on an open floor); climbers stand on the mats in front of it.
    furniture: [f("climbwall", 0, 0, 4, 1), f("climbwall", 5, 0, 4, 1), f("mat", 0, 1, 9, 2, false)],
    spots: [0, 1, 2, 3, 5, 6, 7, 8].map((x) => s(x, 1, "N", "act", "climb")),
  },
  {
    id: "bench", floor: "B1", name: "Unplaced Bench", floorColors: [0xeee6d8, 0xe6dccb],
    groupActivity: "chill", groupPose: "sit", centerpiece: "table",
    keywords: /^$/,
    furniture: [f("bench", 0, 0, 3, 1, false), f("plant", 4, 0), f("bench", 6, 0, 3, 1, false), f("bench", 0, 8, 1, 3, false), f("lamp", 8, 9)],
    spots: [s(0, 0, "S", "sit", "chill"), s(1, 0, "S", "sit", "chill"), s(2, 0, "S", "sit", "chill"), s(6, 0, "S", "sit", "chill"), s(7, 0, "S", "sit", "chill"), s(8, 0, "S", "sit", "chill"), s(0, 8, "E", "sit", "chill"), s(0, 9, "E", "sit", "chill"), s(0, 10, "E", "sit", "chill")],
  },
];

const FLOOR_ORDER: FloorId[] = ["L2", "L1", "B1"];

function buildRoom(spec: RoomSpec, index: number): Room {
  const x0 = ROOM_X[index % 3];
  const shiftF = (it: Furniture): Furniture => ({ ...it, x: it.x + x0 });
  const shiftS = (it: Spot): Spot => ({ ...it, x: it.x + x0 });
  const isBench = spec.id === "bench";
  const circles = isBench ? [] : [{ x: x0 + 2, y: 6 }, { x: x0 + 6, y: 6 }];
  const furniture = spec.furniture.map(shiftF);
  for (const c of circles) furniture.push(f(spec.centerpiece, c.x, c.y, 2, 2, spec.centerpiece !== "rug"));
  if (index % 3 === 1) furniture.push(f("elevator", ELEVATOR.x, ELEVATOR.y, 1, 1, false));
  const chat = (x: number, y: number): [Spot, Spot] => [
    s(x0 + x, y, "E", "stand", "chill"),
    s(x0 + x + 1, y, "W", "stand", "chill"),
  ];
  return {
    ...spec,
    x0,
    x1: x0 + 8,
    furniture,
    spots: spec.spots.map(shiftS),
    chatSpots: isBench
      ? [chat(3, 4), chat(5, 6), chat(3, 9)]
      : [chat(1, 3), chat(4, 3), chat(2, 10), chat(5, 10)],
    circles,
  };
}

export const ROOMS: Room[] = FLOOR_ORDER.flatMap((floor) =>
  SPECS.filter((r) => r.floor === floor).map((spec, i) => buildRoom(spec, i)),
);
export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r])) as Record<RoomId, Room>;

export function roomAt(floor: FloorId, x: number): Room {
  return ROOMS.find((r) => r.floor === floor && x >= r.x0 && x <= r.x1) ?? ROOMS.find((r) => r.floor === floor)!;
}

/** Eight tiles around a 2x2 centerpiece, ordered so 3-8 members spread evenly round the table. */
export function circleSeats(cx: number, cy: number, pose: "sit" | "act", activity: Activity): Spot[] {
  const top = [s(cx, cy - 1, "S", pose, activity), s(cx + 1, cy - 1, "S", pose, activity)];
  const bottom = [s(cx, cy + 2, "N", pose, activity), s(cx + 1, cy + 2, "N", pose, activity)];
  const left = [s(cx - 1, cy, "E", pose, activity), s(cx - 1, cy + 1, "E", pose, activity)];
  const right = [s(cx + 2, cy, "W", pose, activity), s(cx + 2, cy + 1, "W", pose, activity)];
  return [top[0], bottom[1], left[0], right[1], top[1], bottom[0], left[1], right[0]];
}

/** 0 = walkable, 1 = blocked, indexed [y][x] as the `pathfinding` Grid expects. */
export function walkMatrix(floor: FloorId): number[][] {
  const m = Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0));
  for (const p of PILLARS[floor]) m[p.y][p.x] = 1;
  for (const room of ROOMS.filter((r) => r.floor === floor))
    for (const it of room.furniture)
      if (it.block) for (let y = it.y; y < it.y + it.h; y++) for (let x = it.x; x < it.x + it.w; x++) m[y][x] = 1;
  return m;
}

// ---- Room affinity ----

const AFFINITY_ROOMS: RoomId[] = ["kitchen", "party", "study", "music", "arcade", "gym", "boulder", "lounge"];

/** Rank rooms for an agent. Matching's keyword scores count first: each keyword that names a room adds how far
 * the score sits above "no signal" (0.5). Public interests break what's left (earlier ones weigh more), then the
 * keyword-score projection so similar people still land together, then a stable hash of the id. */
export function roomAffinity(
  agent: Pick<WorldAgent, "id" | "interests" | "point"> & { keywords?: WorldAgent["keywords"] },
): RoomId[] {
  const score = new Map<RoomId, number>(AFFINITY_ROOMS.map((r) => [r, 0]));
  for (const { name, score: s } of agent.keywords ?? [])
    if (s > 0.5)
      for (const id of AFFINITY_ROOMS) if (ROOM_BY_ID[id].keywords.test(name)) score.set(id, score.get(id)! + (s - 0.5) * 4);
  agent.interests.forEach((interest, i) => {
    const weight = 0.25 / (1 + i * 0.35);
    for (const id of AFFINITY_ROOMS) if (ROOM_BY_ID[id].keywords.test(interest)) score.set(id, score.get(id)! + weight);
  });
  const fallback = fallbackRoom(agent);
  return [...AFFINITY_ROOMS].sort(
    (a, b) => score.get(b)! - score.get(a)! || (a === fallback ? -1 : b === fallback ? 1 : 0),
  );
}

function fallbackRoom(agent: Pick<WorldAgent, "id" | "point">): RoomId {
  if (agent.point) {
    const [x, y] = agent.point;
    const angle = (Math.atan2(y, x) + Math.PI) / (2 * Math.PI);
    return AFFINITY_ROOMS[Math.min(AFFINITY_ROOMS.length - 1, Math.floor(angle * AFFINITY_ROOMS.length))];
  }
  return AFFINITY_ROOMS[hash(agent.id) % AFFINITY_ROOMS.length];
}

/** Small stable string hash (FNV-1a). */
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic PRNG for per-agent choices. */
export function rng(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
