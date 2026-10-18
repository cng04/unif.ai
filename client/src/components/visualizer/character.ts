// Procedural pixel-art characters, painted with plain canvas calls (no Pixi) so the world and the React
// overlays (bio card avatar) draw the same person. Each agent gets a palette and hair style from its user id.
// Exported sheets live in design/sprites/ and on the "Sprites · in-game" artboard in Paper.

import { hash, rng, type Dir } from "./world/geometry";

export const FRAME_W = 16;
export const FRAME_H = 24;

export const POSES = [
  "idle0", "idle1",
  "walk0", "walk1", "walk2", "walk3",
  "sit", "sitFwd0", "sitFwd1",
  "up0", "up1",
  "fwd0", "fwd1",
] as const;
export type Pose = (typeof POSES)[number];

/** Sheet rows, top to bottom. */
export const DIRS: Dir[] = ["S", "N", "E", "W"];

export type Palette = {
  skin: string;
  skinShade: string;
  hair: string;
  hairStyle: number;
  shirt: string;
  shirtShade: string;
  pants: string;
  shoes: string;
  /** Used for the name tag and selection accents. */
  accent: number;
};

export const SKINS = ["#f6d5b8", "#eebc94", "#d9a173", "#b67b4e", "#8a5634", "#5e3a22"];
export const HAIRS = ["#24170f", "#4a2f1e", "#7b4a26", "#c08a40", "#e8c77e", "#a63a2a", "#6d717a", "#34418f", "#d07aa0", "#f2f0ea"];
export const PANTS = ["#2f3a56", "#393939", "#5b4636", "#5f7050", "#26324a", "#7d6345", "#4b3a5e"];

/** Number of hair styles drawn in `paintFrame` (short, long, bun, spiky, buzz). */
export const HAIR_STYLES = 5;

/** The parts a person (or their agent) chose; any unset part keeps the id-seeded default. Mirrors the server's
 * `Look` (agent/src/unifai_agent/profile.py), whose ranges are these tables' sizes. */
export type Look = {
  skin?: number | null;
  hair?: number | null;
  hair_style?: number | null;
  shirt_hue?: number | null;
  pants?: number | null;
  source?: "agent" | "you";
};

const inRange = (v: number | null | undefined, count: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v < count;

export function paletteFor(userId: string, look?: Look | null): Palette {
  const r = rng(hash(userId));
  const pick = <T,>(list: T[]) => list[Math.floor(r() * list.length)];
  const seededSkin = Math.floor(r() * SKINS.length);
  const seededHue = Math.floor(r() * 360);
  const sat = 50 + Math.floor(r() * 25);
  const light = 46 + Math.floor(r() * 14);
  const seededHair = pick(HAIRS);
  const seededStyle = Math.floor(r() * HAIR_STYLES);
  const seededPants = pick(PANTS);
  // Draw order above is fixed, so setting one part never changes the others' seeded values.
  const skinIndex = inRange(look?.skin, SKINS.length) ? look.skin : seededSkin;
  const hue = inRange(look?.shirt_hue, 360) ? look.shirt_hue : seededHue;
  return {
    skin: SKINS[skinIndex],
    skinShade: shade(SKINS[skinIndex], -0.14),
    hair: inRange(look?.hair, HAIRS.length) ? HAIRS[look.hair] : seededHair,
    hairStyle: inRange(look?.hair_style, HAIR_STYLES) ? look.hair_style : seededStyle,
    shirt: `hsl(${hue} ${sat}% ${light}%)`,
    shirtShade: `hsl(${hue} ${sat}% ${light - 12}%)`,
    pants: inRange(look?.pants, PANTS.length) ? PANTS[look.pants] : seededPants,
    shoes: "#1d1b1a",
    accent: hslToHex(hue, 85, 62),
  };
}

type Ctx = CanvasRenderingContext2D;

/** The full 13x4 sheet (POSES across, DIRS down) for one palette, at 1px per pixel. */
export function paintSheet(palette: Palette): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = FRAME_W * POSES.length;
  canvas.height = FRAME_H * DIRS.length;
  const ctx = canvas.getContext("2d")!;
  DIRS.forEach((dir, row) =>
    POSES.forEach((pose, col) => {
      ctx.save();
      ctx.translate(col * FRAME_W, row * FRAME_H);
      paintFrame(ctx, dir, pose, palette);
      ctx.restore();
    }),
  );
  return canvas;
}

