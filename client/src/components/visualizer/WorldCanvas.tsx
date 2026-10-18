"use client";

// The World page body, laid out like the Paper "World visualizer" page: top bar with live stats, a dark stage with
// the explorable campus (drag to pan, wheel or +/- to zoom), and the pipeline HUD, bio card and dialogue drawer
// floating over it on wide screens (stacked under it on narrow ones). It renders a server snapshot: the layout is
// generated from the universe's keywords, agents act out only what the data says, and the snapshot is polled.

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BioCard } from "./bio-card";
import { DialogueDrawer } from "./dialogue-drawer";
import type { AgentInfo, EngineEvents, WorldEngine } from "./engine";
import { Caption } from "./hud";
import { PipelineHud } from "./pipeline-hud";
import type { ChatLine, Origin } from "./types";
import { deriveActivity, pairKey, provenance } from "./world/activity";
import { planWorld, worldSeed, type WorldPlan } from "./world/plan";
import { selectStructures, type Selection } from "./world/select";
import type { SnapshotPair, Unchanged, WorldSnapshot } from "./world/snapshot";

const WorldStage = dynamic(() => import("./world-stage"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full place-items-center font-mono text-[11px] tracking-[0.16em] text-paper/40">( loading world )</div>
  ),
});

export type MessageState = ChatLine[] | "loading" | "error";

/** Re-planning on every poll would be wasteful and could shift things; plan only when the generation inputs change. */
let lastPlan: { key: string; plan: WorldPlan } | null = null;
function planFor(selection: Selection, seed: number): WorldPlan {
  const key = `${seed}|${selection.structures.map((s) => `${s.id}:${s.tier}`).join(",")}`;
  if (lastPlan?.key !== key) lastPlan = { key, plan: planWorld(selection, seed) };
  return lastPlan.plan;
}

const MIN_TO_MATCH = 4;

