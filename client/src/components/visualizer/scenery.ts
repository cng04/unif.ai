// Static scenery for one floor: the 32x32 tilemap (tiles.ts), back walls, partitions and furniture (Pixi
// Graphics). Tall pieces go into the depth-sorted entity layer so agents can walk in front of and behind them.

import { Container, Graphics, Text } from "pixi.js";
import {
  ELEVATOR, ROOMS, ROWS, TILE_H, TILE_W, WALL_H, isPartitionWall, rng, tileToWorld,
  type FloorId, type Furniture, type Room,
} from "./layout";
import { buildTileLayer } from "./tiles";

type Pt = { x: number; y: number };
type Animator = (t: number) => void;

/** Depth key used by both furniture and agents: larger draws later (in front). */
export function depthOf(x: number, y: number): number {
  return (x + y) * 10;
}

const FLAT = new Set(["rug", "discofloor", "mat", "bench", "climbwall", "elevator"]);

export type FloorScene = { ground: Container; entities: Container; animators: Animator[] };

export function buildFloor(floor: FloorId): FloorScene {
  const ground = new Container();
  const entities = new Container({ sortableChildren: true });
  const animators: Animator[] = [];
  const rooms = ROOMS.filter((r) => r.floor === floor);

  const g = new Graphics();
  ground.addChild(g);
  drawWalls(g, floor, rooms);
  for (const room of rooms) drawWallDecor(g, ground, floor, room, animators);
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

  for (let y = 0; y < ROWS; y++)
    for (const x of [9, 19]) {
      if (!isPartitionWall(x, y)) continue;
      const wall = new Graphics();
      isoBox(wall, floor, x, y, 1, 1, 14, { top: 0xe9e4da, left: 0xb8b0a2, right: 0xcfc8bb });
      wall.zIndex = depthOf(x, y) + 4;
      entities.addChild(wall);
    }

  for (const room of rooms) ground.addChild(roomSign(floor, room));
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

/** A box over tiles [x, x+w) x [y, y+h), `z` px tall, optionally floating `lift` px off the floor. */
export function isoBox(g: Graphics, floor: FloorId, x: number, y: number, w: number, h: number, z: number, c: BoxColors, lift = 0) {
  const T = up(corner(floor, x - 0.5, y - 0.5), lift);
  const R = up(corner(floor, x + w - 0.5, y - 0.5), lift);
  const B = up(corner(floor, x + w - 0.5, y + h - 0.5), lift);
  const L = up(corner(floor, x - 0.5, y + h - 0.5), lift);
  g.poly(flat(L, B, up(B, z), up(L, z))).fill(c.left);
  g.poly(flat(B, R, up(R, z), up(B, z))).fill(c.right);
  g.poly(flat(up(T, z), up(R, z), up(B, z), up(L, z))).fill(c.top);
  return { T: up(T, z), R: up(R, z), B: up(B, z), L: up(L, z) };
}

function tilePoly(floor: FloorId, x: number, y: number, inset = 0): number[] {
  const i = inset;
  return flat(
    corner(floor, x - 0.5 + i, y - 0.5 + i),
    corner(floor, x + 0.5 - i, y - 0.5 + i),
    corner(floor, x + 0.5 - i, y + 0.5 - i),
    corner(floor, x - 0.5 + i, y + 0.5 - i),
  );
}

/** Point on the back (y = -0.5) wall above grid column u, v px up. */
function backWall(floor: FloorId, u: number, v: number): Pt {
  return up(corner(floor, u - 0.5, -0.5), v);
}

function backWallQuad(floor: FloorId, u0: number, u1: number, v0: number, v1: number): number[] {
  return flat(backWall(floor, u0, v0), backWall(floor, u1, v0), backWall(floor, u1, v1), backWall(floor, u0, v1));
}

// ---- floor and walls ----

function drawWalls(g: Graphics, floor: FloorId, rooms: Room[]) {
  for (const room of rooms) {
    g.poly(backWallQuad(floor, room.x0, room.x1 + 1, 0, WALL_H)).fill(room.wallColor);
    g.poly(backWallQuad(floor, room.x0, room.x1 + 1, WALL_H - 3, WALL_H)).fill(lighten(room.wallColor, 0.25));
    g.poly(backWallQuad(floor, room.x0, room.x1 + 1, 0, 3)).fill(darken(room.wallColor, 0.25));
  }
  for (const x of [9, 19]) g.poly(backWallQuad(floor, x, x + 1, 0, WALL_H)).fill(0xcfc8bb);
  // Left wall along x = -0.5.
  const left = rooms[0];
  const a = corner(floor, -0.5, ROWS - 0.5);
  const b = corner(floor, -0.5, -0.5);
  g.poly(flat(a, b, up(b, WALL_H), up(a, WALL_H))).fill(darken(left.wallColor, 0.12));
  g.poly(flat(up(a, WALL_H - 3), up(b, WALL_H - 3), up(b, WALL_H), up(a, WALL_H))).fill(lighten(left.wallColor, 0.2));
}

function drawWallDecor(g: Graphics, layer: Container, floor: FloorId, room: Room, animators: Animator[]) {
  const x0 = room.x0;
  const quad = (u0: number, u1: number, v0: number, v1: number, color: number, alpha = 1) =>
    g.poly(backWallQuad(floor, x0 + u0, x0 + u1, v0, v1)).fill({ color, alpha });
  switch (room.id) {
    case "lounge":
      quad(1.2, 2.8, 16, 36, 0xa8d6e0);
      quad(1.95, 2.05, 16, 36, 0xffffff);
      quad(5.6, 7.2, 20, 32, 0xe27a50);
      quad(5.8, 7.0, 22, 30, 0xe2b36c);
      break;
    case "kitchen":
      for (let u = 0; u < 4; u++) for (let v = 0; v < 3; v++) quad(u + 0.05, u + 0.95, 14 + v * 6, 19 + v * 6, (u + v) % 2 ? 0xf1ece0 : 0xd6e3e6);
      quad(5.3, 8.7, 30, 33, 0x6e4b2a);
      for (const u of [5.6, 6.4, 7.2, 8.0]) quad(u, u + 0.35, 33, 38, [0x8fbc8f, 0xe27a50, 0xe2b36c, 0xa8d6e0][Math.floor(u) % 4]);
      break;
    case "party": {
      const lights = new Graphics();
      const draw = (t: number) => {
        lights.clear();
        for (let i = 0; i < 9; i++) {
          const hue = [0xff4fd8, 0x4fe3ff, 0xfff04f, 0x7cff6b][(i + Math.floor(t * 3)) % 4];
          lights.poly(backWallQuad(floor, x0 + i + 0.3, x0 + i + 0.7, 34, 38)).fill(hue);
        }
      };
      draw(0);
      animators.push(draw);
      layer.addChild(lights);
      break;
    }
    case "study":
      quad(4.1, 4.9, 12, 34, 0xa8d6e0);
      quad(4.1, 4.9, 22, 23.5, 0xffffff);
      quad(0.3, 1.7, 30, 36, 0xf3f1ed);
      quad(7.3, 8.7, 30, 36, 0xf3f1ed);
      break;
    case "music":
      for (let u = 0; u < 9; u++) quad(u + 0.1, u + 0.9, 18, 36, u % 2 ? 0x3c3550 : 0x463e5d);
      break;
    case "arcade": {
      const strip = new Graphics();
      const draw = (t: number) => {
        strip.clear();
        strip.poly(backWallQuad(floor, x0, x0 + 9, 38, 40)).fill({ color: 0xff4fd8, alpha: 0.6 + 0.4 * Math.sin(t * 2) });
        strip.poly(backWallQuad(floor, x0, x0 + 9, 34, 35)).fill({ color: 0x4fe3ff, alpha: 0.6 + 0.4 * Math.cos(t * 2) });
      };
      draw(0);
      animators.push(draw);
      layer.addChild(strip);
      break;
    }
    case "gym":
      quad(3.6, 7.4, 14, 34, 0xc9d6dc);
      quad(3.7, 7.3, 15, 33, 0xe4edf0);
      break;
    case "boulder": {
      const r = rng(97);
      const colors = [0xe27a50, 0x4fa35a, 0xe2c34a, 0x8197cf, 0xd04f8a];
      for (let i = 0; i < 46; i++) {
        const u = r() * 9;
        if (u > 3.85 && u < 5.15) continue;
        const v = 6 + r() * (WALL_H - 10);
        const p = backWall(floor, x0 + u, v);
        g.circle(p.x, p.y, 1 + r() * 1.4).fill(colors[i % colors.length]);
      }
      break;
    }
    case "bench":
      quad(0, 9, 34, 36, 0x55595e);
      quad(0, 9, 28, 29, 0x55595e);
      quad(4.2, 4.8, 12, 30, 0x9fb3b8);
      break;
  }
  if (room.x0 === 10) {
    // Elevator doors on the middle room of every floor.
    const u = ELEVATOR.x;
    g.poly(backWallQuad(floor, u - 0.15, u + 1.15, 0, 34)).fill(0x5d6066);
    g.poly(backWallQuad(floor, u - 0.05, u + 0.47, 0, 31)).fill(0xb9bec4);
    g.poly(backWallQuad(floor, u + 0.53, u + 1.05, 0, 31)).fill(0xa9aeb4);
    g.poly(backWallQuad(floor, u + 0.3, u + 0.7, 35, 39)).fill(0xffd27a);
  }
}

function roomSign(floor: FloorId, room: Room): Text {
  const label = new Text({
    text: room.name.toUpperCase(),
    style: { fontFamily: "monospace", fontSize: 7, fill: 0xffffff, letterSpacing: 1, fontWeight: "700" },
    resolution: 4,
  });
  // Above the wall's top edge, so tall furniture against the wall never covers it.
  const p = backWall(floor, room.x0 + 4.5, WALL_H + 9);
  label.anchor.set(0.5, 1);
  label.position.set(p.x, p.y + 1);
  label.skew.set(0, -Math.atan(TILE_H / TILE_W));
  label.alpha = 0.92;
  return label;
}

// ---- furniture ----

/** Vertical strip on the front-left (+y) face of a footprint: `t` runs along the face, `z` up from the floor. */
function faceStrip(g: Graphics, floor: FloorId, it: Furniture, t0: number, t1: number, z0: number, z1: number, color: number) {
  const a = corner(floor, it.x - 0.5, it.y + it.h - 0.5);
  const b = corner(floor, it.x + it.w - 0.5, it.y + it.h - 0.5);
  const at = (t: number, z: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - z });
  g.poly(flat(at(t0, z0), at(t1, z0), at(t1, z1), at(t0, z1))).fill(color);
}

