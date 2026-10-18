// Static scenery for the single-floor World: the 32x32 tilemap (tiles.ts), zone furniture and landscape as Pixi
// Graphics in the design-system palette (the warehouse-floor look from Paper, now one open campus). Tall pieces
// go into the depth-sorted entity layer so agents walk in front of and behind them.

import { Container, Graphics, Text } from "pixi.js";
import { depthOf, rng, tileToScreen, type Furniture } from "./world/geometry";
import type { WorldPlan } from "./world/plan";
import { buildTileLayer } from "./tiles";

type Pt = { x: number; y: number };
type Animator = (t: number) => void;

// Design-system colours (globals.css / Paper tokens), each with a top and two side shades.
const INK = { top: 0x34322d, left: 0x1f1d1a, right: 0x292723 };
const WOOD = { top: 0xc9a27a, left: 0x9a7552, right: 0xb08a63 };
const DARK_WOOD = { top: 0x7a5a3e, left: 0x553d29, right: 0x664a33 };
const PERI = { top: 0xaab7e3, left: 0x6d81b8, right: 0x8197cf };
const OCHRE = { top: 0xe8c48a, left: 0xb98c47, right: 0xd2a25a };
const LICHEN = { top: 0x9d9c80, left: 0x6f6e55, right: 0x828166 };
const PALE_STONE = { top: 0xd9d3c7, left: 0xb3ab9c, right: 0xc4bdaf };
const CHALK = { top: 0xf7f5f0, left: 0xcfc8bb, right: 0xe2ddd3 };
const PALETTE = [0xe27a50, 0xe2b36c, 0xa8d6e0, 0x8197cf, 0x8f8e70];

const FLAT = new Set(["rug", "discofloor", "mat", "flowers"]);

export type Scene = { ground: Container; entities: Container; labels: Container; animators: Animator[] };

export function buildScene(plan: WorldPlan): Scene {
  const ground = new Container();
  const entities = new Container({ sortableChildren: true });
  const labels = new Container();
  const animators: Animator[] = [];
  const themeOf = new Map(plan.zones.map((z) => [z.id, z.structure?.presets[0].id ?? z.kind]));

  // ~4,000 static tile sprites: draw them once into a texture instead of every frame.
  const tiles = buildTileLayer(plan);
  ground.addChild(tiles);
  tiles.cacheAsTexture({ resolution: 1, antialias: false });
  for (const it of plan.furniture) {
    // Graphics can't hold children in Pixi v8, so animated parts sit beside the static drawing.
    const piece = new Container();
    const pg = new Graphics();
    piece.addChild(pg);
    drawFurniture(pg, piece, it, it.zone ? (themeOf.get(it.zone) ?? "") : "", animators);
    if (FLAT.has(it.kind)) ground.addChild(piece);
    else {
      piece.zIndex = depthOf(it.x + it.w - 1, it.y + it.h - 1) + 4;
      entities.addChild(piece);
    }
  }

  // Zone names float above the back corner of each zone, like the Paper floor captions.
  for (const z of plan.zones) {
    const label = new Text({
      text: z.name.toUpperCase(),
      style: { fontFamily: "monospace", fontSize: 8, fill: 0x26241f, letterSpacing: 1.6, fontWeight: "700" },
      resolution: 4,
    });
    const p = tileToScreen(z.x + z.w / 2 - 0.5, z.y - 0.5);
    label.anchor.set(0.5, 1);
    label.position.set(p.x, p.y - 4);
    label.alpha = 0.55;
    labels.addChild(label);
  }
  return { ground, entities, labels, animators };
}

// ---- geometry ----

function corner(gx: number, gy: number): Pt {
  return tileToScreen(gx, gy);
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
  g: Graphics, x: number, y: number, w: number, h: number, z: number, c: BoxColors, lift = 0, inset = 0,
) {
  const T = up(corner(x - 0.5 + inset, y - 0.5 + inset), lift);
  const R = up(corner(x + w - 0.5 - inset, y - 0.5 + inset), lift);
  const B = up(corner(x + w - 0.5 - inset, y + h - 0.5 - inset), lift);
  const L = up(corner(x - 0.5 + inset, y + h - 0.5 - inset), lift);
  g.poly(flat(L, B, up(B, z), up(L, z))).fill(c.left);
  g.poly(flat(B, R, up(R, z), up(B, z))).fill(c.right);
  g.poly(flat(up(T, z), up(R, z), up(B, z), up(L, z))).fill(c.top);
  return { T: up(T, z), R: up(R, z), B: up(B, z), L: up(L, z) };
}

