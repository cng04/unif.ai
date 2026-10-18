"use client";

// The "Pipeline HUD" on the Paper "World visualizer" page: which matching stage the world is acting out, auto
// (follow the data) vs. replaying a stage, playback speed, and camera follow.

import { PHASES } from "./director";
import { Caption, Segmented, Toggle, panel } from "./hud";
import type { Phase, ViewMode } from "./types";

const SPEEDS = [1, 2, 4] as const;

export function PipelineHud({
  phase,
  view,
  available,
  speed,
  following,
  canFollow,
  className = "",
  onView,
  onSpeed,
  onFollow,
}: {
  phase: Phase;
  view: ViewMode;
  available: Phase[];
  speed: number;
  following: boolean;
  canFollow: boolean;
  className?: string;
  onView: (view: ViewMode) => void;
  onSpeed: (speed: number) => void;
  onFollow: (on: boolean) => void;
}) {
  const current = PHASES.indexOf(phase);
  return (
    <section aria-label="Pipeline" className={`${panel} flex flex-col gap-4 px-5 py-[18px] ${className}`}>
      <div className="flex items-center justify-between">
        <Caption className="text-ink-muted">pipeline</Caption>
        <label className="flex items-center gap-2 font-mono text-[10px] leading-3 tracking-[0.14em] text-ink-muted">
          auto
          <Toggle on={view === "auto"} label="Follow the live pipeline" onChange={(on) => onView(on ? "auto" : phase)} />
        </label>
      </div>

      <ol className="flex items-start">
        {PHASES.map((p, i) => {
          const enabled = available.includes(p);
          const status = i === current ? "active" : i < current ? "done" : enabled ? "ready" : "not reached";
          const last = i === PHASES.length - 1;
          return (
            <li key={p} className="flex flex-1 flex-col gap-2">
              <div className="flex items-center">
                <span
                  className={`size-3 shrink-0 rounded-full ${
                    status === "active"
                      ? "bg-ember shadow-[0_0_0_4px_#E27A5033]"
                      : status === "done" || status === "ready"
                        ? "bg-ink"
                        : "border border-ink-faint"
                  }`}
                />
                {!last && <span className={`h-px flex-1 ${i < current ? "bg-ink" : "bg-line"}`} />}
              </div>
              <button
                type="button"
                disabled={!enabled}
                onClick={() => onView(p)}
                aria-pressed={view === p}
                title={enabled ? `Replay: ${p}` : "No data for this stage yet"}
                className={`self-start text-left font-sans text-[14px] leading-[18px] disabled:cursor-default ${
                  status === "active" ? "font-medium text-ember-text" : enabled ? "text-ink hover:underline" : "text-ink-faint"
                }`}
              >
                {p}
              </button>
              <span
                className={`font-mono text-[9.5px] leading-3 tracking-[0.14em] ${status === "active" ? "text-ember-text" : "text-ink-faint"}`}
              >
                {status}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="flex items-center justify-between border-t border-line pt-3.5">
        <Segmented options={SPEEDS} value={speed as (typeof SPEEDS)[number]} onChange={onSpeed} label="Speed" size="sm" render={(s) => `${s}×`} />
        <label className="flex items-center gap-2 font-sans text-[13px] leading-4 text-ink">
          follow camera
          <Toggle on={following} disabled={!canFollow} label="Follow the selected agent" onChange={onFollow} />
        </label>
      </div>
    </section>
  );
}
