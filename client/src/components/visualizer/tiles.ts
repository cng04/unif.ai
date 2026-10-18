// The floor tilemap: 32x32 pixel-art isometric block tiles (a 32x16 top face over 16px of block sides), one
// texture per room theme, painted on a canvas and drawn back to front so only the front edge shows its sides.

import { Container, Sprite, Texture } from "pixi.js";
import { COLS, ROWS, TILE_H, TILE_W, hash, isPartitionWall, tileToWorld, type FloorId, type Room, type RoomId } from "./layout";

export const TILE_PX = 32;

type Pattern = "planks" | "carpet" | "checker" | "grid" | "rubber" | "mats" | "concrete" | "plain";

const PATTERN: Record<RoomId, Pattern> = {
  study: "planks",
  lounge: "carpet",
  kitchen: "checker",
  party: "checker",
  music: "carpet",
  arcade: "grid",
  gym: "rubber",
  boulder: "mats",
  bench: "concrete",
};

const NEUTRAL: [number, number] = [0xd8d2c6, 0xcfc8bb];

/** Is (x, y) of a 32x32 tile on the 32x16 top diamond? */
function onTop(x: number, y: number): boolean {
  if (y < 0 || y > 15) return false;
  const dx = x < 16 ? 15 - x : x - 16;
  return dx < 2 * (y < 8 ? y + 1 : 16 - y);
}

const cache = new Map<string, Texture>();

/** One tile texture per room theme and checker parity, shared by every tile that uses it. */
export function tileTexture(room: Room | null, parity: number): Texture {
  const pattern: Pattern = room ? PATTERN[room.id] : "plain";
  const colors = room ? room.floorColors : NEUTRAL;
  const key = `${room?.id ?? "neutral"}:${pattern === "checker" ? parity : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement("canvas");
  canvas.width = TILE_PX;
  canvas.height = TILE_PX;
  const ctx = canvas.getContext("2d")!;
  const base = pattern === "checker" ? colors[parity % 2] : colors[0];
  const alt = pattern === "checker" ? colors[(parity + 1) % 2] : colors[1];
  const noise = (x: number, y: number) => (hash(`${key}${x},${y}`) % 1000) / 1000;
  const px = (x: number, y: number, c: number) => {
    ctx.fillStyle = `#${c.toString(16).padStart(6, "0")}`;
    ctx.fillRect(x, y, 1, 1);
  };

  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 32; x++) {
      if (!onTop(x, y)) continue;
      // Iso coordinates along the tile's two edges (both non-negative, so % behaves).
      const u = Math.floor(x / 2 + y);
      const v = Math.floor(y - x / 2) + 16;
      const edge = !onTop(x - 1, y) || !onTop(x + 1, y) || !onTop(x, y - 1) || !onTop(x, y + 1);
      let c = base;
      switch (pattern) {
        case "planks":
          c = u % 4 === 0 ? shade(base, -0.18) : noise(x, y) < 0.12 ? shade(base, -0.07) : base;
          if (u % 4 !== 0 && (v + Math.floor(u / 4) * 5) % 11 === 0) c = shade(base, -0.12);
          break;
        case "carpet":
          c = noise(x, y) < 0.3 ? alt : noise(x, y) > 0.92 ? shade(base, 0.08) : base;
          break;
        case "checker":
          c = edge ? shade(base, -0.12) : noise(x, y) < 0.05 ? shade(base, 0.06) : base;
          break;
        case "grid":
          c = edge ? 0x4fe3ff : noise(x, y) < 0.08 ? alt : base;
          break;
        case "rubber":
          c = noise(x, y) < 0.1 ? shade(base, 0.22) : noise(x, y) > 0.95 ? shade(base, -0.2) : base;
          break;
        case "mats":
          c = u === 8 || v === 16 ? shade(base, -0.22) : noise(x, y) < 0.06 ? alt : base;
          break;
        case "concrete":
          c = noise(x, y) < 0.18 ? alt : noise(x, y) > 0.94 ? shade(base, -0.15) : base;
          break;
        default:
          c = edge ? shade(base, -0.06) : base;
      }
      px(x, y, c);
    }

  // Block sides: left face below the lower-left edge, right face below the lower-right edge.
  const side = shade(colors[0], -0.3);
  for (let x = 0; x < 32; x++) {
    const left = x < 16;
    const top = left ? 8 + Math.floor(x / 2) : 15 - Math.floor((x - 16) / 2);
    const face = left ? side : shade(side, -0.16);
    for (let y = top + 1; y < Math.min(32, top + 17); y++) px(x, y, y === top + 1 ? shade(face, 0.14) : face);
  }

  const texture = Texture.from(canvas);
  texture.source.scaleMode = "nearest";
  cache.set(key, texture);
  return texture;
}

/** The floor of one level as 32x32 tile sprites in painter's order (back rows first). */
export function buildTileLayer(floor: FloorId, rooms: Room[]): Container {
  const layer = new Container();
  const order: [number, number][] = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) order.push([x, y]);
  order.sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[0] - b[0]);
  for (const [x, y] of order) {
    const room = isPartitionWall(x, y) || x === 9 || x === 19 ? null : rooms.find((r) => x >= r.x0 && x <= r.x1) ?? null;
    const tile = new Sprite(tileTexture(room, (x + y) % 2));
    const c = tileToWorld(floor, x, y);
    tile.position.set(c.x - TILE_W / 2, c.y - TILE_H / 2);
    layer.addChild(tile);
  }
  layer.eventMode = "none";
  return layer;
}

function shade(c: number, amt: number): number {
  const ch = (s: number) => (c >> s) & 255;
  const f = (n: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? n * (1 + amt) : n + (255 - n) * amt)));
  return (f(ch(16)) << 16) | (f(ch(8)) << 8) | f(ch(0));
}
