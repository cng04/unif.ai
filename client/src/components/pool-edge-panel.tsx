"use client";

import { useState } from "react";
import type { AdminPair } from "@/lib/api";
import { CountUp } from "./count-up";
import { formatScore } from "./ui";
import { useOpenPair } from "./use-open-pair";

/** The pool graph's side panel for one judged pair (`?pair=`): outcome, judge output and the agents' transcript. */
export function PoolEdgePanel({ pair, groupA, groupB }: { pair: AdminPair; groupA: string | null; groupB: string | null }) {
  const { close } = useOpenPair();
  const [transcript, setTranscript] = useState(false);
  const sameGroup = groupA !== null && groupA === groupB;
  const outcome = pair.conflict ? "ruled out by the judge" : sameGroup ? `kept · both in ${groupA}` : "not grouped together";
  return (
    <aside className="rise-in flex max-h-[620px] flex-col gap-4 overflow-y-auto rounded-[20px] border border-line bg-sheet p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-[10px] tracking-meta text-ink-muted">( edge · {sameGroup ? groupA : "cross-group"} )</p>
          <h2 className="text-[17px] leading-6 tracking-[0.08em] lowercase">
            {pair.a.full_name} ↔ {pair.b.full_name}
          </h2>
        </div>
        <button onClick={close} className="press font-mono text-[11px] text-ink-muted hover:text-ink" aria-label="Close">
          ✕
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <span className={`text-[34px] leading-10 font-light tracking-[0.02em] ${pair.conflict ? "text-ember-text" : ""}`}>
          {pair.vibe_score != null ? <CountUp to={pair.vibe_score} format={formatScore} /> : "—"}
        </span>
        <span className="h-[3px] overflow-hidden rounded-full bg-ink/8">
          <span
            className="draw-bar block h-full rounded-full"
            style={{ width: `${((pair.vibe_score ?? 0) / 10) * 100}%`, background: pair.conflict ? "var(--color-ember)" : "var(--color-ink)", opacity: 0.7 }}
          />
        </span>
        <span className="font-mono text-[9.5px] tracking-label text-ink-muted">{outcome}</span>
      </div>
      <dl className="flex flex-col gap-2 border-t border-line pt-3 font-mono text-[10px] tracking-label">
        <Row label="logistics" value={pair.logistics_fit ?? "—"} />
        <Row label="dealbreakers" value={pair.dealbreaker_flags.length ? pair.dealbreaker_flags.join("; ") : "none"} ember={pair.dealbreaker_flags.length > 0} />
        <Row label="ended" value={pair.end_reason ?? "—"} />
      </dl>
      <button
        onClick={() => setTranscript((v) => !v)}
        className="press rounded-full bg-ink py-3 text-[11.5px] tracking-meta text-paper"
        disabled={pair.messages.length === 0}
      >
        {pair.messages.length === 0 ? "no transcript" : transcript ? "hide transcript" : "read transcript →"}
      </button>
      {transcript && (
        <ol className="flex flex-col gap-2">
          {pair.messages.map((m, i) => {
            const fromA = m.speaker_id === pair.a.id;
            return (
              <li key={i} className={`flex flex-col gap-0.5 ${fromA ? "" : "items-end text-right"}`}>
                <span className="font-mono text-[9px] tracking-label text-ink-muted">{(fromA ? pair.a : pair.b).full_name.toLowerCase()}&apos;s agent</span>
                <span className={`max-w-[92%] rounded-[12px] px-3 py-2 text-[12.5px] leading-[18px] font-light ${fromA ? "border border-line bg-white/70" : "bg-ink text-paper"}`}>
                  {m.content}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}

function Row({ label, value, ember }: { label: string; value: React.ReactNode; ember?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={`text-right ${ember ? "text-ember-text" : ""}`}>{value}</dd>
    </div>
  );
}
