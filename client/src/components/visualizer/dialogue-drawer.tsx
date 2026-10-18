"use client";

import { Bubble, SpeakerLabel } from "@/components/ui";
import type { WorldAgent, WorldPair } from "./types";
import type { MessageState } from "./WorldCanvas";

export function DialogueDrawer({
  pair,
  agentsById,
  messages,
  live,
  onClose,
  onRetry,
  onSelectAgent,
}: {
  pair: WorldPair;
  agentsById: Map<string, WorldAgent>;
  messages: MessageState | undefined;
  live: boolean;
  onClose: () => void;
  onRetry: () => void;
  onSelectAgent: (id: string) => void;
}) {
  const nameOf = (id: string) => agentsById.get(id)?.name ?? "someone";

  return (
    <aside
      aria-label="Agent dialogue"
      className="rise-in flex max-h-[min(520px,75vh)] w-full flex-col overflow-hidden rounded-md border border-line bg-sheet/95 shadow-lg backdrop-blur md:pointer-events-auto md:w-[340px]"
    >
      <header className="flex flex-col gap-2 border-b border-line p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-[16px] font-light tracking-label lowercase">
            <button type="button" className="hover:underline" onClick={() => onSelectAgent(pair.a)}>
              {nameOf(pair.a)}
            </button>
            {" × "}
            <button type="button" className="hover:underline" onClick={() => onSelectAgent(pair.b)}>
              {nameOf(pair.b)}
            </button>
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="press micro h-7 w-7 shrink-0 rounded-full border border-ink/20">
            ✕
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {live && (
            <span className="micro flex items-center gap-1.5 rounded-full bg-ink px-2 py-0.5 text-paper uppercase">
              <span className="size-1.5 animate-pulse rounded-full bg-ember" /> talking now
            </span>
          )}
          <span className="micro rounded-full border border-line px-2 py-0.5 uppercase">
            vibe {pair.vibe == null ? "—" : `${pair.vibe.toFixed(1)}/10`}
          </span>
          {pair.logistics && <span className="micro rounded-full border border-line px-2 py-0.5 uppercase">logistics {pair.logistics}</span>}
          {pair.dealbreakerFlags.map((f) => (
            <span key={f} className="micro rounded-full bg-ember/15 px-2 py-0.5 text-ember-text uppercase">
              {f}
            </span>
          ))}
        </div>
        {pair.rationale && <p className="text-[12px] leading-[18px] font-light text-ink/80">{pair.rationale}</p>}
      </header>

      <div className="flex flex-col gap-3 overflow-y-auto p-4">
        {messages === undefined || messages === "loading" ? (
          <p className="micro text-ink-muted uppercase">loading transcript…</p>
        ) : messages === "error" ? (
          <p className="text-[12px] text-ink-muted">
            couldn&apos;t load the transcript.{" "}
            <button type="button" className="underline" onClick={onRetry}>
              try again
            </button>
          </p>
        ) : messages.length === 0 ? (
          <p className="text-[12px] text-ink-muted">no messages saved for this chat</p>
        ) : (
          messages.map((m, i) => {
            const side = m.speakerId === pair.a ? "them" : "you";
            return (
              <div key={i} className={`flex flex-col gap-1 ${side === "you" ? "items-end pl-6" : "items-start pr-6"}`}>
                <SpeakerLabel side={side}>{nameOf(m.speakerId)}&apos;s agent</SpeakerLabel>
                <Bubble side={side}>
                  <span className="text-[13px] leading-5">{m.content}</span>
                </Bubble>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
