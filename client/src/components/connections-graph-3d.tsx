"use client";

import { Billboard, Html, Line, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { UserGraph } from "@/lib/api";
import { formatScore } from "./ui";

// The whole universe in 3D, placed by Jev keyword scores (PCA, or three chosen keywords as axes). Same
// naming rules as the 2D ego graph: you, your group, and your judged matches are named; everyone else is a
// pool dot. Tapping one of your lines or matches opens that agent conversation. Loaded lazily (three.js is
// heavy), see connections-graph-3d-lazy.tsx.

type Vec3 = [number, number, number];
type GraphNode = UserGraph["nodes"][number];

const SPREAD = 2.4;
// three.js needs literal colours; these mirror the tokens in globals.css.
const INK = "#26241f";
const EMBER = "#e27a50";
const POOL = "#cfcbc2";
const MUTED = "#8c887e";

const pos = (n: GraphNode): Vec3 => [n.x * SPREAD, n.y * SPREAD, n.z * SPREAD];

function Axes({ names }: { names: [string, string, string] }) {
  const ends: Vec3[] = [
    [SPREAD, 0, 0],
    [0, SPREAD, 0],
    [0, 0, SPREAD],
  ];
  return ends.map((end, i) => (
    <group key={i}>
      <Line
        points={[end.map((v) => -v) as Vec3, end]}
        color={MUTED}
        lineWidth={0.6}
        dashed
        dashSize={0.06}
        gapSize={0.06}
        transparent
        opacity={0.5}
      />
      <Html position={end} center zIndexRange={[5, 0]} className="micro pointer-events-none whitespace-nowrap text-ink-faint">
        {names[i]} →
      </Html>
    </group>
  ));
}

function Scene({ data, active, setActive, open }: {
  data: UserGraph;
  active: string | null;
  setActive: (pairId: string | null) => void;
  open: (pairId: string) => void;
}) {
  const byId = useMemo(() => new Map(data.nodes.map((n) => [n.user_id, n])), [data.nodes]);
  const named = (id: string) => byId.get(id)?.kind !== "pool";
  const handlers = (pairId: string | null) =>
    pairId
      ? {
          onPointerOver: (e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            setActive(pairId);
            document.body.style.cursor = "pointer";
          },
          onPointerOut: () => {
            setActive(null);
            document.body.style.cursor = "";
          },
          onClick: (e: { stopPropagation: () => void }) => {
            e.stopPropagation();
            open(pairId);
          },
        }
      : {};

  return (
    <>
      {data.axes && <Axes names={data.axes} />}

      {/* Other people's pairs: faint texture, firmer when both ends are people you know. */}
      {data.links
        .filter((l) => !l.mine && byId.has(l.a) && byId.has(l.b))
        .map((l) => {
          const within = byId.get(l.a)!.kind === "group" && byId.get(l.b)!.kind === "group";
          return (
            <Line
              key={`${l.a}-${l.b}`}
              points={[pos(byId.get(l.a)!), pos(byId.get(l.b)!)]}
              color={INK}
              lineWidth={within ? 0.9 : 0.6}
              transparent
              opacity={(within ? 0.28 : named(l.a) || named(l.b) ? 0.16 : 0.1) * (active ? 0.5 : 1)}
            />
          );
        })}

      {/* Your pairs: each line opens that agent conversation. */}
      {data.nodes
        .filter((n) => n.pair_id)
        .map((n) => {
          const me = data.nodes.find((m) => m.kind === "me");
          if (!me) return null;
          const on = active === n.pair_id;
          return (
            <Line
              key={n.pair_id!}
              points={[pos(me), pos(n)]}
              color={on ? EMBER : INK}
              lineWidth={on ? 2 : n.kind === "group" ? 1.1 : 0.8}
              dashed={n.conflict}
              dashSize={0.04}
              gapSize={0.06}
              transparent
              opacity={on ? 0.95 : (n.kind === "group" ? 0.5 : 0.32) * (active ? 0.45 : 1)}
              {...handlers(n.pair_id)}
            />
          );
        })}

      {data.nodes.map((n) => {
        const on = !!n.pair_id && active === n.pair_id;
        return (
          <group key={n.user_id} position={pos(n)}>
            <Billboard>
              <mesh {...handlers(n.pair_id)}>
                {n.kind === "match" ? (
                  <ringGeometry args={[0.035, 0.052, 32]} />
                ) : (
                  <circleGeometry args={[n.kind === "me" ? 0.075 : n.kind === "group" ? 0.06 : 0.028, 32]} />
                )}
                <meshBasicMaterial
                  color={on ? EMBER : n.kind === "pool" ? POOL : INK}
                  transparent
                  opacity={n.conflict && !on ? 0.5 : 1}
                />
              </mesh>
              {/* Bigger invisible hit target, like the 24px circle in the 2D graph. */}
              {n.pair_id && (
                <mesh {...handlers(n.pair_id)}>
                  <circleGeometry args={[0.16, 16]} />
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
              )}
              {n.kind === "me" && (
                <mesh>
                  <ringGeometry args={[0.11, 0.122, 48]} />
                  <meshBasicMaterial color={EMBER} transparent opacity={0.8} />
                </mesh>
              )}
            </Billboard>
            {n.name && (
              <Html position={[0.12, 0, 0]} zIndexRange={[10, 0]} className="pointer-events-none -translate-y-1/2 whitespace-nowrap">
                <span
                  className="font-sans lowercase transition-colors"
                  style={{
                    fontSize: n.kind === "match" ? 10.5 : 11,
                    letterSpacing: "0.14em",
                    fontWeight: n.kind !== "match" || on ? 400 : 300,
                    color: on ? "var(--color-ember-text)" : n.kind === "match" ? "var(--color-ink-muted)" : "var(--color-ink)",
                  }}
                >
                  {n.kind === "me" ? "me" : n.name.toLowerCase()}
                  {n.pair_id && (
                    <span className="ml-[5px] font-mono" style={{ fontSize: 8.5, letterSpacing: "0.08em" }}>
                      {n.conflict ? "not a fit" : formatScore(n.vibe_score)}
                    </span>
                  )}
                </span>
              </Html>
            )}
          </group>
        );
      })}
    </>
  );
}

export function ConnectionsGraph3D({ data, userId }: { data: UserGraph; userId: string }) {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const active = opening ?? hovered;
  const href = (pairId: string) => `/u/${userId}/pairs/${pairId}`;
  // Same feel as the 2D graph: light the edge so the tap visibly lands, then open the conversation.
  const open = (pairId: string) => {
    if (opening) return;
    setOpening(pairId);
    router.prefetch(href(pairId));
    setTimeout(() => router.push(href(pairId)), 220);
  };
  const setActive = (pairId: string | null) => {
    setHovered(pairId);
    if (pairId) router.prefetch(href(pairId));
  };

  return (
    <Canvas camera={{ position: [0, 0, 7.5], fov: 40 }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]} className="fade-in">
      <Scene data={data} active={active} setActive={setActive} open={open} />
      <OrbitControls
        enablePan={false}
        enableDamping
        autoRotate={!active}
        autoRotateSpeed={0.35}
        minDistance={3}
        maxDistance={14}
      />
    </Canvas>
  );
}
