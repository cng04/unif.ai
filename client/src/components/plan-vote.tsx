"use client";

import { useActionState } from "react";

type State = { error?: string };

/** "●●●○○ 3 of 5 in" plus the "i'm in" toggle on one plan card. The dot outlined in ember is the vote that locks it. */
export function PlanVote({
  action,
  going,
  size,
  needed,
  mine,
  locked,
}: {
  action: (going: boolean) => Promise<State>;
  going: number;
  size: number;
  needed: number;
  mine: boolean;
  /** Another plan is already locked in, so this one can't be joined. */
  locked: boolean;
}) {
  const [state, formAction, pending] = useActionState(() => action(!mine), {});

  return (
    <form action={formAction} className="flex flex-col gap-2 pt-1">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1" aria-label={`${going} of ${size} in`}>
          {Array.from({ length: size }, (_, i) => (
            <span
              key={i}
              className={`size-2.5 rounded-full ${i < going ? "bg-ink" : i === needed - 1 ? "border border-ember" : "border border-ink/30"}`}
            />
          ))}
        </span>
        <span className={`font-mono text-meta leading-3 tracking-meta ${going >= needed ? "text-ember-text" : "text-ink-muted"}`}>
          {going} of {size} in
        </span>
        <span className="flex-1" />
        {!locked && (
          <button
            type="submit"
            disabled={pending}
            aria-pressed={mine}
            className={`press rounded-full px-4 py-2 font-mono text-label leading-3 tracking-label disabled:opacity-50 ${mine ? "border border-ink/25 hover:bg-ink/5" : "bg-ink text-sheet"}`}
          >
            {mine ? "i'm out" : "i'm in"}
          </button>
        )}
      </div>
      {state.error && <p className="micro text-ember-text">{state.error}</p>}
    </form>
  );
}
