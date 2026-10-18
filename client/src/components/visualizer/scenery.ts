// Static scenery for one open floor: the 32x32 tilemap (tiles.ts), stone pillars and furniture as Pixi
// Graphics in the Paper "Warehouse · open floor" style (no walls, zones by tint and furniture, the design-system
// palette). Tall pieces go into the depth-sorted entity layer so agents walk in front of and behind them.

import { Container, Graphics } from "pixi.js";
import { PILLARS, ROOMS, rng, tileToWorld, type FloorId, type Furniture, type Room } from "./layout";
import { buildTileLayer } from "./tiles";

type Pt = { x: number; y: number };
type Animator = (t: number) => void;

/** Depth key used by both furniture and agents: larger draws later (in front). */
export function depthOf(x: number, y: number): number {
  return (x + y) * 10;
}

// Design-system colours (globals.css / Paper tokens), each with a top and two side shades.
const INK = { top: 0x34322d, left: 0x1f1d1a, right: 0x292723 };
const WOOD = { top: 0xc9a27a, left: 0x9a7552, right: 0xb08a63 };
const DARK_WOOD = { top: 0x7a5a3e, left: 0x553d29, right: 0x664a33 };
const PERI = { top: 0xaab7e3, left: 0x6d81b8, right: 0x8197cf };
const OCHRE = { top: 0xe8c48a, left: 0xb98c47, right: 0xd2a25a };
const LICHEN = { top: 0x9d9c80, left: 0x6f6e55, right: 0x828166 };
const STONE = { top: 0x9a958b, left: 0x4f4c47, right: 0x5f5b55 };
const CHALK = { top: 0xf7f5f0, left: 0xcfc8bb, right: 0xe2ddd3 };
const PALETTE = [0xe27a50, 0xe2b36c, 0xa8d6e0, 0x8197cf, 0x8f8e70];

const FLAT = new Set(["rug", "discofloor", "mat", "elevator"]);

export type FloorScene = { ground: Container; entities: Container; animators: Animator[] };

export function buildFloor(floor: FloorId): FloorScene {
  const ground = new Container();
  const entities = new Container({ sortableChildren: true });
  const animators: Animator[] = [];
  const rooms = ROOMS.filter((r) => r.floor === floor);

  ground.addChild(buildTileLayer(floor, rooms));
  for (const room of rooms)
    for (const it of room.furniture) {
      // Graphics can't hold children in Pixi v8, so animated parts sit beside the static drawing.
      const piece = new Container();
      const pg = new Graphics();
      piece.addChild(pg);
      drawFurniture(pg, piece, floor, it, room, animators);
      if (FLAT.has(it.kind)) ground.addChild(piece);
      else {
        piece.zIndex = depthOf(it.x + it.w - 1, it.y + it.h - 1) + 4;
        entities.addChild(piece);
      }
    }

  for (const p of PILLARS[floor]) {
    const g = new Graphics();
    isoBox(g, floor, p.x, p.y, 1, 1, 64, STONE, 0, 0.22);
    isoBox(g, floor, p.x, p.y, 1, 1, 4, { top: 0xb5b0a6, left: 0x6e6a61, right: 0x8c887e }, 64, 0.14);
    g.zIndex = depthOf(p.x, p.y) + 4;
    entities.addChild(g);
  }
  return { ground, entities, animators };
}

// ---- geometry ----

function corner(floor: FloorId, gx: number, gy: number): Pt {
  return tileToWorld(floor, gx, gy);
}

function up(p: Pt, z: number): Pt {
  return { x: p.x, y: p.y - z };
}

function flat(...pts: Pt[]): number[] {
  return pts.flatMap((p) => [p.x, p.y]);
}

type BoxColors = { top: number; left: number; right: number };

/** A box over tiles [x, x+w) x [y, y+h), inset by `inset` tiles, `z` px tall, floating `lift` px up. */
export function isoBox(
  g: Graphics, floor: FloorId, x: number, y: number, w: number, h: number, z: number, c: BoxColors, lift = 0, inset = 0,
) {
  const T = up(corner(floor, x - 0.5 + inset, y - 0.5 + inset), lift);
  const R = up(corner(floor, x + w - 0.5 - inset, y - 0.5 + inset), lift);
  const B = up(corner(floor, x + w - 0.5 - inset, y + h - 0.5 - inset), lift);
  const L = up(corner(floor, x - 0.5 + inset, y + h - 0.5 - inset), lift);
  g.poly(flat(L, B, up(B, z), up(L, z))).fill(c.left);
  g.poly(flat(B, R, up(R, z), up(B, z))).fill(c.right);
  g.poly(flat(up(T, z), up(R, z), up(B, z), up(L, z))).fill(c.top);
  return { T: up(T, z), R: up(R, z), B: up(B, z), L: up(L, z) };
}

