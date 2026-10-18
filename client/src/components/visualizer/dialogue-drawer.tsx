"use client";

// One agent-to-agent chat, laid out like the "Dialogue drawer" on the Paper "World visualizer" page, including
// its loading / empty states.

import { Caption, CloseButton, DotPill, Pill, fitTone, panel } from "./hud";
import type { WorldAgent, WorldPair } from "./types";
import type { MessageState } from "./WorldCanvas";

export function DialogueDrawer({
  pair,
  agentsById,
  messages,
  live,
  className = "",
  onClose,
  onRetry,
  onSelectAgent,
}: {
  pair: WorldPair;
  agentsById: Map<string, WorldAgent>;
  messages: MessageState | undefined;
  live: boolean;
  className?: string;
  onClose: () => void;
  onRetry: () => void;
  onSelectAgent: (id: string) => void;
}) {
  const nameOf = (id: string) => agentsById.get(id)?.name ?? "someone";
  const conflict = pair.dealbreakerFlags.length > 0;

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
          {live && <DotPill>live</DotPill>}
          <CloseButton onClick={onClose} />
        </div>
      </header>

      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-1.5">
          <span className="font-sans text-[64px] leading-[64px] font-light tracking-[-0.03em] text-ink">
            {pair.vibe == null ? "—" : pair.vibe.toFixed(1)}
          </span>
          <span className="font-mono text-[11px] leading-[14px] tracking-[0.14em] text-ink-faint">/ 10 vibe</span>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="font-mono text-[9.5px] leading-3 tracking-[0.16em] text-ink-faint">logistics</span>
          <Pill tone={fitTone(pair.logistics, conflict)} className="px-[11px] py-1 text-[10px]">
            {conflict ? "incompatible" : (pair.logistics ?? "—")}
          </Pill>
        </div>
      </div>

      {pair.dealbreakerFlags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {pair.dealbreakerFlags.map((f) => (
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

      <div className="h-px shrink-0 bg-line" />

      <div className="flex min-h-0 flex-col gap-2.5 overflow-y-auto pr-1">
        {messages === undefined || messages === "loading" ? (
          <div className="flex items-center gap-2 py-2">
            <span className="size-2 rounded-full bg-blob-ochre" />
            <span className="size-2 rounded-full bg-blob-glacier" />
            <span className="size-2 rounded-full bg-blob-periwinkle" />
            <span className="ml-1 font-sans text-[13px] leading-4 text-ink-muted">judging the chat…</span>
          </div>
        ) : messages === "error" ? (
          <p className="font-sans text-[13px] text-ink-muted">
            couldn&apos;t load the transcript.{" "}
            <button type="button" className="underline" onClick={onRetry}>
              try again
            </button>
          </p>
        ) : messages.length === 0 ? (
          <p className="py-2 font-sans text-[14px] text-ink-muted">no messages yet</p>
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