/** One frame at the context's origin. West is east mirrored. */
export function paintFrame(ctx: Ctx, dir: Dir, pose: Pose, palette: Palette) {
  if (dir === "W") {
    ctx.translate(FRAME_W, 0);
    ctx.scale(-1, 1);
  }
  drawCharacter(ctx, dir === "W" ? "E" : dir, pose, palette);
}

/** A plain name for the shirt colour, for captions like "agent · ochre". */
export function colorName(userId: string): string {
  const hue = shirtHue(userId);
  const names: [number, string][] = [
    [15, "ember"], [40, "rust"], [60, "ochre"], [85, "mustard"], [150, "moss"], [185, "sea"],
    [215, "glacier"], [245, "cobalt"], [275, "periwinkle"], [310, "plum"], [345, "rose"], [360, "ember"],
  ];
  return names.find(([max]) => hue < max)![1];
}

function shirtHue(userId: string): number {
  const r = rng(hash(userId));
  r(); // skin, drawn first in paletteFor
  return Math.floor(r() * 360);
}

function px(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** One 16x24 frame, feet on row 22. Draws S, N or E; W is mirrored by the caller. */
function drawCharacter(ctx: Ctx, dir: "S" | "N" | "E", pose: Pose, p: Palette) {
  const sitting = pose.startsWith("sit");
  const walkStep = pose.startsWith("walk") ? Number(pose[4]) : -1;
  // Vertical offset of everything above the legs: breathing, walk bob, or sitting lower.
  const bob = pose === "idle1" ? 1 : walkStep === 1 || walkStep === 3 ? -1 : sitting ? 3 : 0;
  const arms: "rest" | "up0" | "up1" | "fwd0" | "fwd1" =
    pose === "up0" || pose === "up1" ? pose : pose === "fwd0" || pose === "sitFwd0" ? "fwd0" : pose === "fwd1" || pose === "sitFwd1" ? "fwd1" : "rest";

  if (dir === "E") drawSide(ctx, p, bob, walkStep, sitting, arms);
  else drawFrontBack(ctx, dir, p, bob, walkStep, sitting, arms);
}

function drawFrontBack(
  ctx: Ctx, dir: "S" | "N", p: Palette, bob: number, walkStep: number, sitting: boolean,
  arms: "rest" | "up0" | "up1" | "fwd0" | "fwd1",
) {
  const back = dir === "N";
  // Legs
  if (sitting) {
    px(ctx, 5, 19, 6, 2, p.pants);
    if (!back) {
      px(ctx, 5, 21, 2, 1, p.shoes);
      px(ctx, 9, 21, 2, 1, p.shoes);
    }
  } else {
    const liftL = walkStep === 1 ? 1 : 0;
    const liftR = walkStep === 3 ? 1 : 0;
    px(ctx, 5, 17, 3, 5 - liftL, p.pants);
    px(ctx, 8, 17, 3, 5 - liftR, p.pants);
    px(ctx, 5, 22 - liftL, 3, 1, p.shoes);
    px(ctx, 8, 22 - liftR, 3, 1, p.shoes);
    px(ctx, 8, 17, 1, 4, shade(p.pants, -0.2));
  }
  const o = bob;
  // Torso
  px(ctx, 4, 11 + o, 8, 6, p.shirt);
  px(ctx, 11, 11 + o, 1, 6, p.shirtShade);
  px(ctx, 4, 16 + o, 8, 1, shade(p.pants, -0.1));
  if (!back) px(ctx, 7, 11 + o, 2, 1, p.skinShade);
  // Arms
  const swing = walkStep === 1 ? 1 : walkStep === 3 ? -1 : 0;
  if (arms === "rest") {
    px(ctx, 3, 11 + o + swing, 1, 3, p.shirtShade);
    px(ctx, 12, 11 + o - swing, 1, 3, p.shirtShade);
    px(ctx, 3, 14 + o + swing, 1, 2, p.skin);
    px(ctx, 12, 14 + o - swing, 1, 2, p.skin);
  } else if (arms === "up0" || arms === "up1") {
    const top = arms === "up0" ? 5 : 8;
    px(ctx, 3, top + 2 + o, 1, 12 - top - 1, p.shirtShade);
    px(ctx, 12, top + 2 + o, 1, 12 - top - 1, p.shirtShade);
    px(ctx, 3, top + o, 1, 2, p.skin);
    px(ctx, 12, top + o, 1, 2, p.skin);
  } else {
    const lift = arms === "fwd1" ? 1 : 0;
    px(ctx, 3, 11 + o, 1, 3, p.shirtShade);
    px(ctx, 12, 11 + o, 1, 3, p.shirtShade);
    if (back) {
      px(ctx, 3, 14 + o - lift, 1, 1, p.skin);
      px(ctx, 12, 14 + o - lift, 1, 1, p.skin);
    } else {
      px(ctx, 4, 14 + o - lift, 2, 1, p.skin);
      px(ctx, 10, 14 + o - lift, 2, 1, p.skin);
    }
  }
  // Head
  px(ctx, 4, 3 + o, 8, 8, p.skin);
  px(ctx, 11, 3 + o, 1, 8, p.skinShade);
  if (!back) {
    px(ctx, 6, 7 + o, 1, 2, "#1f1a17");
    px(ctx, 9, 7 + o, 1, 2, "#1f1a17");
    px(ctx, 5, 9 + o, 1, 1, shade(p.skin, -0.06));
    px(ctx, 10, 9 + o, 1, 1, shade(p.skin, -0.06));
  }
  drawHairFront(ctx, p, o, back);
}

function drawHairFront(ctx: Ctx, p: Palette, o: number, back: boolean) {
  const h = p.hair;
  const dark = shade(h, -0.18);
  switch (p.hairStyle) {
    case 0: // short
      px(ctx, 4, 2 + o, 8, 3, h);
      px(ctx, 4, 5 + o, 1, 2, h);
      px(ctx, 11, 5 + o, 1, 2, dark);
      break;
    case 1: // long
      px(ctx, 4, 2 + o, 8, 3, h);
      px(ctx, 3, 4 + o, 2, 9, h);
      px(ctx, 11, 4 + o, 2, 9, dark);
      break;
    case 2: // bun
      px(ctx, 4, 2 + o, 8, 3, h);
      px(ctx, 6, 0 + o, 4, 2, dark);
      px(ctx, 4, 5 + o, 1, 1, h);
      break;
    case 3: // spiky
      px(ctx, 4, 2 + o, 8, 3, h);
      for (const x of [4, 6, 8, 10]) px(ctx, x, 1 + o, 1, 1, h);
      px(ctx, 11, 4 + o, 1, 2, dark);
      break;
    default: // buzz
      px(ctx, 4, 3 + o, 8, 2, h);
      px(ctx, 4, 3 + o, 8, 1, dark);
  }
  if (back) {
    px(ctx, 4, 2 + o, 8, 7, h);
    px(ctx, 11, 2 + o, 1, 7, dark);
    if (p.hairStyle === 1) px(ctx, 4, 9 + o, 8, 4, h);
    if (p.hairStyle === 2) px(ctx, 6, 0 + o, 4, 2, dark);
  }
}

function drawSide(
  ctx: Ctx, p: Palette, bob: number, walkStep: number, sitting: boolean,
  arms: "rest" | "up0" | "up1" | "fwd0" | "fwd1",
) {
  // Legs: the far leg is shaded so the stride reads.
  const far = shade(p.pants, -0.22);
  if (sitting) {
    px(ctx, 6, 19, 6, 2, p.pants);
    px(ctx, 10, 21, 2, 1, p.shoes);
  } else if (walkStep === 1 || walkStep === 3) {
    const [front, backX] = walkStep === 1 ? [9, 5] : [5, 9];
    px(ctx, backX, 17, 2, 5, far);
    px(ctx, backX, 22, 3, 1, p.shoes);
    px(ctx, front, 17, 2, 5, p.pants);
    px(ctx, front, 22, 3, 1, p.shoes);
  } else {
    px(ctx, 7, 17, 3, 5, p.pants);
    px(ctx, 7, 17, 1, 5, far);
    px(ctx, 7, 22, 4, 1, p.shoes);
  }
  const o = bob;
  // Torso
  px(ctx, 5, 11 + o, 6, 6, p.shirt);
  px(ctx, 5, 11 + o, 1, 6, p.shirtShade);
  px(ctx, 5, 16 + o, 6, 1, shade(p.pants, -0.1));
  // Head
  px(ctx, 5, 3 + o, 7, 8, p.skin);
  px(ctx, 12, 7 + o, 1, 1, p.skin);
  px(ctx, 10, 7 + o, 1, 2, "#1f1a17");
  const h = p.hair;
  const dark = shade(h, -0.18);
  if (p.hairStyle === 4) {
    px(ctx, 5, 3 + o, 7, 2, h);
  } else {
    px(ctx, 5, 2 + o, 7, 3, h);
    px(ctx, 5, 5 + o, 3, 3, dark);
  }
  if (p.hairStyle === 1) px(ctx, 4, 4 + o, 3, 9, h);
  if (p.hairStyle === 2) px(ctx, 3, 3 + o, 3, 3, dark);
  if (p.hairStyle === 3) for (const x of [5, 7, 9]) px(ctx, x, 1 + o, 1, 1, h);
  // Near arm
  if (arms === "rest") {
    const swing = walkStep === 1 ? 1 : walkStep === 3 ? -1 : 0;
    px(ctx, 7 + swing, 11 + o, 2, 3, p.shirtShade);
    px(ctx, 7 + swing, 14 + o, 2, 2, p.skin);
  } else if (arms === "up0" || arms === "up1") {
    const top = arms === "up0" ? 4 : 7;
    px(ctx, 8, top + 2 + o, 2, 12 - top - 1, p.shirtShade);
    px(ctx, 8, top + o, 2, 2, p.skin);
  } else {
    const lift = arms === "fwd1" ? 1 : 0;
    px(ctx, 7, 11 + o, 2, 2, p.shirtShade);
    px(ctx, 8, 13 + o - lift, 3, 1, p.shirtShade);
    px(ctx, 11, 13 + o - lift, 2, 1, p.skin);
  }
}

// ---- colour helpers ----

function shade(color: string, amount: number): string {
  const [r, g, b] = toRgb(color);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  return `rgb(${f(r)} ${f(g)} ${f(b)})`;
}

function toRgb(color: string): [number, number, number] {
  if (color.startsWith("#")) {
    const n = parseInt(color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const nums = color.match(/[\d.]+/g)!.map(Number);
  if (color.startsWith("hsl")) {
    const hex = hslToHex(nums[0], nums[1], nums[2]);
    return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  }
  return [nums[0], nums[1], nums[2]];
}

export function hslToHex(h: number, s: number, l: number): number {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const c = (n: number) => Math.round(255 * (light - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return (c(0) << 16) | (c(8) << 8) | c(4);
}