function tilePoly(x: number, y: number, w = 1, h = 1, inset = 0): number[] {
  const i = inset;
  return flat(
    corner(x - 0.5 + i, y - 0.5 + i),
    corner(x + w - 0.5 - i, y - 0.5 + i),
    corner(x + w - 0.5 - i, y + h - 0.5 - i),
    corner(x - 0.5 + i, y + h - 0.5 - i),
  );
}

/** A point on the front-left (+y) face of a footprint: `t` along the face (0-1), `z` px up from the floor. */
function onFace(it: Furniture, t: number, z: number): Pt {
  const a = corner(it.x - 0.5, it.y + it.h - 0.5);
  const b = corner(it.x + it.w - 0.5, it.y + it.h - 0.5);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - z };
}

function faceStrip(g: Graphics, it: Furniture, t0: number, t1: number, z0: number, z1: number, color: number) {
  g.poly(flat(onFace(it, t0, z0), onFace(it, t1, z0), onFace(it, t1, z1), onFace(it, t0, z1))).fill(color);
}

// ---- furniture ----

function drawFurniture(g: Graphics, layer: Container, it: Furniture, theme: string, animators: Animator[]) {
  const { x, y, w, h } = it;
  const box = (z: number, c: BoxColors, lift = 0, dx = 0, dy = 0, dw = w, dh = h) =>
    isoBox(g, x + dx, y + dy, dw, dh, z, c, lift);
  const center = (ox = (w - 1) / 2, oy = (h - 1) / 2, z = 0) => up(tileToScreen(x + ox, y + oy), z);

  switch (it.kind) {
    case "rug": {
      const fill = theme === "music" ? 0xe2b36c : 0x8f8e70;
      g.poly(tilePoly(x, y, w, h, 0.04)).fill(fill);
      g.poly(tilePoly(x, y, w, h, 0.2)).stroke({ color: 0xf3f1ed, width: 1, alpha: 0.7 });
      break;
    }
    case "discofloor": {
      g.poly(tilePoly(x, y, w, h, 0)).fill(0x8197cf);
      g.poly(tilePoly(x, y, w, h, 0.12)).fill(0xdfe3f1);
      const tiles = new Graphics();
      const draw = (t: number) => {
        tiles.clear();
        for (let ty = y; ty < y + h; ty++)
          for (let tx = x; tx < x + w; tx++) {
            const k = (tx * 7 + ty * 13 + Math.floor(t * 1.2)) % 4;
            tiles.poly(tilePoly(tx, ty, 1, 1, 0.14)).fill(PALETTE[k]);
          }
      };
      draw(0);
      animators.push(draw);
      layer.addChild(tiles);
      break;
    }
    case "mat":
      if (theme === "climbing")
        for (let ty = y; ty < y + h; ty++)
          for (let tx = x; tx < x + w; tx++) g.poly(tilePoly(tx, ty, 1, 1, 0.03)).fill((tx + ty) % 2 ? 0x6f7088 : 0x66677e);
      else {
        g.poly(tilePoly(x, y, w, h, 0.05)).fill(0x3b3f46);
        g.poly(tilePoly(x, y, w, h, 0.3)).fill(0x4a4f57);
      }
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
          faceStrip(g, it, t, t + 0.88 / books - 0.02, 4 + row * 8, 9 + row * 8 - r() * 2, PALETTE[Math.floor(r() * PALETTE.length)]);
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
        const c = up(tileToScreen(x + i, y), 18);
        g.ellipse(c.x - 4, c.y, 3, 1.5).fill(0x6e6a61);
        g.ellipse(c.x + 4, c.y, 3, 1.5).fill(0x6e6a61);
      }
      break;
    }
    case "fridge":
      box(38, CHALK);
      faceStrip(g, it, 0.1, 0.9, 22, 23, 0xb9b3a7);
      break;
    case "bar":
      box(16, WOOD);
      box(2, DARK_WOOD, 16);
      for (let i = 0; i < w; i += 2) {
        const c = up(tileToScreen(x + i, y), 18);
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
        const c = up(tileToScreen(x + i, y), 14);
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
      const arcade = theme === "arcade";
      box(12, arcade ? INK : WOOD);
      const c = center(0.5, 0.5, 12);
      if (arcade) {
        g.rect(c.x - 6, c.y - 3, 12, 6).fill(0x8f8e70);
        for (const [dx, dy, col] of [[-3, -1, 0xe2b36c], [2, 0, 0xe27a50], [0, 1, 0x8197cf]] as const) g.rect(c.x + dx, c.y + dy, 2, 2).fill(col);
      } else if (theme === "cafe") {
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
        const c = tileToScreen(x + i, y);
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
        const p = onFace(face, 0.04 + r() * 0.92, 4 + r() * 38);
        g.circle(p.x, p.y, 1.4 + r()).fill(i % 6 === 5 ? 0xf7f5f0 : PALETTE[i % 4]);
      }
      break;
    }
    case "boulder": {
      box(26, LICHEN, 0, 0.1, 0.1, 1.8, 1.8);
      const r = rng(x * 13 + y);
      for (let i = 0; i < 14; i++) {
        const c = tileToScreen(x + r() * 1.6 - 0.1, y + 1.6);
        g.circle(c.x, c.y - 4 - r() * 18, 1.5).fill(PALETTE[i % 4]);
      }
      break;
    }
    case "workbench": {
      box(14, WOOD);
      for (let i = 0; i < w; i++) {
        const c = up(tileToScreen(x + i, y), 14);
        if (theme === "science") {
          g.rect(c.x - 5, c.y - 7, 3, 7).fill(0xa8d6e0);
          g.rect(c.x + 1, c.y - 5, 3, 5).fill(0xe27a50);
          g.circle(c.x - 3.5, c.y - 8, 1.5).fill(0xf7f5f0);
        } else {
          g.rect(c.x - 6, c.y - 2, 7, 2).fill(0x6e6a61);
          g.rect(c.x + 2, c.y - 6, 2, 6).fill(0xe2b36c);
        }
      }
      break;
    }
    case "easel": {
      const c = center(0, 0, 0);
      g.poly([c.x - 6, c.y, c.x - 1, c.y - 26, c.x, c.y - 26, c.x - 4, c.y]).fill(0x9a7552);
      g.poly([c.x + 6, c.y, c.x + 1, c.y - 26, c.x, c.y - 26, c.x + 4, c.y]).fill(0x9a7552);
      g.rect(c.x - 7, c.y - 26, 14, 12).fill(0xf7f5f0);
      g.rect(c.x - 5, c.y - 24, 6, 5).fill(PALETTE[(x + y) % PALETTE.length]);
      g.rect(c.x + 1, c.y - 20, 4, 4).fill(PALETTE[(x + y + 2) % PALETTE.length]);
      break;
    }
    case "planter": {
      box(8, DARK_WOOD, 0, 0.08, 0.08, w - 0.16, h - 0.16);
      for (let i = 0; i < w * 3; i++) {
        const c = up(tileToScreen(x + (i + 0.5) / 3 - 0.5, y + (h - 1) / 2), 8);
        g.circle(c.x, c.y - 3, 3.2).fill(i % 2 ? 0x8f8e70 : 0x9fae78);
      }
      break;
    }
    case "pen": {
      const corners = [corner(x - 0.5, y - 0.5), corner(x + w - 0.5, y - 0.5), corner(x + w - 0.5, y + h - 0.5), corner(x - 0.5, y + h - 0.5)];
      g.poly(flat(...corners)).fill({ color: 0x9fae78, alpha: 0.6 });
      for (let i = 0; i < 4; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % 4];
        g.poly(flat(up(a, 7), up(b, 7), up(b, 8.5), up(a, 8.5))).fill(0x9a7552);
        g.poly(flat(up(a, 3), up(b, 3), up(b, 4.5), up(a, 4.5))).fill(0x9a7552);
        g.rect(a.x - 1, a.y - 10, 2, 10).fill(0x7a5a3e);
      }
      const a1 = up(tileToScreen(x + 0.6, y + 0.6), 0);
      const a2 = up(tileToScreen(x + w - 1.2, y + h - 1), 0);
      g.ellipse(a1.x, a1.y - 4, 5, 3.5).fill(0xf7f5f0);
      g.circle(a1.x + 4, a1.y - 7, 2.5).fill(0xf7f5f0);
      g.ellipse(a2.x, a2.y - 3, 4, 3).fill(0xe2b36c);
      g.circle(a2.x - 3, a2.y - 6, 2).fill(0xe2b36c);
      break;
    }
    case "tent": {
      const L = corner(x - 0.5, y + h - 0.5);
      const B = corner(x + w - 0.5, y + h - 0.5);
      const R = corner(x + w - 0.5, y - 0.5);
      const T = corner(x - 0.5, y - 0.5);
      const ridgeA = up({ x: (L.x + T.x) / 2, y: (L.y + T.y) / 2 }, 26);
      const ridgeB = up({ x: (B.x + R.x) / 2, y: (B.y + R.y) / 2 }, 26);
      g.poly(flat(L, B, ridgeB, ridgeA)).fill(0xe27a50);
      g.poly(flat(B, R, ridgeB)).fill(0xc2582f);
      g.poly(flat(T, R, ridgeB, ridgeA)).fill(0xd06a42);
      const door = { x: (L.x + B.x) / 2, y: (L.y + B.y) / 2 };
      g.poly([door.x - 4, door.y, door.x + 4, door.y, door.x, door.y - 14]).fill(0x26241f);
      break;
    }
    case "telescope": {
      const c = center(0, 0, 0);
      g.poly([c.x - 6, c.y, c.x - 1, c.y - 16, c.x, c.y - 16, c.x - 4, c.y]).fill(0x4f4c47);
      g.poly([c.x + 6, c.y, c.x + 1, c.y - 16, c.x, c.y - 16, c.x + 4, c.y]).fill(0x4f4c47);
      g.poly([c.x - 8, c.y - 14, c.x + 8, c.y - 24, c.x + 9, c.y - 21, c.x - 7, c.y - 11]).fill(0x8197cf);
      break;
    }
    case "tree": {
      const c = center(0, 0, 0);
      g.ellipse(c.x, c.y, 9, 4).fill({ color: 0x000000, alpha: 0.08 });
      g.rect(c.x - 1.5, c.y - 14, 3, 14).fill(0x7a5a3e);
      const shade = (x * 31 + y * 17) % 3;
      const greens = [[0x7f8f5c, 0x93a26c], [0x8f8e70, 0xa5a488], [0x6f8a63, 0x86a079]][shade];
      g.circle(c.x, c.y - 22, 10).fill(greens[0]);
      g.circle(c.x - 5, c.y - 18, 7).fill(greens[0]);
      g.circle(c.x + 4, c.y - 27, 6).fill(greens[1]);
      g.circle(c.x - 3, c.y - 25, 4).fill(greens[1]);
      break;
    }
    case "bush": {
      const c = center(0, 0, 0);
      g.circle(c.x - 4, c.y - 5, 5).fill(0x7f8f5c);
      g.circle(c.x + 3, c.y - 6, 6).fill(0x8f9e68);
      g.circle(c.x, c.y - 9, 4).fill(0x9fae78);
      break;
    }
    case "flowers": {
      const r = rng(x * 13 + y * 7);
      for (let i = 0; i < 6; i++) {
        const c = tileToScreen(x + r() * 0.8 - 0.4, y + r() * 0.8 - 0.4);
        g.circle(c.x, c.y - 1, 1.6).fill(PALETTE[Math.floor(r() * 4)]);
      }
      break;
    }
    case "fountain": {
      const basin = box(8, PALE_STONE);
      g.poly(flat(up(basin.T, -1), up(basin.R, -1), up(basin.B, -1), up(basin.L, -1))).fill(0xa8d6e0);
      const c = center(0.5, 0.5, 8);
      g.rect(c.x - 2, c.y - 14, 4, 14).fill(0xd9d3c7);
      g.ellipse(c.x, c.y - 14, 5, 2).fill(0xe2ddd3);
      const water = new Graphics();
      const draw = (t: number) => {
        water.clear();
        const k = (t * 0.8) % 1;
        water.ellipse(c.x, c.y + 1, 6 + k * 10, 3 + k * 5).stroke({ color: 0xffffff, width: 1, alpha: 0.8 * (1 - k) });
        water.circle(c.x, c.y - 17 + Math.sin(t * 6) * 0.8, 1.6).fill(0xa8d6e0);
      };
      draw(0);
      animators.push(draw);
      layer.addChild(water);
      break;
    }
    case "signpost": {
      const c = center(0, 0, 0);
      g.rect(c.x - 1, c.y - 22, 2, 22).fill(0x7a5a3e);
      g.poly([c.x - 10, c.y - 22, c.x + 8, c.y - 26, c.x + 10, c.y - 20, c.x - 8, c.y - 16]).fill(0xe2b36c);
      g.poly([c.x - 8, c.y - 13, c.x + 7, c.y - 9, c.x + 6, c.y - 5, c.x - 9, c.y - 9]).fill(0xa8d6e0);
      break;
    }
    default:
      box(10, WOOD);
  }
}
