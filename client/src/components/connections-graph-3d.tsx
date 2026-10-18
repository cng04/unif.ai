"use client";

import { Billboard, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type RefObject } from "react";
import { Vector3 } from "three";
import type { UserGraph } from "@/lib/api";
import { formatScore } from "./ui";

// The whole universe in 3D, placed by Jev keyword scores (PCA, or three chosen keywords as axes). Same
// naming rules as the 2D ego graph: you, your group, and your judged matches are named; everyone else is a
// pool dot. Tapping one of your lines or matches opens that agent conversation. Loaded lazily (three.js is
// heavy), see connections-graph-3d-lazy.tsx.

type Vec3 = [number, number, number];
type GraphNode = UserGraph["nodes"][number];
type Label = { key: string; at: Vec3 };
type LabelRefs = RefObject<Map<string, HTMLElement>>;

const SPREAD = 2.4;
// three.js needs literal colours; these mirror the tokens in globals.css.
const INK = "#26241f";
const EMBER = "#e27a50";
const POOL = "#cfcbc2";
const MUTED = "#8c887e";

const pos = (n: GraphNode): Vec3 => [n.x * SPREAD, n.y * SPREAD, n.z * SPREAD];
const AXIS_ENDS: Vec3[] = [
  [SPREAD, 0, 0],
  [0, SPREAD, 0],
  [0, 0, SPREAD],
];

/**
 * Moves the DOM labels to their nodes' screen positions every frame. Labels live in one overlay outside the
 * Canvas instead of drei's <Html>, which mounts a React root per label and trips React 19's
 * "synchronously unmount a root while rendering" error on refresh.
 */
function LabelTracker({ labels, refs }: { labels: Label[]; refs: LabelRefs }) {
  const v = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const { key, at } of labels) {
      const el = refs.current.get(key);
      if (!el) continue;
      v.set(...at).project(camera);
      const visible = v.z < 1;
      el.style.visibility = visible ? "visible" : "hidden";
      if (visible) el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
    }
  });
  return null;
}

function Scene({ data, active, setActive, open, labels, refs }: {
  data: UserGraph;
  active: string | null;
  setActive: (pairId: string | null) => void;
  open: (pairId: string) => void;
  labels: Label[];
  refs: LabelRefs;
}) {
  const byId = useMemo(() => new Map(data.nodes.map((n) => [n.user_id, n])), [data.nodes]);
  const me = data.nodes.find((n) => n.kind === "me");
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
      <LabelTracker labels={labels} refs={refs} />

      {data.axes &&
        AXIS_ENDS.map((end, i) => (
          <Line
            key={i}
            points={[end.map((v) => -v) as Vec3, end]}
            color={MUTED}
            lineWidth={0.6}
            dashed
            dashSize={0.06}
            gapSize={0.06}
            transparent
            opacity={0.5}
          />
        ))}

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
      {me &&
        data.nodes
          .filter((n) => n.pair_id)
          .map((n) => {
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
          <Billboard key={n.user_id} position={pos(n)}>
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
        );
      })}
    </>
  );
}

export function ConnectionsGraph3D({ data, userId }: { data: UserGraph; userId: string }) {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLElement>());
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

  const namedNodes = data.nodes.filter((n) => n.name);
  const labels = useMemo<Label[]>(
    () => [
      ...data.nodes.filter((n) => n.name).map((n) => ({ key: n.user_id, at: pos(n) })),
      ...(data.axes ? AXIS_ENDS.map((at, i) => ({ key: `axis-${i}`, at })) : []),
    ],
    [data],
  );
  const track = (key: string) => (el: HTMLElement | null) => {
    if (el) refs.current.set(key, el);
    else refs.current.delete(key);
  };

  return (
    <div className="fade-in relative h-full w-full">
      <Canvas camera={{ position: [0, 0, 7.5], fov: 40 }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
        <Scene data={data} active={active} setActive={setActive} open={open} labels={labels} refs={refs} />
        <OrbitControls
          enablePan={false}
          enableDamping
          autoRotate={!active}
          autoRotateSpeed={0.35}
          minDistance={3}
          maxDistance={14}
        />
      </Canvas>

      {/* Labels: positioned by LabelTracker each frame; the inner span offsets them beside the node. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {data.axes?.map((name, i) => (
          <span key={`axis-${i}`} ref={track(`axis-${i}`)} className="invisible absolute top-0 left-0">
            <span className="micro block -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-ink-faint">{name} →</span>
          </span>
        ))}
        {namedNodes.map((n) => {
          const on = !!n.pair_id && active === n.pair_id;
          return (
            <span key={n.user_id} ref={track(n.user_id)} className="invisible absolute top-0 left-0">
              <span
                className="block translate-x-[10px] -translate-y-1/2 whitespace-nowrap font-sans lowercase transition-colors"
                style={{
                  fontSize: n.kind === "match" ? 10.5 : 11,
                  letterSpacing: "0.14em",
                  fontWeight: n.kind !== "match" || on ? 400 : 300,
                  color: on ? "var(--color-ember-text)" : n.kind === "match" ? "var(--color-ink-muted)" : "var(--color-ink)",
                }}
              >
                {n.kind === "me" ? "me" : n.name!.toLowerCase()}
                {n.pair_id && (
                  <span className="ml-[5px] font-mono" style={{ fontSize: 8.5, letterSpacing: "0.08em" }}>
                    {n.conflict ? "not a fit" : formatScore(n.vibe_score)}
                  </span>
                )}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
