// The floor tilemap: 32x32 pixel-art isometric block tiles (a 32x16 top face over 16px of block sides), drawn
// back to front so only the front edge shows its sides. The look follows the Paper "Warehouse · open floor"
// artboards: a soft light checker, tinted per zone, with pale stone sides.

import { Container, Sprite, Texture } from "pixi.js";
import { COLS, ROWS, TILE_H, TILE_W, tileToWorld, type FloorId, type Room } from "./layout";

export const TILE_PX = 32;

/** Between zones (the old partition lines) the floor is the plain warehouse checker. */
const BASE: [number, number] = [0xefebe4, 0xe7e2d9];

/** Is (x, y) of a 32x32 tile on the 32x16 top diamond? */
function onTop(x: number, y: number): boolean {
  if (y < 0 || y > 15) return false;
  const dx = x < 16 ? 15 - x : x - 16;
  return dx < 2 * (y < 8 ? y + 1 : 16 - y);
}

const cache = new Map<string, Texture>();

/** One texture per tint and checker parity, shared by every tile that uses it. */
export function tileTexture(colors: [number, number], parity: number): Texture {
  const key = `${colors.join(",")}:${parity % 2}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement("canvas");
  canvas.width = TILE_PX;
  canvas.height = TILE_PX;
  const ctx = canvas.getContext("2d")!;
  const px = (x: number, y: number, c: number) => {
    ctx.fillStyle = `#${c.toString(16).padStart(6, "0")}`;
    ctx.fillRect(x, y, 1, 1);
  };
  const face = colors[parity % 2];
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 32; x++) {
      if (!onTop(x, y)) continue;
      // A faint lower-edge seam keeps the checker readable without outlines.
      const seam = !onTop(x, y + 1) || !onTop(x + (x < 16 ? -1 : 1), y);
      px(x, y, seam ? shade(face, -0.035) : face);
    }

  // Block sides: left face below the lower-left edge, right face below the lower-right edge (pale stone).
  for (let x = 0; x < 32; x++) {
    const left = x < 16;
    const top = left ? 8 + Math.floor(x / 2) : 15 - Math.floor((x - 16) / 2);
    const side = left ? 0xd9d3c7 : 0xcbc4b6;
    for (let y = top + 1; y < Math.min(32, top + 17); y++) px(x, y, y === top + 1 ? shade(side, 0.25) : side);
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
    const room = rooms.find((r) => x >= r.x0 && x <= r.x1);
    const tile = new Sprite(tileTexture(room ? room.floorColors : BASE, (x + y) % 2));
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
