"use client";

// The selected agent, laid out like the "Bio card" on the Paper "World visualizer" page.

import { AgentAvatar } from "./agent-avatar";
import { colorName } from "./character";
import type { AgentInfo } from "./engine";
import { Caption, CloseButton, DotPill, Pill, fitTone, panel } from "./hud";
import type { WorldAgent, WorldData } from "./types";

export function BioCard({
  agent,
  info,
  data,
  className = "",
  onClose,
  onOpenPair,
  onSelectAgent,
}: {
  agent: WorldAgent;
  info: AgentInfo | null;
  data: WorldData;
  className?: string;
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
  const interests = agent.keywords.length
    ? agent.keywords.slice(0, 4).map((k) => ({ name: k.name, score: k.score }))
    : agent.interests.slice(0, 4).map((name) => ({ name, score: null }));

  return (
    <section aria-label={`${agent.name}'s agent`} className={`${panel} flex flex-col gap-4 overflow-y-auto p-[22px] ${className}`}>
      <header className="flex items-center gap-3.5">
        <AgentAvatar userId={agent.id} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="truncate font-sans text-[21px] leading-[26px] font-light tracking-[-0.01em] text-ink">{agent.name}</h2>
          <p className="truncate font-mono text-[9.5px] leading-3 tracking-[0.16em] whitespace-nowrap text-ink-faint">agent · {colorName(agent.id)}</p>
        </div>
        {info && <DotPill dark>{info.state}</DotPill>}
        <CloseButton onClick={onClose} />
      </header>

      <p className="font-mono text-[10px] leading-3 tracking-[0.12em] text-ink-muted">
        {info ? `in ${info.room} · floor ${info.floor}` : "…"}
        {" · "}
        <a href={`/u/${agent.id}`} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          their page ↗
        </a>
      </p>

      {info?.talkingPairId && (
        <button
          type="button"
          onClick={() => onOpenPair(info.talkingPairId!)}
          className="press self-start rounded-full bg-ink px-3 py-1.5 font-mono text-[9.5px] leading-3 tracking-[0.14em] text-paper"
        >
          read live chat →
        </button>
      )}

      <div className="flex flex-col gap-2.5">
        <Caption>{agent.keywords.length ? "top keywords" : "top interests"}</Caption>
        {interests.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {interests.map((k) => (
              <li key={k.name} className="flex items-baseline gap-1.5 rounded-full border border-line px-[11px] py-[5px] font-sans text-[12px] leading-4 text-ink">
                {k.name}
                {k.score !== null && <span className="font-mono text-[9.5px] text-ink-faint">{k.score.toFixed(2)}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-sans text-[13px] text-ink-muted">{agent.onboarding === "complete" ? "not scored yet" : "still onboarding"}</p>
        )}
      </div>

      {agent.lookingFor && (
        <div className="flex flex-col gap-2">
          <Caption>looking for</Caption>
          <p className="font-sans text-[14px] leading-[21px] text-ink">{agent.lookingFor}</p>
        </div>
      )}

      <div className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-white/50 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <Caption>{group ? `${group.label} · ${data.universe.status === "matched" ? "formed" : "forming"}` : "group"}</Caption>
          {group?.score != null && (
            <span className="flex items-baseline gap-1.5">
              <span className="font-sans text-[20px] leading-6 font-light tracking-[0.06em] text-ink">{group.score.toFixed(1)}</span>
              <span className="font-mono text-[9.5px] leading-3 text-ink-faint">group score</span>
            </span>
          )}
        </div>
        {group ? (
          <>
            <p className="font-sans text-[13px] leading-[19px] text-ink-muted">
              {group.memberIds.map((id, i) => (
                <span key={id}>
                  {i > 0 && " · "}
                  <button type="button" onClick={() => onSelectAgent(id)} className={id === agent.id ? "text-ink" : "hover:text-ink"}>
                    {names.get(id) ?? "someone"}
                  </button>
                </span>
              ))}
            </p>
            {group.events[0] &&
              (group.events[0].url ? (
                <a href={group.events[0].url} target="_blank" rel="noreferrer" className="font-sans text-[13px] leading-4 text-ember-text underline underline-offset-2">
                  → {group.events[0].name}
                </a>
              ) : (
                <p className="font-sans text-[13px] leading-4 text-ember-text">→ {group.events[0].name}</p>
              ))}
          </>
        ) : (
          <p className="font-sans text-[13px] leading-[19px] text-ink-muted">
            {data.groups.length ? "unplaced this round, waiting on the B1 bench" : "groups haven't formed yet"}
          </p>
        )}
      </div>

      {pairs.length > 0 && (
        <div className="flex flex-col gap-1">
          <Caption className="pb-1.5">judged pairs</Caption>
          <ul className="flex flex-col">
            {pairs.map((p, i) => {
              const other = p.a === agent.id ? p.b : p.a;
              const conflict = p.dealbreakerFlags.length > 0;
              return (
                <li key={p.id} className={`border-t border-line ${i === pairs.length - 1 ? "border-b" : ""}`}>
                  <button
                    type="button"
                    onClick={() => onOpenPair(p.id)}
                    className="press flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-ink/[0.03]"
                  >
                    <span className="w-[60px] shrink-0 truncate font-sans text-[14px] leading-[18px] text-ink">{names.get(other) ?? "someone"}</span>
                    <span className="w-10 shrink-0 font-sans text-[16px] leading-5 font-light text-ink">{p.vibe == null ? "—" : p.vibe.toFixed(1)}</span>
                    <span className="flex flex-1 justify-end">
                      <Pill tone={fitTone(p.logistics, conflict)}>{conflict ? "incompatible" : (p.logistics ?? "judged")}</Pill>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Caption>dealbreaker keywords</Caption>
        {agent.dealbreakerKeywords.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {agent.dealbreakerKeywords.map((k) => (
              <li key={k}>
                <Pill tone="ember">{k}</Pill>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-sans text-[13px] leading-[19px] text-ink-muted">{agent.scored ? "none flagged" : "not scored yet"}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Caption>dealbreaker flags from judged chats</Caption>
        <p className="font-sans text-[13px] leading-[19px] text-ink">
          {flags.length ? flags.join(" · ") : pairs.length ? "none raised" : "no judged chats yet"}
        </p>
        <p className="font-mono text-[9.5px] leading-3 tracking-[0.12em] text-ink-faint">from the judge&apos;s read of chats, not profile answers</p>
      </div>
    </section>
  );
}
