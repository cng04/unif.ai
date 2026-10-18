"use client";

import { useEffect, useState } from "react";

/** Counts from 0 to `to` on first paint (ease-out); renders the final value under reduced motion or SSR. */
export function CountUp({ to, ms = 900 }: { to: number; ms?: number }) {
  const [value, setValue] = useState(to);
  useEffect(() => {
    if (to === 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / ms, 1);
      setValue(Math.round(to * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, ms]);
  return <span className="tabular-nums">{value}</span>;
}
