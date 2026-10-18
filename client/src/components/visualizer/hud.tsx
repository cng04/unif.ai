"use client";

// Building blocks for the world overlays, matching the Paper "World visualizer" page: frosted sheet panels,
// bracketed mono captions, pills, toggles and segmented controls.

import type { ReactNode } from "react";

/** Frosted sheet panel (#FBFAF7 at 90%, white hairline, 28px radius). */
export const panel = "rounded-[28px] border border-white/50 bg-[#FBFAF7E6] backdrop-blur-sm";

/** "( floor )", "( pipeline )": 9.5px Geist Mono, wide tracking. */
export function Caption({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`font-mono fs-9.5 leading-3 tracking-[0.16em] text-ink-faint ${className}`}>( {children} )</p>;
}

export type PillTone = "solid" | "outline" | "ember";

const PILL: Record<PillTone, string> = {
  solid: "bg-ink text-paper",
  outline: "border border-ink-muted text-ink-muted",
  ember: "border border-ember text-ember-text",
};

export function Pill({ tone, children, className = "" }: { tone: PillTone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex rounded-full px-[9px] py-[3px] font-mono fs-9.5 leading-3 tracking-[0.12em] ${PILL[tone]} ${className}`}>
      {children}
    </span>
  );
}

/** Logistics fit as a pill: strong solid, workable outline, incompatible ember. */
export function fitTone(fit: string | null, conflict = false): PillTone {
  if (conflict || fit === "incompatible") return "ember";
  return fit === "strong" ? "solid" : "outline";
}

/** Small status pill with an ember dot ("TALKING", "live", "matching"). */
export function DotPill({ children, dark = false, dot = "bg-ember" }: { children: ReactNode; dark?: boolean; dot?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-[5px] font-mono fs-9.5 leading-3 tracking-[0.14em] ${
        dark ? "bg-ink text-paper" : "border border-line text-ink"
      }`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${dot}`} />
      {children}
    </span>
  );
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-5 w-[34px] shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? "bg-ink" : "bg-line"}`}
    >
      <span className={`absolute top-[3px] size-3.5 rounded-full transition-[left] ${on ? "left-[17px] bg-paper" : "left-[3px] bg-sheet"}`} />
    </button>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  size = "md",
  render = (v) => String(v),
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: "md" | "sm";
  render?: (v: T) => ReactNode;
}) {
  const pad = size === "md" ? "px-4 py-[9px] tracking-[0.14em]" : "px-3 py-[5px]";
  return (
    <div role="group" aria-label={label} className={`flex items-center gap-0.5 rounded-full ${size === "md" ? "p-1" : "border border-line p-[3px]"}`}>
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          aria-pressed={o === value}
          onClick={() => onChange(o)}
          className={`press rounded-full font-mono fs-11 lh-14 ${pad} ${o === value ? "bg-ink text-paper" : "text-ink-muted hover:bg-ink/5"}`}
        >
          {render(o)}
        </button>
      ))}
    </div>
  );
}

export function CloseButton({ onClick, label = "Close" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="press grid size-7 shrink-0 place-items-center rounded-full border border-line font-mono fs-11 text-ink-muted hover:bg-ink/5"
    >
      ✕
    </button>
  );
}