function drawFurniture(g: Graphics, layer: Container, floor: FloorId, it: Furniture, room: Room, animators: Animator[]) {
  const { x, y, w, h } = it;
  const box = (z: number, c: BoxColors, lift = 0, dx = 0, dy = 0, dw = w, dh = h) =>
    isoBox(g, floor, x + dx, y + dy, dw, dh, z, c, lift);
  const wood = { top: 0xb07a4a, left: 0x7d5332, right: 0x93633d };
  const dark = { top: 0x3b3f46, left: 0x24272c, right: 0x2e3238 };
  switch (it.kind) {
    case "rug":
      for (let ty = y; ty < y + h; ty++)
        for (let tx = x; tx < x + w; tx++) g.poly(tilePoly(floor, tx, ty)).fill((tx + ty) % 2 ? 0xc0573a : 0xb04d33);
      g.poly(tilePoly(floor, x + (w - 1) / 2, y + (h - 1) / 2, 0.15)).fill(0xe2b36c);
      break;
    case "discofloor": {
      const tiles = new Graphics();
      const draw = (t: number) => {
        tiles.clear();
        for (let ty = y; ty < y + h; ty++)
          for (let tx = x; tx < x + w; tx++) {
            const k = (tx * 7 + ty * 13 + Math.floor(t * 2.5)) % 5;
            tiles.poly(tilePoly(floor, tx, ty, 0.06)).fill({ color: [0xff4fd8, 0x4fe3ff, 0xfff04f, 0x7cff6b, 0x9b6bff][k], alpha: 0.55 });
          }
      };
      draw(0);
      animators.push(draw);
      layer.addChild(tiles);
      break;
    }
    case "mat":
      for (let tx = x; tx < x + w; tx++) g.poly(tilePoly(floor, tx, y, 0.02)).fill(tx % 2 ? 0x2f5d8c : 0x2a5380);
      break;
    case "climbwall":
      for (let tx = x; tx < x + w; tx++) g.poly(tilePoly(floor, tx, y, 0.02)).fill(0x2a5380);
      break;
    case "bench":
      box(7, wood);
      for (let i = 0; i < Math.max(w, h); i++) box(1, { top: 0x6e4b2a, left: 0x5a3c22, right: 0x5a3c22 }, 7, w > 1 ? i : 0, h > 1 ? i : 0, 1, 1);
      break;
    case "elevator":
      g.poly(tilePoly(floor, x, y, 0.08)).fill({ color: 0xffd27a, alpha: 0.35 });
      break;
    case "bookshelf": {
      box(34, wood);
      const r = rng(x * 31 + y);
      const books = w * 6;
      for (let row = 0; row < 4; row++) {
        faceStrip(g, floor, it, 0.04, 0.96, 3 + row * 8, 4 + row * 8, 0x5a3c22);
        for (let i = 0; i < books; i++) {
          if (r() < 0.15) continue;
          const t = 0.06 + (0.88 * i) / books;
          const color = [0xe27a50, 0x8197cf, 0xe2b36c, 0x8f8e70, 0xd9d0c0][Math.floor(r() * 5)];
          faceStrip(g, floor, it, t, t + 0.88 / books - 0.02, 4 + row * 8, 9 + row * 8 - r() * 2, color);
        }
      }
      break;
    }
    case "tv": {
      box(10, wood);
      const t = box(20, { top: 0x222222, left: 0x111111, right: 0x1a1a1a }, 10, 0.3, 0, w - 0.6, 0.3);
      const glow = new Graphics();
      const draw = (time: number) => {
        glow.clear();
        glow.poly(flat(t.L, up(t.L, -18), up(t.B, -18), t.B)).fill({ color: 0x6fb7d9, alpha: 0.6 + 0.25 * Math.sin(time * 3) });
      };
      draw(0);
      animators.push(draw);
      layer.addChild(glow);
      break;
    }
    case "plant":
      box(8, { top: 0xc0573a, left: 0x8e3f2a, right: 0xa44a31 }, 0, 0.25, 0.25, 0.5, 0.5);
      {
        const c = tileToWorld(floor, x, y);
        g.circle(c.x, c.y - 16, 7).fill(0x4f8a4a);
        g.circle(c.x - 4, c.y - 20, 5).fill(0x5fa15a);
        g.circle(c.x + 4, c.y - 22, 4).fill(0x6fb36a);
      }
      break;
    case "lamp": {
      const c = tileToWorld(floor, x, y);
      g.rect(c.x - 1, c.y - 26, 2, 26).fill(0x3b3f46);
      g.poly([c.x - 7, c.y - 26, c.x + 7, c.y - 26, c.x + 4, c.y - 34, c.x - 4, c.y - 34]).fill(0xf3d9a4);
      g.circle(c.x, c.y - 4, 12).fill({ color: 0xffe3a0, alpha: 0.12 });
      break;
    }
    case "couch":
      box(10, { top: 0x8197cf, left: 0x5f73a6, right: 0x6f84ba });
      box(10, { top: 0x93a8dc, left: 0x5f73a6, right: 0x6f84ba }, 10, 0, 0, w, 0.35);
      break;
    case "counter":
      box(18, { top: 0xe8e2d4, left: 0x9a8f7c, right: 0xb4a994 });
      break;
    case "stove": {
      box(18, { top: 0x5d6066, left: 0x3b3f46, right: 0x484c53 });
      for (let i = 0; i < w; i++) {
        const c = up(tileToWorld(floor, x + i, y), 18);
        g.ellipse(c.x - 4, c.y, 3, 1.5).fill(0x222222);
        g.ellipse(c.x + 4, c.y, 3, 1.5).fill(0x222222);
      }
      break;
    }
    case "fridge":
      box(38, { top: 0xf3f1ed, left: 0xc9c4ba, right: 0xdedad1 });
      {
        const c = tileToWorld(floor, x, y);
        g.rect(c.x - 9, c.y - 22, 8, 1).fill(0x9a958b);
      }
      break;
    case "bar":
      box(16, { top: 0x6e4b2a, left: 0x4a301b, right: 0x5a3c22 });
      box(2, { top: 0xc9a46a, left: 0x8a6d3e, right: 0x9e7f4b }, 16);
      for (let i = 0; i < w; i += 2) {
        const c = up(tileToWorld(floor, x + i, y), 18);
        g.rect(c.x - 1, c.y - 7, 2, 7).fill(0x4f8a4a);
        g.rect(c.x + 3, c.y - 5, 2, 5).fill(0xa63a2a);
      }
      break;
    case "dj": {
      box(16, dark);
      const top = box(3, { top: 0x15182c, left: 0x111111, right: 0x151515 }, 16);
      const leds = new Graphics();
      const draw = (t: number) => {
        leds.clear();
        for (let i = 0; i < 6; i++) {
          const p = { x: top.L.x + ((top.B.x - top.L.x) * (i + 0.5)) / 6, y: top.L.y + ((top.B.y - top.L.y) * (i + 0.5)) / 6 + 6 };
          leds.rect(p.x - 1, p.y - 1, 2, 2).fill(Math.sin(t * 6 + i) > 0 ? 0x7cff6b : 0xff4fd8);
        }
      };
      draw(0);
      animators.push(draw);
      layer.addChild(leds);
      break;
    }
    case "speaker": {
      const top = box(it.w > 1 ? 22 : 30, dark, 0, it.w > 1 ? 0.35 : 0.1, it.w > 1 ? 0.35 : 0.1, it.w > 1 ? 1.3 : 0.8, it.w > 1 ? 1.3 : 0.8);
      const c = { x: (top.L.x + top.B.x) / 2, y: (top.L.y + top.B.y) / 2 };
      g.circle(c.x, c.y + 8, 4).fill(0x5d6066);
      g.circle(c.x, c.y + 18, 2.5).fill(0x5d6066);
      break;
    }
    case "desk": {
      box(14, wood);
      for (let i = 0; i < w; i++) {
        const c = up(tileToWorld(floor, x + i, y), 14);
        g.poly([c.x - 5, c.y + 1, c.x + 3, c.y - 3, c.x + 3, c.y - 11, c.x - 5, c.y - 7]).fill(0x2e3238);
        g.poly([c.x - 4, c.y - 0.5, c.x + 2, c.y - 3.5, c.x + 2, c.y - 10, c.x - 4, c.y - 7]).fill(0x8fd0e8);
      }
      break;
    }
    case "bigtable":
      box(12, wood);
      {
        const c = up(tileToWorld(floor, x + 0.5, y + 0.5), 12);
        g.rect(c.x - 6, c.y - 3, 5, 3).fill(0x8197cf);
        g.rect(c.x + 2, c.y - 1, 5, 3).fill(0xe27a50);
        g.circle(c.x - 1, c.y + 3, 1.5).fill(0xf3f1ed);
      }
      break;
    case "table":
      box(12, room.id === "arcade" ? { top: 0x3c3550, left: 0x231f30, right: 0x2e293f } : wood);
      {
        const c = up(tileToWorld(floor, x + 0.5, y + 0.5), 12);
        if (room.id === "arcade") {
          g.rect(c.x - 6, c.y - 3, 12, 6).fill(0x2f7d4f);
          for (const [dx, dy, col] of [[-3, -1, 0xe2c34a], [2, 0, 0xe27a50], [0, 1, 0x8197cf]] as const) g.rect(c.x + dx, c.y + dy, 2, 2).fill(col);
        } else if (room.id === "kitchen") {
          g.ellipse(c.x - 4, c.y, 3, 1.6).fill(0xf3f1ed);
          g.ellipse(c.x + 4, c.y, 3, 1.6).fill(0xf3f1ed);
          g.rect(c.x - 1, c.y - 6, 2, 6).fill(0xa63a2a);
        } else {
          g.rect(c.x - 2, c.y - 4, 4, 4).fill(0xf3f1ed);
          g.circle(c.x + 5, c.y + 1, 2).fill(0x4f8a4a);
        }
      }
      break;
    case "amp":
      box(18, dark, 0, 0.15, 0.15, 0.7, 0.7);
      {
        const c = tileToWorld(floor, x, y);
        g.rect(c.x - 6, c.y - 14, 5, 8).fill(0x5d6066);
      }
      break;
    case "drums": {
      const c = tileToWorld(floor, x + 0.5, y);
      g.ellipse(c.x, c.y - 4, 9, 6).fill(0xa63a2a);
      g.ellipse(c.x, c.y - 8, 9, 4.5).fill(0xf3f1ed);
      g.ellipse(c.x - 11, c.y - 12, 5, 2.5).fill(0xe2c34a);
      g.rect(c.x - 11.5, c.y - 12, 1, 12).fill(0x9a958b);
      g.ellipse(c.x + 11, c.y - 10, 5, 2.5).fill(0xe2c34a);
      g.rect(c.x + 10.5, c.y - 10, 1, 10).fill(0x9a958b);
      break;
    }
    case "piano": {
      box(16, { top: 0x1d1b1a, left: 0x111111, right: 0x161616 });
      const top = box(2, { top: 0xf3f1ed, left: 0xc9c4ba, right: 0xdedad1 }, 16, 0, 0.55, w, 0.45);
      for (let i = 1; i < 12; i++) {
        const t = i / 12;
        const p = { x: top.L.x + (top.B.x - top.L.x) * t, y: top.L.y + (top.B.y - top.L.y) * t };
        g.rect(p.x, p.y - 3, 1, 2).fill(0x1d1b1a);
      }
      break;
    }
    case "arcade": {
      const hue = [0xff4fd8, 0x4fe3ff, 0xfff04f, 0x7cff6b][x % 4];
      box(40, { top: 0x2e293f, left: hue, right: darken(hue, 0.45) }, 0, 0.1, 0.2, 0.8, 0.6);
      const c = tileToWorld(floor, x, y);
      const screen = new Graphics();
      const draw = (t: number) => {
        screen.clear();
        screen.poly([c.x - 11, c.y - 22, c.x - 2, c.y - 17.5, c.x - 2, c.y - 29, c.x - 11, c.y - 33.5]).fill({ color: 0x111827, alpha: 1 });
        screen.poly([c.x - 10, c.y - 23, c.x - 3, c.y - 19.5, c.x - 3, c.y - 28, c.x - 10, c.y - 31.5]).fill({ color: hue, alpha: 0.45 + 0.35 * Math.abs(Math.sin(t * 2.2 + x)) });
      };
      draw(0);
      animators.push(draw);
      layer.addChild(screen);
      break;
    }
    case "treadmill":
      box(4, dark, 0, 0.05, 0.1, 0.9, 0.8);
      box(1, { top: 0x15171a, left: 0x111111, right: 0x111111 }, 4, 0.15, 0.2, 0.7, 0.6);
      {
        const c = tileToWorld(floor, x, y);
        g.rect(c.x - 1, c.y - 22, 2, 18).fill(0x9a958b);
        g.rect(c.x - 5, c.y - 24, 10, 3).fill(0x3b3f46);
      }
      break;
    case "rack": {
      box(3, dark);
      for (let i = 0; i < w; i++) {
        const c = tileToWorld(floor, x + i, y);
        for (const dy of [8, 16, 24]) {
          g.rect(c.x - 8, c.y - dy, 16, 1.5).fill(0x9a958b);
          g.circle(c.x - 7, c.y - dy, 3).fill(0x24272c);
          g.circle(c.x + 7, c.y - dy, 3).fill(0x24272c);
        }
      }
      break;
    }
    case "boulder": {
      box(26, { top: 0xc79a6a, left: 0x8e6a45, right: 0xa77d52 }, 0, 0.1, 0.1, 1.8, 1.8);
      const r = rng(x * 13 + y);
      for (let i = 0; i < 14; i++) {
        const c = tileToWorld(floor, x + r() * 1.6 - 0.1, y + 1.6);
        g.circle(c.x, c.y - 4 - r() * 18, 1.5).fill([0xe27a50, 0x4fa35a, 0xe2c34a, 0x8197cf][i % 4]);
      }
      break;
    }
    default:
      box(10, wood);
  }
}

function lighten(c: number, amt: number): number {
  return mix(c, 0xffffff, amt);
}
function darken(c: number, amt: number): number {
  return mix(c, 0x000000, amt);
}
function mix(a: number, b: number, t: number): number {
  const ch = (n: number, s: number) => (n >> s) & 255;
  const m = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s;
  return m(16) | m(8) | m(0);
}

