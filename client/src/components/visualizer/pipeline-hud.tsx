"use client";

// The "Pipeline HUD" from the Paper "World visualizer" page: where the matching run really is (from the server's
// recorded stage, never guessed), playback speed, and camera follow.

import { Caption, Segmented, Toggle, panel } from "./hud";
import type { Stage } from "./world/activity";

const SPEEDS = [1, 2, 4] as const;
const STEPS: { stage: Stage; label: string }[] = [
  { stage: "onboarding", label: "joining" },
  { stage: "keywords", label: "keywords" },
  { stage: "scoring", label: "scoring" },
  { stage: "chats", label: "chats" },
  { stage: "groups", label: "groups" },
];

export function PipelineHud({
  stage,
  speed,
  following,
  canFollow,
  className = "",
  onSpeed,
  onFollow,
  match,
}: {
  stage: Stage;
  speed: number;
  following: boolean;
  canFollow: boolean;
  className?: string;
  onSpeed: (speed: number) => void;
  onFollow: (on: boolean) => void;
  /** Admin only. Absent on a participant's world. */
  match?: {
    running: boolean;
    ready: boolean;
    needed: number;
    pending: boolean;
    error?: string;
    onRun: () => void;
    onAbort: () => void;
  };
}) {
  // "matched" means the whole run is done: every step is behind us.
  const current = stage === "matched" ? STEPS.length : STEPS.findIndex((s) => s.stage === stage);
  return (
    <section aria-label="Pipeline" className={`${panel} flex flex-col gap-4 px-5 py-[18px] ${className}`}>
      <div className="flex items-center justify-between">
        <Caption className="text-ink-muted">pipeline</Caption>
        <span className="font-mono fs-10 leading-3 tracking-[0.14em] text-ink-muted">
          {stage === "matched" ? "matched" : stage === "onboarding" ? "not started" : "running"}
        </span>
      </div>

      <ol className="flex items-start">
        {STEPS.map((step, i) => {
          const status = stage === "onboarding" && i === 0 ? "active" : i < current ? "done" : i === current ? "active" : "waiting";
          const last = i === STEPS.length - 1;
          return (
            <li key={step.stage} className="flex flex-1 flex-col gap-2">
              <div className="flex items-center">
                <span
                  className={`size-3 shrink-0 rounded-full ${
                    status === "active" ? "bg-ember shadow-[0_0_0_4px_#E27A5033]" : status === "done" ? "bg-ink" : "border border-ink-faint"
                  }`}
                />
                {!last && <span className={`h-px flex-1 ${i < current ? "bg-ink" : "bg-line"}`} />}
              </div>
              <span className={`font-sans fs-14 lh-18 ${status === "active" ? "font-medium text-ember-text" : status === "done" ? "text-ink" : "text-ink-faint"}`}>
                {step.label}
              </span>
              <span className={`font-mono fs-9.5 leading-3 tracking-[0.14em] ${status === "active" ? "text-ember-text" : "text-ink-faint"}`}>{status}</span>
            </li>
          );
        })}
      </ol>

      {match && (
        <div className="flex flex-col gap-1.5 border-t border-line pt-3.5">
          {match.running ? (
            <button
              type="button"
              disabled={match.pending}
              onClick={match.onAbort}
              className="press self-start rounded-full border border-ember bg-ember/10 px-3.5 py-[7px] font-mono fs-11 leading-3 tracking-[0.14em] text-ember-text disabled:opacity-40"
            >
              {match.pending ? "aborting…" : "abort matching"}
            </button>
          ) : (
            <button
              type="button"
              disabled={match.pending || !match.ready}
              onClick={match.onRun}
              className="press self-start rounded-full bg-ink px-3.5 py-[7px] font-mono fs-11 leading-3 tracking-[0.14em] text-paper disabled:opacity-40"
            >
              {match.pending ? "starting…" : stage === "matched" ? "re-run matching" : "run matching"}
            </button>
          )}
          {!match.running && !match.ready && (
            <span className="font-mono fs-9.5 leading-3 tracking-[0.12em] text-ink-muted">need {match.needed} people onboarded</span>
          )}
          {match.error && <span className="font-sans fs-13 leading-4 text-ember-text">{match.error}</span>}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-line pt-3.5">
        <Segmented options={SPEEDS} value={speed as (typeof SPEEDS)[number]} onChange={onSpeed} label="Speed" size="sm" render={(s) => `${s}×`} />
        <label className="flex items-center gap-2 font-sans fs-13 leading-4 text-ink">
          follow
          <Toggle on={following} disabled={!canFollow} label="Follow the selected agent" onChange={onFollow} />
        </label>
      </div>
    </section>
  );
}
