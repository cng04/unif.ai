"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BioCard } from "./bio-card";
import { availablePhases, PHASES } from "./director";
import { DialogueDrawer } from "./dialogue-drawer";
import type { AgentInfo, EngineEvents, WorldEngine } from "./engine";
import { FLOOR_GAP, FLOOR_H, FLOOR_W, type FloorId } from "./layout";
import type { ChatLine, Phase, ViewMode, WorldData } from "./types";

const WorldStage = dynamic(() => import("./world-stage"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center micro text-paper/60">loading world…</div>,
});

export type MessageState = ChatLine[] | "loading" | "error";

const PHASE_LABEL: Record<Phase, string> = { lounge: "joined", rooms: "scored", chats: "chatting", groups: "grouped" };
const FLOOR_BUTTONS: FloorId[] = ["B1", "L1", "L2"];
const SPEEDS = [1, 2, 4];

/** The 2.5D pixel world for one universe: three floors of rooms where agents act out the matching run. */
export function WorldCanvas({
  data,
  loadMessages,
}: {
  data: WorldData;
  loadMessages: (pairId: string) => Promise<ChatLine[]>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<WorldEngine | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [info, setInfo] = useState<AgentInfo | null>(null);
  const [following, setFollowing] = useState(false);
  const [floor, setFloor] = useState<FloorId>("L1");
  const [phase, setPhase] = useState<Phase>("lounge");
  const [talking, setTalking] = useState<string[]>([]);
  const [view, setView] = useState<ViewMode>("auto");
  const [speed, setSpeed] = useState(1);
  const [drawerPairId, setDrawerPairId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, MessageState>>({});
  const requested = useRef(new Set<string>());

  const ensureMessages = useCallback(
    (pairId: string) => {
      if (requested.current.has(pairId)) return;
      requested.current.add(pairId);
      setMessages((m) => ({ ...m, [pairId]: "loading" }));
      loadMessages(pairId).then(
        (lines) => setMessages((m) => ({ ...m, [pairId]: lines })),
        () => {
          requested.current.delete(pairId);
          setMessages((m) => ({ ...m, [pairId]: "error" }));
        },
      );
    },
    [loadMessages],
  );

  const events = useRef<EngineEvents>({
    onSelect: () => {},
    onFloor: () => {},
    onFollow: () => {},
    onStatus: () => {},
    onNeedMessages: () => {},
  });
  useLayoutEffect(() => {
    events.current = {
      onSelect: (id) => {
        setSelectedId(id);
        const next = id && engine ? engine.info(id) : null;
        setInfo(next);
        // Clicking someone mid-conversation opens that conversation.
        if (next?.talkingPairId) {
          setDrawerPairId(next.talkingPairId);
          ensureMessages(next.talkingPairId);
        }
      },
      onFloor: setFloor,
      onFollow: setFollowing,
      onStatus: (s) => {
        setPhase(s.phase);
        setTalking((prev) => (prev.length === s.talking.length && prev.every((id, i) => id === s.talking[i]) ? prev : s.talking));
      },
      onNeedMessages: ensureMessages,
    };
  }, [engine, ensureMessages]);

  useEffect(() => {
    engine?.setData(data);
  }, [engine, data]);
  useEffect(() => {
    engine?.setView(view);
  }, [engine, view]);
  useEffect(() => {
    engine?.setSpeed(speed);
  }, [engine, speed]);
  useEffect(() => {
    if (!engine) return;
    for (const [pairId, lines] of Object.entries(messages)) if (Array.isArray(lines)) engine.setMessages(pairId, lines);
  }, [engine, messages]);
  useEffect(() => {
    if (!engine || !selectedId) return;
    const id = setInterval(() => setInfo(engine.info(selectedId)), 300);
    return () => clearInterval(id);
  }, [engine, selectedId]);

  const available = useMemo(() => availablePhases(data), [data]);
  const agentsById = useMemo(() => new Map(data.agents.map((a) => [a.id, a])), [data]);
  const selected = selectedId ? agentsById.get(selectedId) ?? null : null;
  const drawerPair = drawerPairId ? data.pairs.find((p) => p.id === drawerPairId) ?? null : null;
  const grouped = new Set(data.groups.flatMap((g) => g.memberIds));
  const unplaced = data.groups.length ? data.agents.filter((a) => !grouped.has(a.id)).length : 0;

  const openPair = (pairId: string) => {
    setDrawerPairId(pairId);
    ensureMessages(pairId);
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-full border border-line bg-white/50 p-1" role="group" aria-label="Floor">
          {FLOOR_BUTTONS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => engine?.goToFloor(f)}
              aria-pressed={floor === f}
              className={`press h-8 min-w-11 rounded-full px-3 font-mono text-label tracking-label ${floor === f ? "bg-ink text-paper" : "hover:bg-ink/5"}`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-full border border-line bg-white/50 p-1" role="group" aria-label="Pipeline stage">
            <button
              type="button"
              onClick={() => setView("auto")}
              aria-pressed={view === "auto"}
              className={`press flex h-8 items-center gap-1.5 rounded-full px-3 micro uppercase ${view === "auto" ? "bg-ink text-paper" : "hover:bg-ink/5"}`}
            >
              {data.universe.status === "matching" && <span className="size-1.5 animate-pulse rounded-full bg-ember" />}
              live
            </button>
            {PHASES.map((p, i) => {
              const enabled = available.includes(p);
              const active = phase === p;
              return (
                <button
                  key={p}
                  type="button"
                  disabled={!enabled}
                  onClick={() => setView(p)}
                  aria-pressed={view === p}
                  title={enabled ? `Replay: ${PHASE_LABEL[p]}` : "No data for this stage yet"}
                  className={`press h-8 rounded-full px-3 micro uppercase disabled:opacity-35 ${
                    view === p ? "bg-ink text-paper" : active ? "text-ember-text" : "hover:bg-ink/5"
                  }`}
                >
                  {i + 1}·{PHASE_LABEL[p]}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1 rounded-full border border-line bg-white/50 p-1" role="group" aria-label="Speed">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                aria-pressed={speed === s}
                className={`press h-8 min-w-10 rounded-full px-2 font-mono text-label ${speed === s ? "bg-ink text-paper" : "hover:bg-ink/5"}`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative">
        <div
          ref={container}
          className="relative max-h-[80vh] w-full overflow-hidden rounded-md border border-line bg-[#1f1c19] [image-rendering:pixelated]"
          style={{ aspectRatio: `${FLOOR_W} / ${FLOOR_H + FLOOR_GAP * 1.5}` }}
        >
          <WorldStage container={container} events={events} onReady={setEngine} />
          <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-1.5">
            <span className="micro rounded-full bg-black/45 px-2.5 py-1 text-paper uppercase">
              {data.agents.length} agents · {talking.length} talking · {data.groups.length} groups
              {unplaced ? ` · ${unplaced} unplaced` : ""}
            </span>
            {following && selected && (
              <span className="micro pointer-events-auto flex items-center gap-2 self-start rounded-full bg-black/45 px-2.5 py-1 text-[#7cffea] uppercase">
                following {selected.name}
                <button type="button" className="underline" onClick={() => engine?.setFollow(false)}>
                  release
                </button>
              </span>
            )}
          </div>
          {data.agents.length === 0 && (
            <div className="absolute inset-0 grid place-items-center">
              <p className="micro rounded-full bg-black/45 px-3 py-1.5 text-paper uppercase">nobody has joined yet</p>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-3 md:pointer-events-none md:absolute md:inset-3 md:mt-0 md:flex-row md:items-end md:justify-between">
          {selected ? (
            <BioCard
              agent={selected}
              info={info}
              data={data}
              following={following}
              onFollow={() => {
                engine?.select(selected.id, true);
              }}
              onClose={() => engine?.select(null)}
              onOpenPair={openPair}
              onSelectAgent={(id) => engine?.select(id)}
            />
          ) : (
            <span />
          )}
          {drawerPair && (
            <DialogueDrawer
              pair={drawerPair}
              agentsById={agentsById}
              messages={messages[drawerPair.id]}
              live={talking.includes(drawerPair.id)}
              onClose={() => setDrawerPairId(null)}
              onRetry={() => ensureMessages(drawerPair.id)}
              onSelectAgent={(id) => engine?.select(id)}
            />
          )}
        </div>
      </div>

      <p className="micro text-ink/60">
        scroll or drag to change floors · click an agent to follow it · click a talking agent to read the chat
      </p>
    </div>
  );
}
