"use client";

import { formatScore } from "@/components/ui";
import type { AgentInfo } from "./engine";
import type { WorldAgent, WorldData } from "./types";

const STATE_COPY: Record<AgentInfo["state"], string> = {
  IDLE: "idle",
  WALKING: "walking",
  SITTING: "sitting",
  THINKING: "thinking",
  TALKING: "talking",
  ACTIVITY: "busy",
};

const ONBOARDING_COPY: Record<WorldAgent["onboarding"], string> = {
  invited: "joined, not started",
  chatting: "onboarding with interviewer",
  complete: "onboarded",
};

export function BioCard({
  agent,
  info,
  data,
  following,
  onFollow,
  onClose,
  onOpenPair,
  onSelectAgent,
}: {
  agent: WorldAgent;
  info: AgentInfo | null;
  data: WorldData;
  following: boolean;
  onFollow: () => void;
  onClose: () => void;
  onOpenPair: (pairId: string) => void;
  onSelectAgent: (id: string) => void;
}) {
  const names = new Map(data.agents.map((a) => [a.id, a.name]));
  const pairs = data.pairs
    .filter((p) => p.a === agent.id || p.b === agent.id)
    .sort((a, b) => (b.vibe ?? 0) - (a.vibe ?? 0));
  const group = data.groups.find((g) => g.memberIds.includes(agent.id)) ?? null;
  // The judge's flags from this agent's chats (already returned by /pairs).
  const flags = [...new Set(pairs.flatMap((p) => p.dealbreakerFlags))];

  return (
    <section
      aria-label={`${agent.name}'s agent`}
      className="rise-in flex max-h-[min(440px,70vh)] w-full flex-col gap-3 overflow-y-auto rounded-md border border-line bg-sheet/95 p-4 shadow-lg backdrop-blur md:pointer-events-auto md:w-[300px]"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-[17px] font-light tracking-label lowercase">{agent.name}</h2>
          <p className="micro text-ink-muted uppercase">
            {info ? `${STATE_COPY[info.state]} · ${info.room} · ${info.floor}` : "…"}
          </p>
          <p className="micro text-ink-faint uppercase">
            {ONBOARDING_COPY[agent.onboarding]} ·{" "}
            <a href={`/u/${agent.id}`} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              their page ↗
            </a>
          </p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={onFollow}
            aria-pressed={following}
            className={`press micro h-7 rounded-full border px-2.5 whitespace-nowrap uppercase ${following ? "border-[#2bb3a0] text-[#1f8a7b]" : "border-ink/20"}`}
          >
            {following ? "following" : "follow"}
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="press micro h-7 w-7 rounded-full border border-ink/20">
            ✕
          </button>
        </div>
      </header>

      {info?.talkingPairId && (
        <button
          type="button"
          onClick={() => onOpenPair(info.talkingPairId!)}
          className="press micro self-start rounded-full bg-ink px-3 py-1.5 text-paper uppercase"
        >
          read live chat →
        </button>
      )}

      {(agent.vibe || agent.lookingFor) && (
        <p className="text-[13px] leading-5 font-light text-ink/85">{agent.lookingFor || agent.vibe}</p>
      )}

      <div className="flex flex-col gap-1.5">
        <h3 className="micro text-ink-muted uppercase">top keywords</h3>
        {agent.keywords.length ? (
          <ul className="flex flex-col gap-1">
            {agent.keywords.slice(0, 6).map((k) => (
              <li key={k.name} className="grid grid-cols-[1fr_72px_28px] items-center gap-2 text-[11px] lowercase">
                <span className="truncate">{k.name}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-ink/10" aria-hidden>
                  <span className="block h-full rounded-full bg-ink/70" style={{ width: `${Math.round(k.score * 100)}%` }} />
                </span>
                <span className="text-right font-mono text-[10px] text-ink-muted">{k.score.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-ink-muted">not scored yet</p>
        )}
        {agent.interests.length > 0 && (
          <p className="text-[11px] text-ink-muted lowercase">interests: {agent.interests.slice(0, 6).join(" · ")}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="micro text-ink-muted uppercase">dealbreakers</h3>
        {agent.dealbreakerKeywords.length ? (
          <ul className="flex flex-wrap gap-1">
            {agent.dealbreakerKeywords.map((k) => (
              <li key={k} className="rounded-full bg-ember/15 px-2 py-0.5 text-[11px] text-ember-text lowercase">
                {k}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-ink-muted">{agent.scored ? "no dealbreaker keywords" : "not scored yet"}</p>
        )}
        {flags.length > 0 && (
          <p className="text-[11px] text-ember-text lowercase">raised in chats: {flags.join(" · ")}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="micro text-ink-muted uppercase">group</h3>
        {group ? (
          <div className="flex flex-col gap-1 text-[12px]">
            <p>
              {group.label} · {group.score == null ? "unscored" : `${Math.round(group.score)}/10`} · {group.memberIds.length} people
            </p>
            <p className="text-ink-muted">
              with{" "}
              {group.memberIds
                .filter((id) => id !== agent.id)
                .map((id, i, list) => (
                  <span key={id}>
                    <button type="button" className="underline decoration-ink/25 underline-offset-2" onClick={() => onSelectAgent(id)}>
                      {names.get(id) ?? "someone"}
                    </button>
                    {i < list.length - 1 ? ", " : ""}
                  </span>
                ))}
            </p>
            {group.events[0] && <p className="text-ink-muted">first idea: {group.events[0].name}</p>}
          </div>
        ) : (
          <p className="text-[12px] text-ink-muted">
            {data.groups.length ? "unplaced this round (waiting on the B1 bench)" : "groups haven't formed yet"}
          </p>
        )}
      </div>

      {pairs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="micro text-ink-muted uppercase">agent chats</h3>
          <ul className="flex flex-col">
            {pairs.map((p) => {
              const other = p.a === agent.id ? p.b : p.a;
              const conflict = p.dealbreakerFlags.length > 0 || p.logistics === "incompatible";
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onOpenPair(p.id)}
                    className="press flex w-full items-center justify-between gap-2 rounded-sm px-1.5 py-1 text-left text-[12px] hover:bg-ink/5"
                  >
                    <span className="truncate">{names.get(other) ?? "someone"}</span>
                    <span className={`font-mono text-[11px] ${conflict ? "text-ember-text" : "text-ink-muted"}`}>
                      {formatScore(p.vibe)}
                      {conflict ? " · conflict" : p.logistics ? ` · ${p.logistics}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
