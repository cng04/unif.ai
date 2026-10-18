// The building: three floors of three rooms each on an isometric tile grid, plus the spots agents use
// (activities, chats, group circles) and the A* walkability matrix. Pure data and math, no Pixi.

import type { WorldAgent } from "./types";

export const TILE_W = 32;
export const TILE_H = 16;
export const COLS = 29;
export const ROWS = 11;
export const WALL_H = 44;
/** Gap between floors in world pixels, where the floor label sits. */
export const FLOOR_GAP = 36;

/** Screen size of one floor: the iso diamond of the grid plus the back walls above it. */
export const FLOOR_W = (COLS + ROWS) * (TILE_W / 2);
export const FLOOR_H = (COLS + ROWS) * (TILE_H / 2) + WALL_H + 12;

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
  floorColors: [number, number];
  wallColor: number;
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

/** Every floor has an elevator on the back wall of its middle room, at the same tile. */
export const ELEVATOR = { x: 14, y: 0 };
const ROOM_X = [0, 10, 20] as const;
const DOOR_YS = [2, 3, 4];

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
    id: "study", floor: "L2", name: "Quiet Study", floorColors: [0xb98b5e, 0xa97c52], wallColor: 0x7d8f7a,
    groupActivity: "read", groupPose: "sit", centerpiece: "bigtable",
    keywords: /read|book|study|writ|poet|science|research|learn|philosoph|history|math|cod(e|ing)|program|tech|startup|ai\b|language|museum|podcast/i,
    furniture: [f("bookshelf", 0, 0, 2), f("desk", 2, 0, 2), f("plant", 4, 0), f("desk", 5, 0, 2), f("bookshelf", 7, 0, 2)],
    spots: [s(2, 1, "N", "sit", "type"), s(3, 1, "N", "sit", "type"), s(5, 1, "N", "sit", "type"), s(6, 1, "N", "sit", "type"), s(0, 1, "N", "stand", "read"), s(8, 1, "N", "stand", "read")],
  },
  {
    id: "music", floor: "L2", name: "Music Studio", floorColors: [0x4a3f5c, 0x423852], wallColor: 0x2f2a3d,
    groupActivity: "guitar", groupPose: "act", centerpiece: "rug",
    keywords: /music|guitar|piano|sing|band|concert|jazz|vinyl|song|drum|dj|art\b|arts|paint|draw|film|photo|creative|theat|danc(e|ing) class|museum/i,
    furniture: [f("amp", 0, 0), f("drums", 1, 0, 2), f("speaker", 3, 0), f("piano", 5, 0, 2), f("amp", 7, 0), f("plant", 8, 0)],
    spots: [s(0, 1, "N", "act", "guitar"), s(1, 1, "N", "act", "drums"), s(2, 1, "N", "act", "drums"), s(5, 1, "N", "sit", "keys"), s(6, 1, "N", "sit", "keys"), s(7, 1, "N", "act", "guitar")],
  },
  {
    id: "arcade", floor: "L2", name: "Gaming Arcade", floorColors: [0x1f2340, 0x262b4d], wallColor: 0x15182c,
    groupActivity: "game", groupPose: "sit", centerpiece: "table",
    keywords: /game|gaming|arcade|anime|esport|nintendo|chess|dnd|d&d|tabletop|board ?game|puzzle|trivia|movie|comic|sci-?fi/i,
    furniture: [0, 1, 2, 3, 5, 6, 7, 8].map((x) => f("arcade", x, 0)),
    spots: [0, 1, 2, 3, 5, 6, 7, 8].map((x) => s(x, 1, "N", "act", "game")),
  },
  // ---- L1 ----
  {
    id: "lounge", floor: "L1", name: "Onboarding Lounge", floorColors: [0xc7a27c, 0xbd9771], wallColor: 0xd9c7a8,
    groupActivity: "chill", groupPose: "sit", centerpiece: "table",
    keywords: /convers|chat|deep talk|people|friends|meet|community|volunteer|chill|relax|tea\b/i,
    furniture: [f("bookshelf", 0, 0), f("plant", 1, 0), f("tv", 3, 0, 3), f("lamp", 7, 0), f("couch", 8, 0), f("rug", 2, 1, 5, 2, false)],
    spots: [s(3, 1, "N", "sit", "chill"), s(4, 1, "N", "sit", "chill"), s(5, 1, "N", "sit", "chill"), s(2, 2, "N", "sit", "chill"), s(6, 2, "N", "sit", "chill")],
  },
  {
    id: "kitchen", floor: "L1", name: "Kitchen & Bar", floorColors: [0xe8e2d4, 0x9fb3b8], wallColor: 0xc9a46a,
    groupActivity: "drink", groupPose: "sit", centerpiece: "table",
    keywords: /cook|food|bak(e|ing)|brunch|breakfast|coffee|caf[eé]|wine|beer|cocktail|restaurant|supper|dinner|foodie|eat|bbq|ramen|sushi|pizza|taco|kitchen|chef/i,
    furniture: [f("fridge", 0, 0), f("stove", 1, 0, 2), f("counter", 3, 0), f("bar", 5, 0, 4)],
    spots: [s(1, 1, "N", "act", "cook"), s(2, 1, "N", "act", "cook"), s(3, 1, "N", "act", "cook"), s(5, 1, "N", "sit", "drink"), s(6, 1, "N", "sit", "drink"), s(7, 1, "N", "sit", "drink"), s(8, 1, "N", "sit", "drink")],
  },
  {
    id: "party", floor: "L1", name: "Party Plaza", floorColors: [0x2a2238, 0x33294a], wallColor: 0x3b2d55,
    groupActivity: "dance", groupPose: "act", centerpiece: "speaker",
    keywords: /party|danc|club|nightlife|festival|rave|karaoke|bar hop|night out|social|drinks|edm|house music|techno/i,
    furniture: [f("speaker", 0, 0), f("plant", 1, 0), f("dj", 3, 0, 3), f("plant", 7, 0), f("speaker", 8, 0), f("discofloor", 1, 1, 7, 3, false)],
    spots: [2, 3, 4, 5, 6].map((x) => s(x, 2, "N", "act", "dance") as Spot).concat([s(3, 1, "N", "act", "dance"), s(5, 1, "N", "act", "dance")]),
  },
  // ---- B1 ----
  {
    id: "gym", floor: "B1", name: "Gym & Track", floorColors: [0x3d4147, 0x363a3f], wallColor: 0x5a6068,
    groupActivity: "lift", groupPose: "act", centerpiece: "mat",
    keywords: /gym|fitness|run|lift|workout|yoga|pilates|sport|soccer|football|basketball|tennis|volleyball|cycl|bike|swim|marathon|crossfit|martial|box(ing)?\b|pickleball/i,
    furniture: [f("treadmill", 0, 0), f("treadmill", 1, 0), f("treadmill", 2, 0), f("rack", 4, 0, 3), f("plant", 8, 0)],
    spots: [s(0, 1, "N", "act", "run"), s(1, 1, "N", "act", "run"), s(2, 1, "N", "act", "run"), s(4, 1, "N", "act", "lift"), s(5, 1, "N", "act", "lift"), s(6, 1, "N", "act", "lift")],
  },
  {
    id: "boulder", floor: "B1", name: "Bouldering Wall", floorColors: [0x5d7a8c, 0x557183], wallColor: 0xb7804f,
    groupActivity: "climb", groupPose: "act", centerpiece: "boulder",
    keywords: /climb|boulder|hik(e|ing)|outdoor|camp|trail|surf|ski|snowboard|nature|adventure|travel|kayak|backpack|mountain|national park/i,
    furniture: [f("climbwall", 0, 0, 4, 1, false), f("climbwall", 5, 0, 4, 1, false), f("mat", 0, 1, 9, 1, false)],
    spots: [0, 1, 2, 3, 5, 6, 7, 8].map((x) => s(x, 0, "N", "act", "climb")),
  },
  {
    id: "bench", floor: "B1", name: "Unplaced Bench", floorColors: [0x8a8f94, 0x81868b], wallColor: 0x6f7479,
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

/** Eight tiles around a 2x2 centerpiece, ordered so 4-8 members spread evenly round the table. */
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
  for (const wx of [9, 19]) for (let y = 0; y < ROWS; y++) if (!DOOR_YS.includes(y)) m[y][wx] = 1;
  for (const room of ROOMS.filter((r) => r.floor === floor))
    for (const it of room.furniture)
      if (it.block) for (let y = it.y; y < it.y + it.h; y++) for (let x = it.x; x < it.x + it.w; x++) m[y][x] = 1;
  return m;
}

export function isPartitionWall(x: number, y: number): boolean {
  return (x === 9 || x === 19) && !DOOR_YS.includes(y);
}

// ---- Room affinity ----

const AFFINITY_ROOMS: RoomId[] = ["kitchen", "party", "study", "music", "arcade", "gym", "boulder", "lounge"];

/** Rank rooms for an agent from its public interests; earlier interests weigh more. Ties fall back to the
 * keyword-score projection so similar people still land together, then to a stable hash of the id. */
export function roomAffinity(agent: Pick<WorldAgent, "id" | "interests" | "point">): RoomId[] {
  const score = new Map<RoomId, number>(AFFINITY_ROOMS.map((r) => [r, 0]));
  agent.interests.forEach((interest, i) => {
    const weight = 1 / (1 + i * 0.35);
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
