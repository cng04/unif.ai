"use client";

import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import type { Connections } from "@/lib/api";
import { formatScore } from "./ui";

// Ego layout in real pixels: you in the middle, your group on an inner ring, other judged matches on an
// outer ellipse, and everyone else in the universe as anonymous pool nodes scattered around the edges.
// It measures its container, so it fills a phone or a desktop window while text stays at design size.

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
      {size && size.w > 0 && size.h > 0 && <Graph data={data} layout={layoutFor(size.w, size.h)} />}
    </div>
  );
}

function Graph({ data, layout }: { data: Connections; layout: Layout }) {
  const { W, H, C } = layout;
  const router = useRouter();
  const me = data.user.user_id;
  const byUser = new Map(data.connections.map((c) => [c.user_id, c]));
  const groupIds = (data.group?.members ?? []).map((m) => m.user_id).filter((id) => id !== me);
  const groupNames = new Map((data.group?.members ?? []).map((m) => [m.user_id, m.full_name]));
  const outerIds = data.connections.filter((c) => !c.in_group).map((c) => c.user_id);

  const pos = new Map<string, Node>([[me, { id: me, ...C }]]);
  for (const n of ring(groupIds, C, layout.groupR, layout.groupR, -135)) pos.set(n.id, n);
  for (const n of ring(outerIds, C, layout.outer.rx, layout.outer.ry, -55)) pos.set(n.id, n);
  const pool = data.others.filter((id) => !pos.has(id)).slice(0, layout.poolMax).map((id) => poolPoint(id, layout));
  for (const n of pool) pos.set(n.id, n);

  const inGroup = new Set(groupIds);
  const [hovered, setHovered] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const active = opening ?? hovered;
  const href = (pairId: string) => `/u/${me}/pairs/${pairId}`;
  // Light the edge first so a tap visibly "lands", then open the conversation.
  const open = (pairId: string) => {
    if (opening) return;
    setOpening(pairId);
    router.prefetch(href(pairId));
    setTimeout(() => router.push(href(pairId)), 220);
  };
  const hover = (pairId: string | null) => {
    setHovered(pairId);
    if (pairId) router.prefetch(href(pairId));
  };
  const handlers = (pairId: string) => ({
    onPointerEnter: () => hover(pairId),
    onPointerLeave: () => hover(null),
    onFocus: () => hover(pairId),
    onBlur: () => hover(null),
    onClick: () => open(pairId),
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block overflow-visible" role="img" aria-label="Your connections">
      {/* Edges between other people: faint in the pool, firmer inside your group. */}
      <g className="fade-in" style={{ animationDelay: "300ms" }}>
        {data.edges.map((e) => {
          const a = pos.get(e.a);
          const b = pos.get(e.b);
          if (!a || !b) return null;
          const within = inGroup.has(e.a) && inGroup.has(e.b);
          // Pool edges are background texture; long ones just criss-cross the whole canvas.
          if (!within && Math.hypot(a.x - b.x, a.y - b.y) > layout.poolEdgeMax) return null;
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

      {pool.map((n) => (
        <circle
          key={n.id}
          cx={n.x} cy={n.y} r={2.6}
          fill="var(--color-node-pool)"
          className="pop-in"
          style={{ animationDelay: `${200 + (hash(n.id) % 600)}ms` }}
        />
      ))}

      {/* Your edges: each one is a tap target that opens that agent conversation. */}
      {data.connections.map((c, i) => {
        const n = pos.get(c.user_id)!;
        const on = active === c.pair_id;
        const dim = active && !on;
        return (
          <g key={c.pair_id} className="cursor-pointer" {...handlers(c.pair_id)}>
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
            node={pos.get(id)!}
            layout={layout}
            index={i}
            name={c?.full_name ?? groupNames.get(id) ?? ""}
            detail={c ? formatScore(c.vibe_score) : undefined}
            variant="group"
            active={!!c && active === c.pair_id}
            handlers={c ? handlers(c.pair_id) : undefined}
          />
        );
      })}
      {data.connections
        .filter((c) => !c.in_group)
        .map((c, i) => (
          <PersonNode
            key={c.user_id}
            node={pos.get(c.user_id)!}
            layout={layout}
            index={groupIds.length + i}
            name={c.full_name}
            detail={c.conflict ? "not a fit" : formatScore(c.vibe_score)}
            variant={c.conflict ? "conflict" : "match"}
            active={active === c.pair_id}
            handlers={handlers(c.pair_id)}
          />
        ))}

      <circle cx={C.x} cy={C.y} r={6.5} fill="none" stroke="var(--color-ember)" strokeWidth={1} className="pulse-ring" />
      <circle cx={C.x} cy={C.y} r={6.5} fill="var(--color-node)" />
      <text x={C.x + 11} y={C.y + 4} className="fill-ink font-sans text-label tracking-label">
        me
      </text>
    </svg>
  );
}

type Handlers = {
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onClick: () => void;
};

function PersonNode({
  node,
  layout: { W, C },
  index,
  name,
  detail,
  variant,
  active,
  handlers,
}: {
  node: Node;
  layout: Layout;
  index: number;
  name: string;
  detail?: string;
  variant: "group" | "match" | "conflict";
  active: boolean;
  handlers?: Handlers;
}) {
  const strong = variant === "group";
  const left = node.x < C.x;
  // Group labels sit beside the node, away from you. Outer labels sit above or below it, centered, and are
  // nudged inward so they never run off the canvas (width estimated from character count).
  const halfWidth = ((name.length + (detail?.length ?? 0) + 1) * 7.6) / 2;
  const x = strong
    ? node.x + (left ? -11 : 11)
    : Math.min(Math.max(node.x, halfWidth + 6), W - halfWidth - 6);
  const y = strong ? node.y + 4 : node.y + (node.y > C.y ? 18 : -10);
  const anchor = strong ? (left ? "end" : "start") : "middle";
  return (
    // Outer group bobs gently; inner group pops in once. They're split so the two transforms don't clash.
    <g className="float" style={{ animationDelay: `-${index * 0.8}s`, animationDuration: `${4.5 + (index % 3)}s` }}>
      <g
        className={`pop-in ${handlers ? "cursor-pointer outline-none" : ""}`}
        style={{ animationDelay: `${300 + index * 70}ms` }}
        {...handlers}
        onKeyDown={(e) => e.key === "Enter" && handlers?.onClick()}
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
          style={{ fontSize: strong ? 11 : 10.5, letterSpacing: "0.14em", fontWeight: strong || active ? 400 : 300 }}
          fill={strong || active ? "var(--color-ink)" : "var(--color-ink-muted)"}
        >
          {name.toLowerCase()}
          {detail && (
            <tspan
              dx={5}
              className="font-mono"
              style={{ fontSize: 8.5, letterSpacing: "0.08em", fontWeight: 400 }}
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
