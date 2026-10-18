"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { UniverseGraph } from "@/lib/api";
import { Elastic } from "@/lib/elastic";
import { useOpenPair } from "./use-open-pair";

// Admin pool graph, drawn like the connections page's 2D graph: each group's members on a small ring around their
// group's centre with a soft blurred blob of the group's colour behind them, unplaced people around the edge, and
// every judged pair as a line (dotted when no transcript was stored). Nodes sit on springs (lib/elastic.ts), so you can drag them, pan, and zoom. Clicking a
// line sets `?pair=` and the page renders that pair's panel; tapping a person selects them (`onPerson`).

type Point = { x: number; y: number };
type View = { x: number; y: number; k: number };
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

type Props = { data: UniverseGraph; tints: Map<string, string>; selected: string | null; onPerson: (id: string | null) => void };

export function PoolGraph2D(props: Props) {
  const { data } = props;
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
        <Graph key={`${size.w}x${size.h}:${data.people.length}:${data.pairs.length}`} {...props} W={size.w} H={size.h} />
      )}
    </div>
  );
}

/** Home positions in canvas pixels: group centres on a circle, members ringed around them, unplaced on an outer ellipse. */
function buildLayout(data: UniverseGraph, W: number, H: number) {
  const C = { x: W / 2, y: H / 2 };
  const ring = (n: number, i: number, c: Point, rx: number, ry: number, start: number): Point => {
    const a = start + (i / Math.max(n, 1)) * Math.PI * 2;
    return { x: c.x + Math.cos(a) * rx, y: c.y + Math.sin(a) * ry };
  };
  const homes = new Map<string, Point>();
  const spread = data.groups.length > 1 ? Math.min(W, H) * 0.3 : 0;
  data.groups.forEach((g, gi) => {
    const centre = ring(data.groups.length, gi, C, spread * 1.25, spread, Math.PI / 4);
    const members = data.people.filter((p) => p.group === g.label);
    const r = 30 + 5 * members.length;
    members.forEach((m, i) => homes.set(m.id, ring(members.length, i, centre, r, r, -Math.PI / 2)));
  });
  const rest = data.people.filter((p) => !p.group);
  rest.forEach((p, i) => homes.set(p.id, ring(rest.length, i, C, W / 2 - 70, H / 2 - 40, -Math.PI / 2 + 0.3)));

  const ids = [...homes.keys()];
  const index = new Map(ids.map((id, i) => [id, i]));
  const edges = data.pairs.filter((p) => !p.conflict && index.has(p.a) && index.has(p.b));
  const sim = new Elastic(
    ids.map((id) => [homes.get(id)!.x, homes.get(id)!.y]),
    edges.map((e) => ({ a: index.get(e.a)!, b: index.get(e.b)! })),
    { anchor: 0.012, spring: 0.03, damping: 0.82, radius: ids.map(() => 13) },
  );
  return { ids, index, edges, sim };
}