function tilePoly(floor: FloorId, x: number, y: number, w = 1, h = 1, inset = 0): number[] {
  const i = inset;
  return flat(
    corner(floor, x - 0.5 + i, y - 0.5 + i),
    corner(floor, x + w - 0.5 - i, y - 0.5 + i),
    corner(floor, x + w - 0.5 - i, y + h - 0.5 - i),
    corner(floor, x - 0.5 + i, y + h - 0.5 - i),
  );
}

/** A point on the front-left (+y) face of a footprint: `t` along the face (0-1), `z` px up from the floor. */
function onFace(floor: FloorId, it: Furniture, t: number, z: number): Pt {
  const a = corner(floor, it.x - 0.5, it.y + it.h - 0.5);
  const b = corner(floor, it.x + it.w - 0.5, it.y + it.h - 0.5);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - z };
}

function faceStrip(g: Graphics, floor: FloorId, it: Furniture, t0: number, t1: number, z0: number, z1: number, color: number) {
  g.poly(flat(onFace(floor, it, t0, z0), onFace(floor, it, t1, z0), onFace(floor, it, t1, z1), onFace(floor, it, t0, z1))).fill(color);
}

// ---- furniture ----

function drawFurniture(g: Graphics, layer: Container, floor: FloorId, it: Furniture, room: Room, animators: Animator[]) {
  const { x, y, w, h } = it;
  const box = (z: number, c: BoxColors, lift = 0, dx = 0, dy = 0, dw = w, dh = h) =>
    isoBox(g, floor, x + dx, y + dy, dw, dh, z, c, lift);
  const center = (ox = (w - 1) / 2, oy = (h - 1) / 2, z = 0) => up(tileToWorld(floor, x + ox, y + oy), z);

  switch (it.kind) {
    case "rug": {
      const fill = room.id === "music" ? 0xe2b36c : 0x8f8e70;
      g.poly(tilePoly(floor, x, y, w, h, 0.04)).fill(fill);
      g.poly(tilePoly(floor, x, y, w, h, 0.2)).stroke({ color: 0xf3f1ed, width: 1, alpha: 0.7 });
      break;
    }
    case "discofloor": {
      g.poly(tilePoly(floor, x, y, w, h, 0)).fill(0x8197cf);
      g.poly(tilePoly(floor, x, y, w, h, 0.12)).fill(0xdfe3f1);
      const tiles = new Graphics();
      const draw = (t: number) => {
        tiles.clear();
        for (let ty = y; ty < y + h; ty++)
          for (let tx = x; tx < x + w; tx++) {
            const k = (tx * 7 + ty * 13 + Math.floor(t * 1.2)) % 4;
            tiles.poly(tilePoly(floor, tx, ty, 1, 1, 0.14)).fill(PALETTE[k]);
          }
      };
      draw(0);
      animators.push(draw);
      layer.addChild(tiles);
      break;
    }
    case "mat":
      if (room.id === "boulder")
        for (let ty = y; ty < y + h; ty++)
          for (let tx = x; tx < x + w; tx++) g.poly(tilePoly(floor, tx, ty, 1, 1, 0.03)).fill((tx + ty) % 2 ? 0x6f7088 : 0x66677e);
      else {
        g.poly(tilePoly(floor, x, y, w, h, 0.05)).fill(0x3b3f46);
        g.poly(tilePoly(floor, x, y, w, h, 0.3)).fill(0x4a4f57);
      }
      break;
    case "elevator":
      g.poly(tilePoly(floor, x, y, 1, 1, 0.1)).fill({ color: 0xa8d6e0, alpha: 0.8 });
      g.poly(tilePoly(floor, x, y, 1, 1, 0.3)).stroke({ color: 0xffffff, width: 1, alpha: 0.8 });
      break;
    case "bench":
      for (let i = 0; i < Math.max(w, h); i++) box(7, OCHRE, 0, w > 1 ? i + 0.08 : 0.08, h > 1 ? i + 0.08 : 0.08, 0.84, 0.84);
      break;
    case "bookshelf": {
      box(34, DARK_WOOD);
      const r = rng(x * 31 + y);
      const books = w * 6;
      for (let row = 0; row < 4; row++)
        for (let i = 0; i < books; i++) {
          if (r() < 0.15) continue;
          const t = 0.06 + (0.88 * i) / books;
          faceStrip(g, floor, it, t, t + 0.88 / books - 0.02, 4 + row * 8, 9 + row * 8 - r() * 2, PALETTE[Math.floor(r() * PALETTE.length)]);
        }
      break;
    }
    case "tv": {
      box(10, WOOD);
      const t = box(18, INK, 10, 0.3, 0, w - 0.6, 0.3);
      const glow = new Graphics();
      const draw = (time: number) => {
        glow.clear();
        glow.poly(flat(t.L, up(t.L, -15), up(t.B, -15), t.B)).fill({ color: 0xa8d6e0, alpha: 0.75 + 0.2 * Math.sin(time * 2) });
      };
      draw(0);
      animators.push(draw);
      layer.addChild(glow);
      break;
    }
    case "plant": {
      box(7, DARK_WOOD, 0, 0.3, 0.3, 0.4, 0.4);
      const c = center(0, 0, 0);
      g.circle(c.x, c.y - 15, 7).fill(0x8f8e70);
      g.circle(c.x - 2, c.y - 17, 3).fill(0xa5a488);
      break;
    }
    case "lamp": {
      const c = center(0, 0, 0);
      g.rect(c.x - 1, c.y - 26, 2, 26).fill(0x34322d);
      g.poly([c.x - 7, c.y - 26, c.x + 7, c.y - 26, c.x + 4, c.y - 34, c.x - 4, c.y - 34]).fill(0xe2b36c);
      break;
    }
    case "couch":
      box(8, PERI);
      box(9, PERI, 8, 0, 0, w, 0.35);
      break;
    case "counter":
      box(18, CHALK);
      break;
    case "stove": {
      box(18, INK);
      for (let i = 0; i < w; i++) {
        const c = up(tileToWorld(floor, x + i, y), 18);
        g.ellipse(c.x - 4, c.y, 3, 1.5).fill(0x6e6a61);
        g.ellipse(c.x + 4, c.y, 3, 1.5).fill(0x6e6a61);
      }
      break;
    }
    case "fridge":
      box(38, CHALK);
      faceStrip(g, floor, it, 0.1, 0.9, 22, 23, 0xb9b3a7);
      break;
    case "bar":
      box(16, WOOD);
      box(2, DARK_WOOD, 16);
      for (let i = 0; i < w; i += 2) {
        const c = up(tileToWorld(floor, x + i, y), 18);
        g.rect(c.x - 1, c.y - 7, 2, 7).fill(0x8f8e70);
        g.rect(c.x + 3, c.y - 5, 2, 5).fill(0xe27a50);
      }
      break;
    case "dj": {
      box(16, INK);
      const top = box(2, { top: 0x26241f, left: 0x1a1916, right: 0x1f1d1a }, 16);
      const leds = new Graphics();
      const draw = (t: number) => {
        leds.clear();
        for (let i = 0; i < 6; i++) {
          const p = { x: top.L.x + ((top.B.x - top.L.x) * (i + 0.5)) / 6, y: top.L.y + ((top.B.y - top.L.y) * (i + 0.5)) / 6 + 6 };
          leds.rect(p.x - 1, p.y - 1, 2, 2).fill(Math.sin(t * 5 + i) > 0 ? 0xe2b36c : 0xe27a50);
        }
      };
      draw(0);
      animators.push(draw);
      layer.addChild(leds);
      break;
    }
    case "speaker": {
      const big = w > 1;
      const top = box(big ? 22 : 30, INK, 0, big ? 0.35 : 0.1, big ? 0.35 : 0.1, big ? 1.3 : 0.8, big ? 1.3 : 0.8);
      const c = { x: (top.L.x + top.B.x) / 2, y: (top.L.y + top.B.y) / 2 };
      g.circle(c.x, c.y + 8, 4).fill(0x6e6a61);
      g.circle(c.x, c.y + 18, 2.5).fill(0x6e6a61);
      break;
    }
    case "desk":
      box(14, WOOD);
      for (let i = 0; i < w; i++) {
        const c = up(tileToWorld(floor, x + i, y), 14);
        g.poly([c.x - 5, c.y + 1, c.x + 3, c.y - 3, c.x + 3, c.y - 11, c.x - 5, c.y - 7]).fill(0x26241f);
        g.poly([c.x - 4, c.y - 0.5, c.x + 2, c.y - 3.5, c.x + 2, c.y - 10, c.x - 4, c.y - 7]).fill(0xa8d6e0);
      }
      break;
    case "bigtable": {
      box(12, WOOD);
      const c = center(0.5, 0.5, 12);
      g.rect(c.x - 6, c.y - 3, 5, 3).fill(0x8197cf);
      g.rect(c.x + 2, c.y - 1, 5, 3).fill(0xe27a50);
      break;
    }
    case "table": {
      const arcade = room.id === "arcade";
      box(12, arcade ? INK : WOOD);
      const c = center(0.5, 0.5, 12);
      if (arcade) {
        g.rect(c.x - 6, c.y - 3, 12, 6).fill(0x8f8e70);
        for (const [dx, dy, col] of [[-3, -1, 0xe2b36c], [2, 0, 0xe27a50], [0, 1, 0x8197cf]] as const) g.rect(c.x + dx, c.y + dy, 2, 2).fill(col);
      } else if (room.id === "kitchen") {
        g.ellipse(c.x - 4, c.y, 3, 1.6).fill(0xf7f5f0);
        g.ellipse(c.x + 4, c.y, 3, 1.6).fill(0xf7f5f0);
        g.rect(c.x - 1, c.y - 6, 2, 6).fill(0xe27a50);
      } else {
        g.rect(c.x - 2, c.y - 4, 4, 4).fill(0xf7f5f0);
        g.circle(c.x + 5, c.y + 1, 2).fill(0x8f8e70);
      }
      break;
    }
    case "amp": {
      box(18, INK, 0, 0.15, 0.15, 0.7, 0.7);
      const c = center(0, 0, 0);
      g.rect(c.x - 6, c.y - 14, 5, 8).fill(0x6e6a61);
      break;
    }
    case "drums": {
      const c = center(0.5, 0, 0);
      g.ellipse(c.x, c.y - 4, 9, 6).fill(0xe27a50);
      g.ellipse(c.x, c.y - 8, 9, 4.5).fill(0xf7f5f0);
      g.ellipse(c.x - 11, c.y - 12, 5, 2.5).fill(0xe2b36c);
      g.rect(c.x - 11.5, c.y - 12, 1, 12).fill(0x9a958b);
      g.ellipse(c.x + 11, c.y - 10, 5, 2.5).fill(0xe2b36c);
      g.rect(c.x + 10.5, c.y - 10, 1, 10).fill(0x9a958b);
      break;
    }
    case "piano": {
      box(16, INK);
      const top = box(2, CHALK, 16, 0, 0.55, w, 0.45);
      for (let i = 1; i < 12; i++) {
        const t = i / 12;
        g.rect(top.L.x + (top.B.x - top.L.x) * t, top.L.y + (top.B.y - top.L.y) * t - 3, 1, 2).fill(0x26241f);
      }
      break;
    }
    case "arcade": {
      box(40, INK, 0, 0.1, 0.2, 0.8, 0.6);
      const c = center(0, 0, 0);
      const screen = new Graphics();
      const draw = (t: number) => {
        screen.clear();
        screen.poly([c.x - 10, c.y - 23, c.x - 3, c.y - 19.5, c.x - 3, c.y - 28, c.x - 10, c.y - 31.5]).fill({
          color: 0xa8d6e0, alpha: 0.6 + 0.35 * Math.abs(Math.sin(t * 1.6 + x)),
        });
      };
      draw(0);
      animators.push(draw);
      layer.addChild(screen);
      break;
    }
    case "treadmill": {
      box(4, INK, 0, 0.05, 0.1, 0.9, 0.8);
      box(1, { top: 0x6e6a61, left: 0x4f4c47, right: 0x5f5b55 }, 4, 0.15, 0.2, 0.7, 0.6);
      const c = center(0, 0, 0);
      g.rect(c.x - 1, c.y - 22, 2, 18).fill(0x6e6a61);
      g.rect(c.x - 5, c.y - 24, 10, 3).fill(0x34322d);
      break;
    }
    case "rack":
      box(3, DARK_WOOD);
      for (let i = 0; i < w; i++) {
        const c = tileToWorld(floor, x + i, y);
        for (const dy of [8, 16, 24]) {
          g.rect(c.x - 8, c.y - dy, 16, 1.5).fill(0x9a958b);
          g.circle(c.x - 7, c.y - dy, 3).fill(0x26241f);
          g.circle(c.x + 7, c.y - dy, 3).fill(0x26241f);
        }
      }
      break;
    case "climbwall": {
      box(46, LICHEN, 0, 0, 0.3, w, 0.7);
      const r = rng(x * 17 + 3);
      const face = { ...it, y: it.y, h: it.h };
      for (let i = 0; i < w * 9; i++) {
        const p = onFace(floor, face, 0.04 + r() * 0.92, 4 + r() * 38);
        g.circle(p.x, p.y, 1.4 + r()).fill(i % 6 === 5 ? 0xf7f5f0 : PALETTE[i % 4]);
      }
      break;
    }
    case "boulder": {
      box(26, LICHEN, 0, 0.1, 0.1, 1.8, 1.8);
      const r = rng(x * 13 + y);
      for (let i = 0; i < 14; i++) {
        const c = tileToWorld(floor, x + r() * 1.6 - 0.1, y + 1.6);
        g.circle(c.x, c.y - 4 - r() * 18, 1.5).fill(PALETTE[i % 4]);
      }
      break;
    }
    default:
      box(10, WOOD);
  }
}
