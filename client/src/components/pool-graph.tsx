"use client";

import Link from "next/link";
import { useState } from "react";
import type { AdminPair, UniverseGraph } from "@/lib/api";
import { Panel } from "./admin-ui";
import { CountUp } from "./count-up";
import { PoolEdgePanel } from "./pool-edge-panel";
import { PoolGraph2D } from "./pool-graph-2d";
import { formatScore } from "./ui";
import { useOpenPair } from "./use-open-pair";

// Admin pool graph: a draggable 2D graph clustered by group (pool-graph-2d.tsx), with the selected person's or pair's
// panel, everyone, and every group listed beside it.

// The blob palette in globals.css, ember last since it's the accent.
const TINTS = ["#e2b36c", "#a8d6e0", "#8197cf", "#8f8e70", "#e27a50"];

export function PoolGraph({ data, universeId, pair }: { data: UniverseGraph; universeId: string; pair: AdminPair | null }) {
  const [personId, setPersonId] = useState<string | null>(null);
  const pairs = useOpenPair();
  const selectPerson = (id: string | null) => {
    setPersonId(id);
    if (id && pairs.current) pairs.close();
  };
  const tint = new Map(data.groups.map((g, i) => [g.label, TINTS[i % TINTS.length]]));
  const groupOf = new Map(data.people.map((p) => [p.id, p.group]));

  // Each group's members and the average chemistry of the judged pairs inside it.
  const groups = data.groups.map((g) => {
    const members = data.people.filter((p) => p.group === g.label);
    const ids = new Set(members.map((m) => m.id));
    const scores = data.pairs.filter((p) => ids.has(p.a) && ids.has(p.b) && p.vibe_score != null).map((p) => p.vibe_score!);
    return { ...g, members, avg: scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : null };
  });
  const people = [...data.people].sort((a, b) => (a.group ?? "~").localeCompare(b.group ?? "~") || a.full_name.localeCompare(b.full_name));
  const unplaced = data.people.filter((p) => p.unplaced).length;

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
      <Panel className="relative h-[620px] flex-1 overflow-hidden">
        <PoolGraph2D data={data} tints={tint} selected={personId} onPerson={setPersonId} />
        <p className="pointer-events-none absolute bottom-3 left-4 flex gap-4 font-mono text-[9.5px] tracking-label text-ink-muted">
          <span>● in a group</span>
          <span>◌ unplaced</span>
          <span>··· no transcript</span>
          <span>drag to rearrange</span>
        </p>
      </Panel>

      <div className="flex flex-col gap-4 xl:w-[320px] xl:shrink-0">
        {personId && (
          <PersonPanel
            key={personId}
            data={data}
            personId={personId}
            tint={tint}
            onClose={() => setPersonId(null)}
            onPair={(id) => {
              setPersonId(null);
              pairs.open(id);
            }}
          />
        )}
        {!personId && pair && <PoolEdgePanel key={pair.id} pair={pair} groupA={groupOf.get(pair.a.id) ?? null} groupB={groupOf.get(pair.b.id) ?? null} />}
        <Panel className="flex flex-col gap-3 p-5">
          <h2 className="font-mono text-[10px] tracking-meta text-ink-muted">
            ( everyone · {data.people.length}
            {unplaced ? ` · ${unplaced} unplaced` : ""} )
          </h2>
          <ul className="flex max-h-[300px] flex-col overflow-y-auto">
            {people.map((p) => (
              <li key={p.id} className="border-b border-line last:border-b-0">
                <button
                  onClick={() => selectPerson(p.id === personId ? null : p.id)}
                  className={`flex w-full items-center justify-between gap-3 py-2 text-left transition-colors ${p.id === personId ? "text-ember-text" : "hover:text-ink-muted"}`}
                >
                <span className="flex items-center gap-2.5 text-[13px] tracking-[0.04em] lowercase">
                  <span
                    className={`size-2.5 shrink-0 rounded-full ${p.group ? "" : "border border-ink-muted"}`}
                    style={p.group ? { background: tint.get(p.group) } : undefined}
                  />
                  {p.full_name}
                </span>
                <span className={`font-mono text-[10px] tracking-label ${p.group ? "text-ink-muted" : "text-ember-text"}`}>
                  {p.group ?? "unplaced"}
                </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="flex flex-col gap-3 p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono text-[10px] tracking-meta text-ink-muted">( groups · {groups.length} )</h2>
            <Link href={`/admin/universes/${universeId}/groups`} className="font-mono text-[10px] tracking-label text-ink-muted hover:text-ink">
              details →
            </Link>
          </div>
          <ul className="flex flex-col gap-3">
            {groups.map((g) => (
              <li key={g.id} className="flex flex-col gap-1.5 border-b border-line pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-baseline justify-between font-mono text-[10.5px] tracking-label">
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: tint.get(g.label) }} />
                    {g.label} · {g.members.length}
                  </span>
                  <span className="text-ink-muted">chemistry {formatScore(g.avg)}</span>
                </div>
                <p className="text-[13px] leading-[19px] font-light tracking-[0.04em] lowercase">
                  {g.members.map((m) => m.full_name).join(", ")}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

/** One person: their group, how their chats went (counting up), and every agent they met, best first. */
function PersonPanel({
  data,
  personId,
  tint,
  onClose,
  onPair,
}: {
  data: UniverseGraph;
  personId: string;
  tint: Map<string, string>;
  onClose: () => void;
  onPair: (pairId: string) => void;
}) {
  const person = data.people.find((p) => p.id === personId);
  if (!person) return null;
  const names = new Map(data.people.map((p) => [p.id, p]));
  const ties = data.pairs
    .filter((p) => p.a === personId || p.b === personId)
    .map((p) => ({ ...p, other: names.get(p.a === personId ? p.b : p.a) }))
    .sort((x, y) => (y.vibe_score ?? -1) - (x.vibe_score ?? -1));
  const scored = ties.filter((t) => t.vibe_score != null && !t.conflict);
  const avg = scored.length ? scored.reduce((s, t) => s + t.vibe_score!, 0) / scored.length : 0;
  const strong = scored.filter((t) => t.vibe_score! >= 7).length;
  const score = (n: number) => formatScore(n);
  return (
    <aside className="rise-in flex max-h-[620px] flex-col gap-4 overflow-y-auto rounded-[20px] border border-line bg-sheet p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1.5">
          <p className="flex items-center gap-2 font-mono text-[10px] tracking-meta text-ink-muted">
            {person.group ? (
              <span className="pop-in size-2.5 rounded-full" style={{ background: tint.get(person.group) }} />
            ) : (
              <span className="pop-in size-2.5 rounded-full border border-ink-muted" />
            )}
            ( {person.group ?? "unplaced"} )
          </p>
          <h2 className="text-[20px] leading-7 tracking-[0.08em] lowercase">{person.full_name}</h2>
        </div>
        <button onClick={onClose} className="press font-mono text-[11px] text-ink-muted hover:text-ink" aria-label="Close">
          ✕
        </button>
      </div>
      <dl className="grid grid-cols-3 gap-2 border-y border-line py-3">
        <Stat label="agents met" value={<CountUp to={ties.length} />} />
        <Stat label="avg chemistry" value={scored.length ? <CountUp to={avg} format={score} /> : "—"} />
        <Stat label="strong ties" value={<CountUp to={strong} />} />
      </dl>
      <ol className="flex flex-col gap-1">
        {ties.map((t, i) => (
          <li key={t.id} className="rise-in" style={{ animationDelay: `${150 + i * 60}ms` }}>
            <button onClick={() => onPair(t.id)} className="press flex w-full flex-col gap-1.5 rounded-[10px] px-2 py-2 text-left hover:bg-ink/5">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] tracking-[0.04em] lowercase">
                  {t.other?.full_name}
                  <span className="ml-2 font-mono text-[9.5px] tracking-label text-ink-muted">
                    {t.conflict ? "ruled out" : t.other?.group === person.group && person.group ? "same group" : (t.other?.group ?? "unplaced")}
                  </span>
                </span>
                <span className={`font-mono text-[11px] ${t.conflict ? "text-ember-text" : ""}`}>
                  {t.vibe_score != null ? <CountUp to={t.vibe_score} format={score} ms={700 + i * 60} /> : "—"}
                </span>
              </span>
              <span className="h-[3px] overflow-hidden rounded-full bg-ink/8">
                <span
                  className="draw-bar block h-full rounded-full"
                  style={{
                    width: `${((t.vibe_score ?? 0) / 10) * 100}%`,
                    background: t.conflict ? "var(--color-ember)" : "var(--color-ink)",
                    opacity: t.has_transcript ? 0.7 : 0.3,
                    animationDelay: `${200 + i * 60}ms`,
                  }}
                />
              </span>
            </button>
          </li>
        ))}
        {ties.length === 0 && <p className="font-mono text-[10px] tracking-label text-ink-muted">no agent chats</p>}
      </ol>
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dd className="text-[24px] leading-7 font-light tracking-[0.02em]">{value}</dd>
      <dt className="font-mono text-[9px] tracking-label text-ink-muted">{label}</dt>
    </div>
  );
}
