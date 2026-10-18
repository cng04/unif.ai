"use client";

// The agent world page body, laid out like the Paper "World visualizer" page: a top bar with live stats, the
// dark canvas stage with the floor selector, pipeline HUD, bio card and dialogue drawer floating over it on
// wide screens, and the same cards stacked under the canvas on narrow ones.

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BioCard } from "./bio-card";
import { availablePhases } from "./director";
import { DialogueDrawer } from "./dialogue-drawer";
import type { AgentInfo, EngineEvents, WorldEngine } from "./engine";
import { Caption, Segmented } from "./hud";
import { FLOOR_GAP, FLOOR_H, FLOOR_W, type FloorId } from "./layout";
import { PipelineHud } from "./pipeline-hud";
import type { ChatLine, Phase, ViewMode, WorldData } from "./types";

const WorldStage = dynamic(() => import("./world-stage"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center font-mono text-[11px] tracking-[0.16em] text-paper/40">( loading world )</div>
  ),
});

export type MessageState = ChatLine[] | "loading" | "error";

const FLOOR_BUTTONS = ["B1", "L1", "L2"] as const;

/** The 2.5D pixel world for one universe: three open floors where agents act out the matching run. */
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

  const openPair = (pairId: string) => {
    setDrawerPairId(pairId);
    ensureMessages(pairId);
  };

  const hud = (
    <PipelineHud
      phase={phase}
      view={view}
      available={available}
      speed={speed}
      following={following}
      canFollow={Boolean(selected)}
      onView={setView}
      onSpeed={setSpeed}
      onFollow={(on) => (on && selected ? engine?.select(selected.id, true) : engine?.setFollow(false))}
      className="xl:absolute xl:top-5 xl:right-5 xl:w-[520px]"
    />
  );
  const bio = selected && (
    <BioCard
      agent={selected}
      info={info}
      data={data}
      onClose={() => engine?.select(null)}
      onOpenPair={openPair}
      onSelectAgent={(id) => engine?.select(id)}
      className="xl:absolute xl:bottom-5 xl:left-5 xl:max-h-[calc(100%-116px)] xl:w-[340px]"
    />
  );
  const drawer = drawerPair && (
    <DialogueDrawer
      pair={drawerPair}
      agentsById={agentsById}
      messages={messages[drawerPair.id]}
      live={talking.includes(drawerPair.id)}
      onClose={() => setDrawerPairId(null)}
      onRetry={() => ensureMessages(drawerPair.id)}
      onSelectAgent={(id) => engine?.select(id)}
      className="max-h-[640px] xl:absolute xl:right-5 xl:bottom-5 xl:max-h-[calc(100%-264px)] xl:w-[400px]"
    />
  );

  return (
    <div className="flex w-full flex-col gap-6">
      <TopBar data={data} talking={talking.length} />

      {/* One copy of each card: floating over the canvas on wide screens, stacked under it on narrow ones. */}
      <div className="relative flex flex-col gap-4">
        <div
          className="relative w-full overflow-hidden rounded-[18px] bg-[#1F1D19] xl:min-h-[780px]"
          style={{
            aspectRatio: `${FLOOR_W} / ${FLOOR_H + FLOOR_GAP * 1.5}`,
            backgroundImage: "radial-gradient(circle farthest-corner at 50% 40%, #3a3631 0%, #2b2824 70%)",
          }}
        >
          <div ref={container} className="absolute inset-0 [image-rendering:pixelated]">
            <WorldStage container={container} events={events} onReady={setEngine} />
          </div>

          <div className="absolute top-5 left-5 flex flex-col gap-2">
            <Caption className="pl-1.5 text-paper/60">floor</Caption>
            <div className="rounded-full border border-white/50 bg-[#FBFAF7E6]">
              <Segmented options={FLOOR_BUTTONS} value={floor} onChange={(f) => engine?.goToFloor(f)} label="Floor" />
            </div>
          </div>

          {data.agents.length === 0 && (
            <p className="absolute inset-0 grid place-items-center font-mono text-[11px] tracking-[0.16em] text-paper/50">( nobody has joined yet )</p>
          )}
        </div>
        {hud}
        {bio}
        {drawer}
      </div>

      <Caption>scroll or drag to change floors · click an agent to follow it · click a talking agent to read the chat</Caption>
    </div>
  );
}

function TopBar({ data, talking }: { data: WorldData; talking: number }) {
  const { status, name } = data.universe;
  const dot = status === "matching" ? "bg-ember" : status === "matched" ? "bg-ink" : "bg-ink-faint";
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
      <div className="flex items-center gap-5">
        <div className="flex flex-col gap-[3px]">
          <Caption>universe</Caption>
          <h1 className="font-sans text-[16px] leading-5 font-medium text-ink">{name}</h1>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-line bg-sheet px-3.5 py-[7px] font-mono text-[11px] leading-[14px] tracking-[0.14em] text-ink">
          <span className={`size-[7px] rounded-full ${dot} ${status === "matching" ? "animate-pulse" : ""}`} />
          {status}
        </span>
      </div>
      <dl className="flex items-center gap-9">
        <Stat value={data.agents.length} label="agents" />
        <Stat value={talking} label="chats live" />
        <Stat value={data.groups.length} label="groups" accent />
      </dl>
    </header>
  );
}

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <dd className={`font-sans text-[20px] leading-6 font-light tracking-[0.06em] ${accent ? "text-ember-text" : "text-ink"}`}>{value}</dd>
      <dt className="font-mono text-[9.5px] leading-3 tracking-[0.16em] text-ink-faint">{label}</dt>
    </div>
  );
}
