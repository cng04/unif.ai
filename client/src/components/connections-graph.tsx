"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Connections } from "@/lib/api";
import { Elastic } from "@/lib/elastic";
import { formatScore } from "./ui";
import { useOpenPair } from "./use-open-pair";

// Ego layout in real pixels: you in the middle, your group on an inner ring, other judged matches on an
// outer ellipse, and everyone else in the universe as anonymous pool nodes scattered around the edges.
// It measures its container, so it fills a phone or a desktop window while text stays at design size.
// The layout is only each node's home: nodes sit on springs (lib/elastic.ts), so you can drag them around,
// pan, and zoom, Obsidian-style.

type Node = { id: string; x: number; y: number };

type Layout = {
  W: number;
  H: number;
  C: { x: number; y: number };
  groupR: number;
  outer: { rx: number; ry: number };
  poolMax: number;
  poolEdgeMax: number;
};

function layoutFor(W: number, H: number): Layout {
  const short = Math.min(W, H);
  return {
    W,
    H,
    C: { x: W / 2, y: H / 2 },
    groupR: Math.min(Math.max(short * 0.21, 70), 150),
    outer: { rx: Math.min(W / 2 - 45, H * 0.6), ry: H / 2 - 32 },
    poolMax: Math.round((W * H) / 4300),
    poolEdgeMax: Math.max(120, short * 0.3),
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Stable pseudo-random point for a pool member, kept clear of the inner rings. */
function poolPoint(id: string, { W, H, C, outer }: Layout): Node {
  let h = hash(id);
  for (;;) {
    const x = 16 + ((h % 1000) / 1000) * (W - 32);
    const y = 16 + (((h >>> 10) % 1000) / 1000) * (H - 32);
    if (Math.hypot((x - C.x) / outer.rx, (y - C.y) / outer.ry) > 0.62) return { id, x, y };
    h = hash(String(h));
  }
}

function ring(ids: string[], C: Layout["C"], rx: number, ry: number, startDeg: number): Node[] {
  return ids.map((id, i) => {
    const a = ((startDeg + (i * 360) / ids.length) * Math.PI) / 180;
    return { id, x: C.x + rx * Math.cos(a), y: C.y + ry * Math.sin(a) };
  });
}

export function ConnectionsGraph({ data }: { data: Connections }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className="h-full w-full">
      {size && size.w > 0 && size.h > 0 && (
        // A new size or new people means a new layout, so the simulation starts over.
        <Graph
          key={`${size.w}x${size.h}:${data.connections.length}:${data.others.length}`}
          data={data}
          layout={layoutFor(size.w, size.h)}
        />
      )}
    </div>
  );
}

type View = { x: number; y: number; k: number };
type Point = { x: number; y: number };
type Gesture = {
  pointers: Map<number, Point>;
  start: Point;
  last: Point;
  node: number | null;
  pair: string | null;
  moved: boolean;
  pinch: { d: number; mid: Point; view: View } | null;
};

const ZOOM = { min: 0.5, max: 4 };
const TAP_SLOP = 5;
const clampK = (k: number) => Math.min(Math.max(k, ZOOM.min), ZOOM.max);

/** Home positions (the ego layout) and the springs between them, in canvas pixels. */
function buildLayout(data: Connections, layout: Layout) {
  const { C } = layout;
  const me = data.user.user_id;
  const groupIds = (data.group?.members ?? []).map((m) => m.user_id).filter((id) => id !== me);
  const outerIds = data.connections.filter((c) => !c.in_group).map((c) => c.user_id);
  const homes = new Map<string, Point>([[me, C]]);
  for (const n of ring(groupIds, C, layout.groupR, layout.groupR, -135)) homes.set(n.id, n);
  for (const n of ring(outerIds, C, layout.outer.rx, layout.outer.ry, -55)) homes.set(n.id, n);
  const pool = data.others.filter((id) => !homes.has(id)).slice(0, layout.poolMax).map((id) => poolPoint(id, layout));
  for (const n of pool) homes.set(n.id, n);

  const ids = [...homes.keys()];
  const index = new Map(ids.map((id, i) => [id, i]));
  const inGroup = new Set(groupIds);
  // Pool edges are background texture; long ones would just criss-cross the whole canvas.
  const edges = data.edges.filter((e) => {
    const a = homes.get(e.a);
    const b = homes.get(e.b);
    if (!a || !b) return false;
    return (inGroup.has(e.a) && inGroup.has(e.b)) || Math.hypot(a.x - b.x, a.y - b.y) <= layout.poolEdgeMax;
  });
  const springs = [
    ...data.connections.map((c) => ({ a: 0, b: index.get(c.user_id)! })),
    ...edges.map((e) => ({ a: index.get(e.a)!, b: index.get(e.b)! })),
  ];
  const poolSet = new Set(pool.map((n) => n.id));
  const sim = new Elastic(
    ids.map((id) => [homes.get(id)!.x, homes.get(id)!.y]),
    springs,
    { anchor: 0.012, spring: 0.03, damping: 0.82, radius: ids.map((id, i) => (i === 0 ? 16 : poolSet.has(id) ? 4 : 13)) },
  );
  return { me, groupIds, inGroup, pool: pool.map((n) => n.id), edges, index, sim };
}

function Graph({ data, layout }: { data: Connections; layout: Layout }) {
  const { W, H } = layout;
  const pairs = useOpenPair();
  const [{ me, groupIds, inGroup, pool, edges, index, sim }] = useState(() => buildLayout(data, layout));
  const byUser = new Map(data.connections.map((c) => [c.user_id, c]));
  const groupNames = new Map((data.group?.members ?? []).map((m) => [m.user_id, m.full_name]));

  // Simulation positions, re-read each animation frame while anything is still moving.
  const [points, setPoints] = useState(() => Array.from({ length: sim.n }, (_, i) => sim.get(i)));
  const raf = useRef<number | null>(null);
  const wake = useCallback(() => {
    if (raf.current != null) return;
    const tick = () => {
      const moving = sim.step();
      setPoints(Array.from({ length: sim.n }, (_, i) => sim.get(i)));
      raf.current = moving ? requestAnimationFrame(tick) : null;
    };
    raf.current = requestAnimationFrame(tick);
  }, [sim]);
  useEffect(() => {
    wake();
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, [wake]);

  // Pan and zoom are applied to positions, not as an SVG transform, so text and dots stay at design size
  // and zooming in spreads a crowded patch apart.
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const at = (id: string): Point => {
    const [x, y] = points[index.get(id)!];
    return { x: x * view.k + view.x, y: y * view.k + view.y };
  };
  const toWorld = (p: Point, v: View = view) => [(p.x - v.x) / v.k, (p.y - v.y) / v.k];
  const zoomAt = useCallback((p: Point, factor: number) => {
    setView((v) => {
      const k = clampK(v.k * factor);
      return { k, x: p.x - ((p.x - v.x) * k) / v.k, y: p.y - ((p.y - v.y) * k) / v.k };
    });
  }, []);

  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    // Non-passive, so the wheel zooms the graph instead of scrolling the page.
    const el = svg.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt({ x: e.clientX - r.left, y: e.clientY - r.top }, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const [hovered, setHovered] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  // The open conversation (drawer, `?pair=`) stays lit.
  const active = opening ?? hovered ?? pairs.current;
  // Light the edge first so a tap visibly "lands", then open the conversation in the drawer.
  const open = (pairId: string) => {
    if (opening) return;
    setOpening(pairId);
    setTimeout(() => {
      pairs.open(pairId);
      setOpening(null);
    }, 220);
  };
  const hover = (pairId: string | null) => {
    setHovered(pairId);
    if (pairId) pairs.prefetch(pairId);
  };
  const handlers = (pairId: string) => ({
    onPointerEnter: () => hover(pairId),
    onPointerLeave: () => hover(null),
    onFocus: () => hover(pairId),
    onBlur: () => hover(null),
    onKeyDown: (e: KeyboardEvent<SVGGElement>) => e.key === "Enter" && open(pairId),
  });

  // One gesture handler for the whole canvas: drag a node to pull it (it stays where you drop it), drag the
  // background to pan, pinch or scroll to zoom. A press that barely moves is a tap, which opens a pair.
  const gesture = useRef<Gesture | null>(null);
  const local = (e: PointerEvent<SVGSVGElement>): Point => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const pinchOf = (ps: Point[]) => ({
    d: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) || 1,
    mid: { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 },
  });
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    const p = local(e);
    const target = e.target as Element;
    const g = gesture.current;
    if (g) {
      g.pointers.set(e.pointerId, p);
      if (g.pointers.size === 2) {
        if (g.node != null) sim.release(g.node, true);
        e.currentTarget.setPointerCapture(e.pointerId);
        g.node = null;
        g.moved = true;
        g.pinch = { ...pinchOf([...g.pointers.values()]), view };
      }
      return;
    }
    const node = target.closest("[data-node]")?.getAttribute("data-node");
    gesture.current = {
      pointers: new Map([[e.pointerId, p]]),
      start: p,
      last: p,
      node: node != null ? Number(node) : null,
      pair: target.closest("[data-pair]")?.getAttribute("data-pair") ?? null,
      moved: false,
      pinch: null,
    };
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g?.pointers.has(e.pointerId)) return;
    const p = local(e);
    g.pointers.set(e.pointerId, p);
    if (g.pinch) {
      if (g.pointers.size < 2) return;
      const { d, mid } = pinchOf([...g.pointers.values()]);
      const v0 = g.pinch.view;
      const k = clampK((v0.k * d) / g.pinch.d);
      const [wx, wy] = toWorld(g.pinch.mid, v0);
      setView({ k, x: mid.x - wx * k, y: mid.y - wy * k });
      return;
    }
    if (!g.moved) {
      if (Math.hypot(p.x - g.start.x, p.y - g.start.y) < TAP_SLOP) return;
      g.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      setGrabbing(true);
    }
    if (g.node != null) {
      sim.drag(g.node, toWorld(p));
      wake();
    } else {
      const dx = p.x - g.last.x;
      const dy = p.y - g.last.y;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
    g.last = p;
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g?.pointers.delete(e.pointerId)) return;
    if (g.pointers.size > 0) {
      // Pinch down to one finger: carry on as a pan from here.
      g.pinch = null;
      g.last = [...g.pointers.values()][0];
      return;
    }
    if (g.node != null && g.moved) {
      sim.release(g.node, true);
      wake();
    }
    if (!g.moved && g.pair && e.type === "pointerup") open(g.pair);
    gesture.current = null;
    setGrabbing(false);
  };
  const recenter = () => {
    sim.reset();
    wake();
    setView({ x: 0, y: 0, k: 1 });
  };

  const C = at(me);
  return (
    <div className="relative h-full w-full">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className={`block touch-none overflow-hidden select-none ${grabbing ? "cursor-grabbing" : "cursor-grab"}`}
        role="img"
        aria-label="Your connections"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* Edges between other people: faint in the pool, firmer inside your group. */}
        <g className="fade-in" style={{ animationDelay: "300ms" }}>
          {edges.map((e) => {
            const a = at(e.a);
            const b = at(e.b);
            const within = inGroup.has(e.a) && inGroup.has(e.b);
            return (
              <line
                key={`${e.a}-${e.b}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke="var(--color-ink)"
                strokeWidth={within ? 0.9 : 0.6}
                strokeOpacity={(within ? 0.28 : 0.13) * (active ? 0.5 : 1)}
                strokeLinecap="round"
                className="transition-[stroke-opacity] duration-300"
              />
            );
          })}
        </g>

        {pool.map((id) => {
          const n = at(id);
          return (
            <g key={id} data-node={index.get(id)} className="cursor-grab">
              <circle cx={n.x} cy={n.y} r={9} fill="transparent" />
              <circle
                cx={n.x} cy={n.y} r={2.6}
                fill="var(--color-node-pool)"
                className="pop-in"
                style={{ animationDelay: `${200 + (hash(id) % 600)}ms` }}
              />
            </g>
          );
        })}

        {/* Your edges: each one is a tap target that opens that agent conversation. */}
        {data.connections.map((c, i) => {
          const n = at(c.user_id);
          const on = active === c.pair_id;
          const dim = active && !on;
          return (
            <g key={c.pair_id} data-pair={c.pair_id} className="cursor-pointer" {...handlers(c.pair_id)}>
              {on && (
                <line
                  x1={C.x} y1={C.y} x2={n.x} y2={n.y}
                  stroke="var(--color-ember)"
                  strokeWidth={6}
                  strokeOpacity={0.35}
                  strokeLinecap="round"
                  className="fade-in"
                  style={{ animationDuration: "200ms" }}
                />
              )}
              <line
                x1={C.x} y1={C.y} x2={n.x} y2={n.y}
                pathLength={c.conflict ? undefined : 1}
                stroke={on ? "var(--color-ember-text)" : "var(--color-ink)"}
                strokeWidth={on ? 1.6 : c.in_group ? 1.1 : 0.8}
                strokeOpacity={on ? 0.9 : (c.in_group ? 0.5 : 0.32) * (dim ? 0.45 : 1)}
                strokeDasharray={c.conflict ? "2 4" : undefined}
                strokeLinecap="round"
                className={`transition-[stroke-opacity,stroke-width] duration-200 ${c.conflict ? "fade-in" : "draw-in"}`}
                style={{ animationDelay: `${i * 70}ms` }}
              />
              <line x1={C.x} y1={C.y} x2={n.x} y2={n.y} stroke="transparent" strokeWidth={22} />
            </g>
          );
        })}

        {/* Group members without a judged pair with you still show, just without a score or a link. */}
        {groupIds.map((id, i) => {
          const c = byUser.get(id);
          return (
            <PersonNode
              key={id}
              node={{ id, ...at(id) }}
              nodeIndex={index.get(id)!}
              center={C}
              W={W}
              index={i}
              name={c?.full_name ?? groupNames.get(id) ?? ""}
              detail={c ? formatScore(c.vibe_score) : undefined}
              variant="group"
              active={!!c && active === c.pair_id}
              pairId={c?.pair_id}
              handlers={c ? handlers(c.pair_id) : undefined}
            />
          );
        })}
        {data.connections
          .filter((c) => !c.in_group)
          .map((c, i) => (
            <PersonNode
              key={c.user_id}
              node={{ id: c.user_id, ...at(c.user_id) }}
              nodeIndex={index.get(c.user_id)!}
              center={C}
              W={W}
              index={groupIds.length + i}
              name={c.full_name}
              detail={c.conflict ? "not a fit" : formatScore(c.vibe_score)}
              variant={c.conflict ? "conflict" : "match"}
              active={active === c.pair_id}
              pairId={c.pair_id}
              handlers={handlers(c.pair_id)}
            />
          ))}

        <g data-node={0}>
          <circle cx={C.x} cy={C.y} r={16} fill="transparent" />
          <circle cx={C.x} cy={C.y} r={6.5} fill="none" stroke="var(--color-ember)" strokeWidth={1} className="pulse-ring" />
          <circle cx={C.x} cy={C.y} r={6.5} fill="var(--color-node)" />
          <text x={C.x + 12} y={C.y + 4.5} className="fill-ink font-sans lowercase" style={{ fontSize: 13, letterSpacing: "0.14em" }}>
            me
            <tspan className="fill-ink-muted" style={{ fontWeight: 300 }}> ({data.user.full_name.toLowerCase()})</tspan>
          </text>
        </g>
      </svg>

      <div className="absolute right-2 bottom-2 flex items-center gap-1 rounded-full border border-ink/20 bg-paper/80 p-0.5 backdrop-blur-sm">
        {[
          { label: "zoom out", glyph: "−", run: () => zoomAt({ x: W / 2, y: H / 2 }, 1 / 1.3) },
          { label: "zoom in", glyph: "+", run: () => zoomAt({ x: W / 2, y: H / 2 }, 1.3) },
        ].map((b) => (
          <button
            key={b.label}
            onClick={b.run}
            aria-label={b.label}
            className="press grid size-8 place-items-center rounded-full font-mono text-[15px] hover:bg-ink/5"
          >
            {b.glyph}
          </button>
        ))}
        <button onClick={recenter} className="press micro h-8 rounded-full px-3 hover:bg-ink/5">
          reset
        </button>
      </div>
    </div>
  );
}

type Handlers = {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent<SVGGElement>) => void;
};

function PersonNode({
  node,
  nodeIndex,
  center: C,
  W,
  index,
  name,
  detail,
  variant,
  active,
  pairId,
  handlers,
}: {
  node: Node;
  nodeIndex: number;
  center: Point;
  W: number;
  index: number;
  name: string;
  detail?: string;
  variant: "group" | "match" | "conflict";
  active: boolean;
  pairId?: string;
  handlers?: Handlers;
}) {
  const strong = variant === "group";
  const left = node.x < C.x;
  // Group labels sit beside the node, away from you. Outer labels sit above or below it, centered, and are
  // nudged inward so they never run off the canvas (width estimated from character count).
  const halfWidth = ((name.length + (detail?.length ?? 0) + 1) * 8.6) / 2;
  const x = strong
    ? node.x + (left ? -12 : 12)
    : Math.min(Math.max(node.x, halfWidth + 6), W - halfWidth - 6);
  const y = strong ? node.y + 4.5 : node.y + (node.y > C.y ? 20 : -11);
  const anchor = strong ? (left ? "end" : "start") : "middle";
  return (
    // Outer group bobs gently; inner group pops in once. They're split so the two transforms don't clash.
    <g className="float" style={{ animationDelay: `-${index * 0.8}s`, animationDuration: `${4.5 + (index % 3)}s` }}>
      <g
        className={`pop-in ${handlers ? "cursor-pointer outline-none" : "cursor-grab"}`}
        style={{ animationDelay: `${300 + index * 70}ms` }}
        data-node={nodeIndex}
        data-pair={pairId}
        {...handlers}
        role={handlers ? "link" : undefined}
        tabIndex={handlers ? 0 : undefined}
        aria-label={handlers ? `Read how your agent met ${name}'s agent` : undefined}
      >
        <circle cx={node.x} cy={node.y} r={24} fill="transparent" />
        <circle
          cx={node.x} cy={node.y} r={10}
          fill="var(--color-ember)"
          fillOpacity={active ? 0.35 : 0}
          className="transition-[fill-opacity] duration-200"
        />
        {strong ? (
          <circle cx={node.x} cy={node.y} r={5.5} fill="var(--color-node)" />
        ) : (
          <circle
            cx={node.x} cy={node.y} r={4}
            fill={active ? "var(--color-node)" : "var(--color-paper)"}
            stroke="var(--color-ink)"
            strokeWidth={1.2}
            strokeDasharray={variant === "conflict" ? "2 2" : undefined}
          />
        )}
        <text
          x={x}
          y={y}
          textAnchor={anchor}
          className="font-sans lowercase"
          style={{ fontSize: strong ? 12.5 : 12, letterSpacing: "0.12em", fontWeight: strong || active ? 400 : 300 }}
          fill={strong || active ? "var(--color-ink)" : "var(--color-ink-muted)"}
        >
          {name.toLowerCase()}
          {detail && (
            <tspan
              dx={5}
              className="font-mono"
              style={{ fontSize: 10, letterSpacing: "0.08em", fontWeight: 400 }}
              fill={active ? "var(--color-ember-text)" : strong ? "var(--color-ink-muted)" : "var(--color-ink-faint)"}
            >
              {detail}
            </tspan>
          )}
        </text>
      </g>
    </g>
  );
}
