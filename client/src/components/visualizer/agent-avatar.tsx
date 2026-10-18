"use client";

import { useEffect, useMemo, useRef } from "react";
import { FRAME_H, FRAME_W, paintFrame, paletteFor, type Look } from "./character";

/** The agent's own sprite (front, idle) on a tile of its shirt colour, with the neon selection ring. */
export function AgentAvatar({ userId, look, selected = true }: { userId: string; look?: Look | null; selected?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const palette = useMemo(() => paletteFor(userId, look), [userId, look]);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, FRAME_W, FRAME_H);
    ctx.save();
    paintFrame(ctx, "S", "idle0", palette);
    ctx.restore();
  }, [palette]);

  return (
    <div
      className={`relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-[14px] ${
        selected ? "shadow-[0_0_0_2px_#7CFFEA,0_0_16px_3px_#7CFFEA8C]" : ""
      }`}
      style={{ backgroundColor: `color-mix(in oklab, ${palette.shirt} 35%, #FBFAF7)` }}
    >
      <canvas
        ref={canvas}
        width={FRAME_W}
        height={FRAME_H}
        aria-hidden
        className="h-9 w-6 translate-y-1 [image-rendering:pixelated]"
      />
    </div>
  );
}