function Graph({ data, tints, selected, onPerson, W, H }: Props & { W: number; H: number }) {
  const pairs = useOpenPair();
  const [{ ids, index, edges, sim }] = useState(() => buildLayout(data, W, H));
  const people = new Map(data.people.map((p) => [p.id, p]));

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

  // Pan and zoom move positions rather than scaling the SVG, so text and dots stay at design size.
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
  const [grabbing, setGrabbing] = useState(false);
  const active = hovered ?? pairs.current;
  const activePair = edges.find((e) => e.id === active);
  // A tapped person: their lines draw in, everyone they didn't chat with fades back.
  const ties = selected ? new Set(edges.filter((e) => e.a === selected || e.b === selected).flatMap((e) => [e.a, e.b])) : null;
  const hover = (pairId: string | null) => {
    setHovered(pairId);
    if (pairId) pairs.prefetch(pairId);
  };

  // Drag a node to pull it (it stays where you drop it), drag the background to pan, pinch or scroll to zoom.
  // A press that barely moves is a tap, which opens a pair.
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
      g.pinch = null;
      g.last = [...g.pointers.values()][0];
      return;
    }
    if (g.node != null && g.moved) {
      sim.release(g.node, true);
      wake();
    }
    if (!g.moved && e.type === "pointerup") {
      // A tap on a person selects them (their node sits above the lines); a tap on a line opens that chat.
      if (g.node != null) {
        onPerson(ids[g.node]);
        if (pairs.current) pairs.close();
      } else if (g.pair) {
        onPerson(null);
        pairs.open(g.pair);
      } else onPerson(null);
    }
    gesture.current = null;
    setGrabbing(false);
  };
  const recenter = () => {
    sim.reset();
    wake();
    setView({ x: 0, y: 0, k: 1 });
  };

  // Each group's blob follows its members' live centroid, so dragging a group drags its colour along.
  const blobs = data.groups.map((g) => {
    const members = ids.filter((id) => people.get(id)?.group === g.label).map(at);
    const c = members.reduce((s, p) => ({ x: s.x + p.x / members.length, y: s.y + p.y / members.length }), { x: 0, y: 0 });
    const r = Math.max(...members.map((p) => Math.hypot(p.x - c.x, p.y - c.y)), 20) + 34 * view.k;
    return { label: g.label, c, r, top: Math.min(...members.map((p) => p.y)) };
  });

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className={`block touch-none overflow-hidden select-none ${grabbing ? "cursor-grabbing" : "cursor-grab"}`}
        role="img"
        aria-label="Everyone in the universe, clustered by group"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <filter id="pool-blob" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={22} />
          </filter>
        </defs>

        {blobs.map((b) => (
          <circle key={b.label} cx={b.c.x} cy={b.c.y} r={b.r} fill={tints.get(b.label)} fillOpacity={0.3} filter="url(#pool-blob)" className="fade-in" />
        ))}
        {blobs.map((b) => (
          <text
            key={b.label}
            x={b.c.x}
            y={b.top - 22}
            textAnchor="middle"
            className="pointer-events-none fill-ink-muted font-mono"
            style={{ fontSize: 10, letterSpacing: "0.14em" }}
          >
            {b.label}
          </text>
        ))}

        {/* Judged pairs: firmer inside a group, faint across groups. Each is a tap target for its chat. */}
        <g className="fade-in" style={{ animationDelay: "200ms" }}>
          {edges.map((e) => {
            const a = at(e.a);
            const b = at(e.b);
            const ga = people.get(e.a)?.group;
            const within = !!ga && ga === people.get(e.b)?.group;
            const on = active === e.id;
            const mine = !!selected && (e.a === selected || e.b === selected);
            if (mine) {
              // Draws outward from the selected person, replayed on every new selection.
              const [from, to] = e.a === selected ? [a, b] : [b, a];
              return (
                <g key={`${e.id}:${selected}`} data-pair={e.id} className="cursor-pointer" onPointerEnter={() => hover(e.id)} onPointerLeave={() => hover(null)}>
                  <line
                    x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    pathLength={1}
                    stroke={on ? "var(--color-ember-text)" : "var(--color-ember)"}
                    strokeWidth={on ? 2 : 1.3}
                    strokeOpacity={0.85}
                    strokeLinecap="round"
                    className="draw-in"
                  />
                  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={14} />
                </g>
              );
            }
            return (
              <g key={e.id} data-pair={e.id} className="cursor-pointer" onPointerEnter={() => hover(e.id)} onPointerLeave={() => hover(null)}>
                {on && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-ember)" strokeWidth={6} strokeOpacity={0.35} strokeLinecap="round" />}
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={on ? "var(--color-ember-text)" : "var(--color-ink)"}
                  strokeWidth={on ? 1.6 : within ? 0.9 : 0.6}
                  strokeOpacity={on ? 0.9 : (within ? 0.32 : 0.12) * (active ? 0.5 : 1) * (selected ? 0.35 : 1)}
                  strokeDasharray={e.has_transcript ? undefined : "1.5 4"}
                  strokeLinecap="round"
                  className="transition-[stroke-opacity,stroke-width] duration-200"
                />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={14} />
              </g>
            );
          })}
        </g>

        {ids.map((id, i) => {
          const p = people.get(id)!;
          const n = at(id);
          const lit = !!activePair && (activePair.a === id || activePair.b === id);
          const isSelected = selected === id;
          const faded = !!ties && !ties.has(id) && !isSelected;
          return (
            <g
              key={id}
              data-node={i}
              className="pop-in cursor-pointer transition-opacity duration-300"
              style={{ animationDelay: `${150 + i * 25}ms`, opacity: faded ? 0.3 : 1 }}
            >
              <circle cx={n.x} cy={n.y} r={16} fill="transparent" />
              {isSelected && (
                <g key={selected}>
                  <circle cx={n.x} cy={n.y} r={11} fill="var(--color-ember)" fillOpacity={0.22} className="pop-in" />
                  <circle cx={n.x} cy={n.y} r={6.5} fill="none" stroke="var(--color-ember)" strokeWidth={1} className="pulse-ring" />
                </g>
              )}
              {p.group ? (
                <circle cx={n.x} cy={n.y} r={isSelected ? 6.5 : 5.5} fill={lit || isSelected ? "var(--color-ember)" : "var(--color-node)"} />
              ) : (
                <circle cx={n.x} cy={n.y} r={4} fill="var(--color-paper)" stroke={lit || isSelected ? "var(--color-ember)" : "var(--color-ink-muted)"} strokeWidth={1.2} />
              )}
              <text
                x={n.x + 10}
                y={n.y + 4}
                className="pointer-events-none font-sans lowercase"
                style={{ fontSize: 12, letterSpacing: "0.12em", fontWeight: p.group || lit || isSelected ? 400 : 300 }}
                fill={lit || isSelected ? "var(--color-ember-text)" : p.group ? "var(--color-ink)" : "var(--color-ink-muted)"}
              >
                {p.full_name.toLowerCase()}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full border border-ink/20 bg-paper/80 p-0.5 backdrop-blur-sm">
        {[
          { label: "zoom out", glyph: "−", run: () => zoomAt({ x: W / 2, y: H / 2 }, 1 / 1.3) },
          { label: "zoom in", glyph: "+", run: () => zoomAt({ x: W / 2, y: H / 2 }, 1.3) },
        ].map((b) => (
          <button key={b.label} onClick={b.run} aria-label={b.label} className="press grid size-8 place-items-center rounded-full font-mono fs-15 hover:bg-ink/5">
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
