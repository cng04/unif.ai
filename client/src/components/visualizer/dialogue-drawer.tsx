"use client";

// One agent-to-agent chat, laid out like the "Dialogue drawer" on the Paper "World visualizer" page. It says
// plainly where the conversation comes from: live (the server has it running), completed, historical, or a replay.

import { Caption, CloseButton, DotPill, Pill, fitTone, panel } from "./hud";
import type { Origin } from "./types";
import type { SnapshotMember, SnapshotPair } from "./world/snapshot";
import type { MessageState } from "./WorldCanvas";

const ORIGIN_COPY: Record<Origin, string> = {
  live: "live",
  completed: "completed",
  replay: "replay",
  historical: "historical",
};

export function DialogueDrawer({
  pair,
  origin,
  members,
  messages,
  className = "",
  onClose,
  onRetry,
  onReplay,
  onSelectAgent,
}: {
  pair: SnapshotPair;
  origin: Origin;
  members: Map<string, SnapshotMember>;
  messages: MessageState | undefined;
  className?: string;
  onClose: () => void;
  onRetry: () => void;
  /** Re-enact this completed chat in the World (labelled as a replay). */
  onReplay?: () => void;
  onSelectAgent: (id: string) => void;
}) {
  const nameOf = (id: string) => members.get(id)?.name ?? "someone";
  const conflict = (pair.dealbreaker_flags?.length ?? 0) > 0;

  return (
    <aside aria-label="Agent dialogue" className={`${panel} flex flex-col gap-3.5 p-5 ${className}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <Caption>dialogue</Caption>
          <h2 className="font-sans text-[21px] leading-[26px] font-light tracking-[-0.01em] text-ink">
            <button type="button" className="hover:underline" onClick={() => onSelectAgent(pair.a)}>
              {nameOf(pair.a)}
            </button>
            {" × "}
            <button type="button" className="hover:underline" onClick={() => onSelectAgent(pair.b)}>
              {nameOf(pair.b)}
            </button>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {origin === "live" ? <DotPill>live</DotPill> : <Pill tone="outline">{ORIGIN_COPY[origin]}</Pill>}
          <CloseButton onClick={onClose} />
        </div>
      </header>

      {pair.vibe !== undefined && (
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-1.5">
            <span className="font-sans text-[64px] leading-[64px] font-light tracking-[-0.03em] text-ink">
              {pair.vibe == null ? "—" : pair.vibe.toFixed(1)}
            </span>
            <span className="font-mono text-[11px] leading-[14px] tracking-[0.14em] text-ink-faint">/ 10 vibe</span>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="font-mono text-[9.5px] leading-3 tracking-[0.16em] text-ink-faint">logistics</span>
            <Pill tone={fitTone(pair.logistics ?? null, conflict)} className="px-[11px] py-1 text-[10px]">
              {conflict ? "incompatible" : (pair.logistics ?? "—")}
            </Pill>
          </div>
        </div>
      )}

      {(pair.dealbreaker_flags?.length ?? 0) > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {pair.dealbreaker_flags!.map((f) => (
            <li key={f}>
              <Pill tone="ember">{f}</Pill>
            </li>
          ))}
        </ul>
      )}

      {pair.rationale && (
        <div className="flex flex-col gap-2">
          <Caption>judge&apos;s rationale</Caption>
          <p className="font-sans text-[13px] leading-[19px] text-ink-muted">{pair.rationale}</p>
        </div>
      )}

      {onReplay && origin !== "live" && (
        <button
          type="button"
          onClick={onReplay}
          className="press self-start rounded-full border border-ink/25 px-3 py-1.5 font-mono text-[9.5px] leading-3 tracking-[0.14em] text-ink hover:bg-ink/5"
        >
          re-enact in the world →
        </button>
      )}

      <div className="h-px shrink-0 bg-line" />

      <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto pr-1">
        {origin === "live" ? (
          <div className="flex items-center gap-2 py-2">
            <span className="size-2 animate-pulse rounded-full bg-blob-ochre" />
            <span className="size-2 animate-pulse rounded-full bg-blob-glacier" />
            <span className="size-2 animate-pulse rounded-full bg-blob-periwinkle" />
            <span className="ml-1 font-sans text-[13px] leading-4 text-ink-muted">talking now; the transcript appears when the chat is judged</span>
          </div>
        ) : messages === undefined || messages === "loading" ? (
          <p className="py-2 font-sans text-[13px] text-ink-muted">loading the transcript…</p>
        ) : messages === "error" ? (
          <p className="font-sans text-[13px] text-ink-muted">
            couldn&apos;t load the transcript.{" "}
            <button type="button" className="underline" onClick={onRetry}>
              try again
            </button>
          </p>
        ) : messages.length === 0 ? (
          <p className="py-2 font-sans text-[14px] text-ink-muted">no messages saved for this chat</p>
        ) : (
          messages.map((m, i) => {
            const first = m.speakerId === pair.a;
            return (
              <div key={i} className={`flex max-w-[290px] flex-col gap-1 ${first ? "items-start" : "items-end self-end"}`}>
                <span className="font-mono text-[9.5px] leading-3 tracking-[0.14em] text-ink-faint">
                  {nameOf(m.speakerId).toLowerCase()} · {clock(m.createdAt)}
                </span>
                <p
                  className={`px-3.5 py-2.5 font-sans text-[14px] leading-[21px] text-ink ${
                    first ? "rounded-[18px] rounded-bl-md bg-[#E2B36C3D]" : "rounded-[18px] rounded-br-md bg-[#A8D6E066]"
                  }`}
                >
                  {m.content}
                </p>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
