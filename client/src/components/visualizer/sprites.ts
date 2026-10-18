// Pixi textures for an agent: the canvas sheet from character.ts, sliced into one texture per pose and
// direction with nearest-neighbour scaling.

import { Rectangle, Texture } from "pixi.js";
import { DIRS, FRAME_H, FRAME_W, POSES, paintSheet, paletteFor, type Palette, type Pose } from "./character";
import type { Dir } from "./world/geometry";

export { FRAME_H, FRAME_W, POSES, type Pose } from "./character";

export type AgentSheet = { frames: Record<Dir, Record<Pose, Texture>>; palette: Palette };

/** Paint the full sheet once per agent; textures share one canvas source. */
export function buildSheet(userId: string): AgentSheet {
  const palette = paletteFor(userId);
  const base = Texture.from(paintSheet(palette));
  base.source.scaleMode = "nearest";
  const frames = {} as AgentSheet["frames"];
  DIRS.forEach((dir, row) => {
    frames[dir] = {} as Record<Pose, Texture>;
    POSES.forEach((pose, col) => {
      frames[dir][pose] = new Texture({
        source: base.source,
        frame: new Rectangle(col * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H),
      });
    });
  });
  return { frames, palette };
}