export function WorldCanvas({
  initial,
  fetchWorld,
  loadMessages,
  pollSeconds = 4,
  match,
}: {
  initial: WorldSnapshot;
  /** Returns the snapshot, or `{unchanged: true}` when `since` is still current. A server action: keeps secrets off the browser. */
  fetchWorld: (since: string) => Promise<WorldSnapshot | Unchanged>;
  loadMessages: (pairId: string) => Promise<ChatLine[]>;
  pollSeconds?: number;
  /** Admin world only: start or stop a run and watch the sprites react. */
  match?: {
    run: () => Promise<{ error?: string }>;
    abort: () => Promise<{ error?: string }>;
  };
}) {
  const container = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<WorldEngine | null>(null);
  const [snapshot, setSnapshot] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [info, setInfo] = useState<AgentInfo | null>(null);
  const [following, setFollowing] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [status, setStatus] = useState<{ live: string[]; replay: string | null }>({ live: [], replay: null });
  const [drawer, setDrawer] = useState<{ pair: SnapshotPair; replay: boolean } | null>(null);
  const [messages, setMessages] = useState<Record<string, MessageState>>({});
  const requested = useRef(new Set<string>());
  const version = useRef(initial.version);
  const inflight = useRef(false);
  const [matchPending, setMatchPending] = useState(false);
  const [matchError, setMatchError] = useState<string>();

  // ---- data: poll the snapshot (skipping while hidden) ----
  useEffect(() => {
    version.current = snapshot.version;
  }, [snapshot.version]);
  const pull = useCallback(async () => {
    if (inflight.current || document.hidden) return;
    inflight.current = true;
    try {
      const next = await fetchWorld(version.current);
      if (!("unchanged" in next)) {
        setSnapshot(next);
        setNow(Date.now());
      }
    } catch {
      // Transient; the next poll tries again and the last good snapshot stays on screen.
    } finally {
      inflight.current = false;
    }
  }, [fetchWorld]);
  useEffect(() => {
    const seconds = snapshot.universe.status === "matching" ? 2 : pollSeconds;
    const id = setInterval(pull, seconds * 1000);
    return () => clearInterval(id);
  }, [pull, pollSeconds, snapshot.universe.status]);

  // ---- generation and activity (pure, derived from the snapshot) ----
  const selection = useMemo(() => selectStructures(snapshot), [snapshot]);
  const seed = useMemo(() => worldSeed(snapshot.universe.id, snapshot.keywords.map((k) => k.name)), [snapshot]);
  const plan = useMemo(() => planFor(selection, seed), [selection, seed]);
  const activity = useMemo(() => deriveActivity(snapshot, selection, plan, now), [snapshot, selection, plan, now]);
  const members = useMemo(() => new Map(snapshot.members.map((m) => [m.id, m])), [snapshot]);

  useEffect(() => {
    engine?.setWorld(snapshot, plan, activity);
  }, [engine, snapshot, plan, activity]);
  useEffect(() => {
    engine?.setSpeed(speed);
  }, [engine, speed]);
  // A participant's own agent is followed when the world opens (they can look around any time).
  const viewer = snapshot.viewer;
  const followedViewer = useRef(false);
  useEffect(() => {
    if (!engine || !viewer || followedViewer.current || !members.has(viewer)) return;
    followedViewer.current = true;
    engine.select(viewer, true);
  }, [engine, viewer, members]);
  useEffect(() => {
    if (!engine || !selectedId) return;
    const id = setInterval(() => setInfo(engine.info(selectedId)), 300);
    return () => clearInterval(id);
  }, [engine, selectedId]);

  // ---- conversations ----
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
  const openPair = useCallback(
    (pair: SnapshotPair, replay = false) => {
      if (!pair.id) return;
      setDrawer({ pair, replay });
      if (pair.status === "complete" || snapshot.viewer == null) ensureMessages(pair.id);
    },
    [ensureMessages, snapshot.viewer],
  );
  const livePairId = drawer?.pair.status === "running" ? drawer.pair.id : null;
  useEffect(() => {
    if (!livePairId || snapshot.viewer) return;
    let stop = false;
    const pull = () => {
      loadMessages(livePairId).then(
        (lines) => {
          if (!stop) setMessages((m) => ({ ...m, [livePairId]: lines }));
        },
        () => {
          if (!stop) setMessages((m) => ({ ...m, [livePairId]: "error" }));
        },
      );
    };
    const id = setInterval(pull, 2000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [livePairId, loadMessages, snapshot.viewer]);

  const events = useRef<EngineEvents>({ onSelect: () => {}, onFollow: () => {}, onStatus: () => {} });
  useLayoutEffect(() => {
    events.current = {
      onSelect: (id) => {
        setSelectedId(id);
        const next = id && engine ? engine.info(id) : null;
        setInfo(next);
        // Selecting someone mid-chat opens that conversation.
        const pair = next?.talkingPair ? snapshot.pairs.find((p) => pairKey(p) === next.talkingPair) : undefined;
        if (pair) openPair(pair, next?.replaying);
      },
      onFollow: setFollowing,
      onStatus: (s) =>
        setStatus((prev) =>
          prev.replay === s.replay && prev.live.length === s.live.length && prev.live.every((k, i) => k === s.live[i]) ? prev : s,
        ),
    };
  }, [engine, snapshot, openPair]);

  const selected = selectedId ? (members.get(selectedId) ?? null) : null;
  const drawerPair = drawer ? (snapshot.pairs.find((p) => p.id === drawer.pair.id) ?? drawer.pair) : null;
  const drawerOrigin: Origin | null = drawerPair
    ? status.replay && status.replay === pairKey(drawerPair)
      ? "replay"
      : provenance(drawerPair, now)
    : null;

  const onboarded = snapshot.members.filter((m) => m.onboarding === "complete").length;
  const startMatch = async () => {
    if (!match) return;
    if (snapshot.universe.status === "matched" && !window.confirm("Re-run matching? This replaces every pair, chat and group.")) return;
    setMatchPending(true);
    setMatchError(undefined);
    const result = await match.run();
    setMatchPending(false);
    if (result.error) setMatchError(result.error);
    else await pull();
  };
  const stopMatch = async () => {
    if (!match || !window.confirm("Abort matching? The run stops, its chats so far are deleted, and the universe goes back to onboarding.")) return;
    setMatchPending(true);
    setMatchError(undefined);
    const result = await match.abort();
    setMatchPending(false);
    if (result.error) setMatchError(result.error);
    else await pull();
  };

  const hud = (
    <PipelineHud
      stage={activity.stage}
      speed={speed}
      following={following}
      canFollow={Boolean(selected)}
      onSpeed={setSpeed}
      onFollow={(on) => (on && selected ? engine?.select(selected.id, true) : engine?.setFollow(false))}
      match={
        match && {
          running: snapshot.universe.status === "matching",
          ready: onboarded >= MIN_TO_MATCH,
          needed: MIN_TO_MATCH,
          pending: matchPending,
          error: matchError,
          onRun: startMatch,
          onAbort: stopMatch,
        }
      }
      className="xl:absolute xl:top-5 xl:right-5 xl:w-[460px]"
    />
  );
  const bio = selected && (
    <BioCard
      member={selected}
      snapshot={snapshot}
      info={info}
      now={now}
      onClose={() => engine?.select(null)}
      onOpenPair={(p) => openPair(p)}
      onSelectAgent={(id) => engine?.select(id)}
      className="xl:absolute xl:bottom-5 xl:left-5 xl:max-h-[calc(100%-116px)] xl:w-[340px]"
    />
  );
  const dialogue = drawerPair && drawerOrigin && (
    <DialogueDrawer
      pair={drawerPair}
      origin={drawerOrigin}
      members={members}
      messages={drawerPair.id ? messages[drawerPair.id] : undefined}
      onClose={() => {
        engine?.stopReplay();
        setDrawer(null);
      }}
      onRetry={() => drawerPair.id && ensureMessages(drawerPair.id)}
      onReplay={drawerPair.status === "complete" ? () => engine?.startReplay(pairKey(drawerPair), drawerPair.a, drawerPair.b) : undefined}
      onSelectAgent={(id) => engine?.select(id)}
      className="max-h-[640px] xl:absolute xl:right-5 xl:bottom-5 xl:max-h-[calc(100%-232px)] xl:w-[400px]"
    />
  );

  return (
    <div className="flex w-full flex-col gap-6">
      <TopBar snapshot={snapshot} live={activity.live.length} />

      {/* One copy of each card: floating over the canvas on wide screens, stacked under it on narrow ones. */}
      <div className="relative flex flex-col gap-4">
        <div
          className="relative h-[72vh] min-h-[520px] w-full overflow-hidden rounded-[18px] bg-[#1F1D19] xl:min-h-[780px]"
          style={{ backgroundImage: "radial-gradient(circle farthest-corner at 50% 40%, #3a3631 0%, #2b2824 70%)" }}
        >
          <div ref={container} className="absolute inset-0 [image-rendering:pixelated]">
            <WorldStage container={container} events={events} onReady={setEngine} />
          </div>

          <div className="absolute top-5 left-5 flex flex-col gap-2">
            <Caption className="pl-1.5 text-paper/60">view</Caption>
            <div className="flex items-center gap-0.5 rounded-full border border-white/50 bg-[#FBFAF7E6] p-1" role="group" aria-label="Zoom">
              {(
                [
                  ["−", "Zoom out", () => engine?.zoomBy(1 / 1.3)],
                  ["+", "Zoom in", () => engine?.zoomBy(1.3)],
                  ["reset", "Reset view", () => engine?.resetView()],
                ] as const
              ).map(([label, aria, run]) => (
                <button
                  key={label}
                  type="button"
                  aria-label={aria}
                  onClick={run}
                  className="press min-w-9 rounded-full px-3 py-[9px] font-mono text-[11px] leading-[14px] tracking-[0.14em] text-ink-muted hover:bg-ink/5"
                >
                  {label}
                </button>
              ))}
              {viewer && (
                <button
                  type="button"
                  aria-label="Follow my agent"
                  onClick={() => engine?.select(viewer, true)}
                  className="press rounded-full bg-ink px-3 py-[9px] font-mono text-[11px] leading-[14px] tracking-[0.14em] text-paper"
                >
                  follow me
                </button>
              )}
            </div>
          </div>

          {snapshot.members.length === 0 && (
            <p className="absolute inset-0 grid place-items-center font-mono text-[11px] tracking-[0.16em] text-paper/50">( nobody has joined yet )</p>
          )}
        </div>
        {hud}
        {bio}
        {dialogue}
      </div>

      <Caption>drag to explore · scroll or +/− to zoom · click an agent to follow it · click a talking agent to read the chat</Caption>
    </div>
  );
}

function TopBar({ snapshot, live }: { snapshot: WorldSnapshot; live: number }) {
  const { status, name, is_demo: demo } = snapshot.universe;
  const dot = status === "matching" ? "bg-ember" : status === "matched" ? "bg-ink" : "bg-ink-faint";
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
      <div className="flex flex-wrap items-center gap-5">
        <div className="flex flex-col gap-[3px]">
          <Caption>universe</Caption>
          <h1 className="font-sans text-[16px] leading-5 font-medium text-ink">{name}</h1>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-line bg-sheet px-3.5 py-[7px] font-mono text-[11px] leading-[14px] tracking-[0.14em] text-ink">
          <span className={`size-[7px] rounded-full ${dot} ${status === "matching" ? "animate-pulse" : ""}`} />
          {status}
        </span>
        {demo && (
          <span className="rounded-full border border-dashed border-ink/40 px-3 py-[6px] font-mono text-[10px] leading-3 tracking-[0.14em] text-ink-muted">
            demo data
          </span>
        )}
      </div>
      <dl className="flex items-center gap-9">
        <Stat value={snapshot.members.length} label="agents" />
        <Stat value={live} label="chats live" />
        <Stat value={snapshot.groups.length} label="groups" accent />
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
