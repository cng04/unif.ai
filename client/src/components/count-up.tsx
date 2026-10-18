"use client";

import { useEffect, useState } from "react";

/**
 * Counts from 0 to `to` on first paint (ease-out); renders the final value under reduced motion or SSR.
 * `format` shows fractional values (e.g. a .91 score); without it the count is rounded.
 */
export function CountUp({ to, ms = 900, format }: { to: number; ms?: number; format?: (n: number) => string }) {
  const [value, setValue] = useState(to);
  useEffect(() => {
    if (to === 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / ms, 1);
      const v = to * (1 - (1 - t) ** 3);
      setValue(format ? v : Math.round(v));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- format is usually an inline lambda
  }, [to, ms]);
  return <span className="tabular-nums">{format ? format(value) : value}</span>;
}
