"use client";

// The selected agent, laid out like the "Bio card" on the Paper "World visualizer" page. It only shows what the
// snapshot carries: admins get scores, keyword dealbreakers and the judge's flags; a participant's view has none
// of those fields, so those sections simply don't appear.

import { AgentAvatar } from "./agent-avatar";
import { colorName } from "./character";
import type { AgentInfo } from "./engine";
import { Caption, CloseButton, DotPill, Pill, fitTone, panel } from "./hud";
import { provenance } from "./world/activity";
import type { SnapshotMember, SnapshotPair, WorldSnapshot } from "./world/snapshot";

export function BioCard({
  member,
  snapshot,
  info,
  now,
  className = "",
  onClose,
  onOpenPair,
  onSelectAgent,
}: {
  member: SnapshotMember;
  snapshot: WorldSnapshot;
  info: AgentInfo | null;
  now: number;
  className?: string;
  onClose: () => void;
  onOpenPair: (pair: SnapshotPair) => void;
  onSelectAgent: (id: string) => void;
}) {
  const names = new Map(snapshot.members.map((m) => [m.id, m.name]));
  const mine = snapshot.pairs.filter((p) => p.a === member.id || p.b === member.id);
  const group = snapshot.groups.find((g) => g.member_ids.includes(member.id)) ?? null;
  const flags = [...new Set(mine.flatMap((p) => p.dealbreaker_flags ?? []))];
  const isViewer = snapshot.viewer === member.id;
  const topScores = member.scores
    ? Object.entries(member.scores).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, score]) => ({ name, score }))
    : member.top_keywords.map((name) => ({ name, score: null as number | null }));
  const busyLine =
    member.onboarding !== "complete" ? (member.busy ? "talking to their interviewer" : "still onboarding") : null;

  return (
    <section aria-label={`${member.name}'s agent`} className={`${panel} flex flex-col gap-4 overflow-y-auto p-[22px] ${className}`}>
      <header className="flex items-center gap-3.5">
        <AgentAvatar userId={member.id} look={member.look} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="truncate font-sans text-[21px] leading-[26px] font-light tracking-[-0.01em] text-ink">
            {member.name}
            {isViewer && <span className="ml-2 font-mono text-[10px] tracking-[0.14em] text-ember-text">you</span>}
          </h2>
          <p className="truncate font-mono text-[9.5px] leading-3 tracking-[0.16em] whitespace-nowrap text-ink-faint">agent · {colorName(member.id)}</p>
        </div>
        {info && <DotPill dark>{info.state}</DotPill>}
        <CloseButton onClick={onClose} />
      </header>

      <p className="font-mono text-[10px] leading-3 tracking-[0.12em] text-ink-muted">
        {info ? `in ${info.zone}` : "…"}
        {busyLine && ` · ${busyLine}`}
        {snapshot.viewer === null && (
          <>
            {" · "}
            <a href={`/u/${member.id}`} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              their page ↗
            </a>
          </>
        )}
      </p>

      {info?.talkingPair && (
        <p className="font-mono text-[9.5px] leading-3 tracking-[0.14em] text-ink-muted">
          {info.replaying ? "replaying a completed chat" : "talking now"}
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        <Caption>{member.scores ? "top keywords" : "keywords"}</Caption>
        {topScores.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {topScores.map((k) => (
              <li key={k.name} className="flex items-baseline gap-1.5 rounded-full border border-line px-[11px] py-[5px] font-sans text-[12px] leading-4 text-ink">
                {k.name}
                {k.score !== null && <span className="font-mono text-[9.5px] text-ink-faint">{k.score.toFixed(2)}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-sans text-[13px] text-ink-muted">{member.scored ? "no strong keywords" : "not scored yet"}</p>
        )}
      </div>

      {member.looking_for && (
        <div className="flex flex-col gap-2">
          <Caption>looking for</Caption>
          <p className="font-sans text-[14px] leading-[21px] text-ink">{member.looking_for}</p>
        </div>
      )}

      <div className="flex flex-col gap-2.5 rounded-[18px] border border-line bg-white/50 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <Caption>{group ? `${group.label ?? "group"} · ${snapshot.universe.status === "matched" ? "formed" : "forming"}` : "group"}</Caption>
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
              {group.member_ids.map((id, i) => (
                <span key={id}>
                  {i > 0 && " · "}
                  <button type="button" onClick={() => onSelectAgent(id)} className={id === member.id ? "text-ink" : "hover:text-ink"}>
                    {names.get(id) ?? "someone"}
                  </button>
                </span>
              ))}
            </p>
            {group.events?.[0] && <p className="font-sans text-[13px] leading-4 text-ember-text">→ {group.events[0].name}</p>}
          </>
        ) : (
          <p className="font-sans text-[13px] leading-[19px] text-ink-muted">
            {snapshot.groups.length ? "not in a group this round" : "groups haven't formed yet"}
          </p>
        )}
      </div>

      {mine.length > 0 && (
        <div className="flex flex-col gap-1">
          <Caption className="pb-1.5">chats</Caption>
          <ul className="flex flex-col">
            {mine.map((p, i) => {
              const other = p.a === member.id ? p.b : p.a;
              const origin = provenance(p, now);
              const conflict = (p.dealbreaker_flags?.length ?? 0) > 0;
              return (
                <li key={p.id ?? `${p.a}:${p.b}`} className={`border-t border-line ${i === mine.length - 1 ? "border-b" : ""}`}>
                  <button
                    type="button"
                    disabled={!p.id}
                    onClick={() => onOpenPair(p)}
                    className="press flex w-full items-center gap-3 px-1 py-2.5 text-left enabled:hover:bg-ink/[0.03]"
                  >
                    <span className="w-[60px] shrink-0 truncate font-sans text-[14px] leading-[18px] text-ink">{names.get(other) ?? "someone"}</span>
                    <span className="w-10 shrink-0 font-sans text-[16px] leading-5 font-light text-ink">
                      {p.vibe == null ? "—" : p.vibe.toFixed(1)}
                    </span>
                    <span className="flex flex-1 justify-end gap-1.5">
                      {p.status === "running" ? (
                        <Pill tone="ember">live</Pill>
                      ) : p.logistics ? (
                        <Pill tone={fitTone(p.logistics, conflict)}>{conflict ? "incompatible" : p.logistics}</Pill>
                      ) : (
                        <Pill tone="outline">{origin}</Pill>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {member.dealbreakers && (
        <div className="flex flex-col gap-2">
          <Caption>dealbreaker keywords</Caption>
          {member.dealbreakers.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {member.dealbreakers.map((k) => (
                <li key={k}>
                  <Pill tone="ember">{k}</Pill>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-sans text-[13px] leading-[19px] text-ink-muted">{member.scored ? "none flagged" : "not scored yet"}</p>
          )}
        </div>
      )}

      {snapshot.viewer === null && (
        <div className="flex flex-col gap-2">
          <Caption>dealbreaker flags from judged chats</Caption>
          <p className="font-sans text-[13px] leading-[19px] text-ink">{flags.length ? flags.join(" · ") : mine.length ? "none raised" : "no judged chats yet"}</p>
          <p className="font-mono text-[9.5px] leading-3 tracking-[0.12em] text-ink-faint">from the judge&apos;s read of chats, not profile answers</p>
        </div>
      )}
    </section>
  );
}
