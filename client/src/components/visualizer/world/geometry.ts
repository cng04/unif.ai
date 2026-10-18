// Shared geometry for the single-floor World: the isometric projection, facing directions, the furniture and
// spot vocabulary, and the seeded RNG every generator uses. Pure; no Pixi.

export const TILE_W = 32;
export const TILE_H = 16;

/** Centre of tile (x, y) in world pixels (fractional tiles interpolate). +x runs down-right, +y down-left. */
export function tileToScreen(x: number, y: number): { x: number; y: number } {
  return { x: (x - y) * (TILE_W / 2), y: (x + y) * (TILE_H / 2) };
}

/** Screen bounds of a `w` x `h` tile map, for camera limits. */
export function mapBounds(w: number, h: number) {
  return { minX: -h * (TILE_W / 2), maxX: w * (TILE_W / 2), minY: -TILE_H, maxY: (w + h) * (TILE_H / 2) };
}

/** Depth key shared by furniture, decor and agents: larger draws later (in front). */
export function depthOf(x: number, y: number): number {
  return (x + y) * 10;
}

export type Dir = "N" | "S" | "E" | "W";

/** Grid step to sprite facing: -y (up-right, "into" the scene) is N. */
export function dirFor(dx: number, dy: number, fallback: Dir = "S"): Dir {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "E" : "W";
  if (dy !== 0) return dy > 0 ? "S" : "N";
  return fallback;
}

export type Activity =
  | "chill" | "cook" | "drink" | "dance" | "type" | "read" | "guitar" | "keys" | "drums" | "game" | "run" | "lift"
  | "climb";

export type Spot = { x: number; y: number; dir: Dir; pose: "sit" | "act" | "stand"; activity: Activity };

export type FurnitureKind =
  | "bookshelf" | "tv" | "plant" | "lamp" | "couch" | "rug"
  | "counter" | "stove" | "fridge" | "bar"
  | "dj" | "speaker" | "discofloor"
  | "desk" | "bigtable" | "workbench" | "easel"
  | "amp" | "drums" | "piano"
  | "arcade"
  | "treadmill" | "rack" | "mat"
  | "climbwall" | "boulder"
  | "bench" | "table"
  | "planter" | "pen" | "tent" | "telescope"
  // Landscape and shared infrastructure.
  | "tree" | "bush" | "flowers" | "fountain" | "signpost";

export type Furniture = { kind: FurnitureKind; x: number; y: number; w: number; h: number; block: boolean };

/** Eight tiles around a 2x2 centrepiece, ordered so 4-8 members spread evenly round the table. */
export function circleSeats(cx: number, cy: number, pose: "sit" | "act", activity: Activity): Spot[] {
  const s = (x: number, y: number, dir: Dir): Spot => ({ x, y, dir, pose, activity });
  const top = [s(cx, cy - 1, "S"), s(cx + 1, cy - 1, "S")];
  const bottom = [s(cx, cy + 2, "N"), s(cx + 1, cy + 2, "N")];
  const left = [s(cx - 1, cy, "E"), s(cx - 1, cy + 1, "E")];
  const right = [s(cx + 2, cy, "W"), s(cx + 2, cy + 1, "W")];
  return [top[0], bottom[1], left[0], right[1], top[1], bottom[0], left[1], right[0]];
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

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
