"use client";

import { Billboard, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Fragment, useMemo, useRef, useState, type ComponentRef, type RefObject } from "react";
import { BufferGeometry, Color, Group, Mesh, MeshBasicMaterial, Plane, Raycaster, Vector2, Vector3 } from "three";
import type { UserGraph } from "@/lib/api";
import { Elastic } from "@/lib/elastic";
import { formatScore } from "./ui";
import { useOpenPair } from "./use-open-pair";

// The whole universe in 3D, placed by Jev keyword scores (PCA, or three chosen keywords as axes). Same
// naming rules as the 2D ego graph: you, your group, and your judged matches are named; everyone else is a
// pool dot. Tapping one of your lines or matches opens that agent conversation in the drawer. Every dot sits on
// a spring (lib/elastic.ts): drag one and its links stretch, let go and it springs back to where its scores put
// it. Loaded lazily (three.js is heavy), see connections-graph-3d-lazy.tsx.

type Vec3 = [number, number, number];
type Label = { key: string; node?: number; at: Vec3 };
type LabelRefs = RefObject<Map<string, HTMLElement>>;

const SPREAD = 2.6;
// three.js needs literal colours; these mirror the tokens in globals.css.
const INK = "#26241f";
const EMBER = "#e27a50";
const PERIWINKLE = "#8197cf";
const POOL = "#cfcbc2";
const MUTED = "#8c887e";

const AXIS_LOW = "#e4e0d8";
// Cones point along +y; turn them to point along +x, +y, +z.
const ARROW_ROTATION: Vec3[] = [
  [0, 0, -Math.PI / 2],
  [0, 0, 0],
  [Math.PI / 2, 0, 0],
];
const AXIS_ENDS: Vec3[] = [
  [SPREAD, 0, 0],
  [0, SPREAD, 0],
  [0, 0, SPREAD],
];

/**
 * Where each person sits. Keyword axes are plotted as-is (they mean a score). PCA comes scaled by its single
 * most extreme person, which squeezes everyone else into a clump in the middle, so each axis is rescaled by
 * its 90th percentile instead and outliers are softly pulled back in.
 */
function homesOf(data: UserGraph): Vec3[] {
  const raw = data.nodes.map((n): Vec3 => [n.x, n.y, n.z]);
  if (data.axes) return raw.map((p) => p.map((v) => v * SPREAD) as Vec3);
  const scale = [0, 1, 2].map((d) => {
    const abs = raw.map((p) => Math.abs(p[d])).sort((a, b) => a - b);
    return Math.max(abs[Math.floor((abs.length - 1) * 0.9)] ?? 0, 0.05);
  });
  return raw.map((p) => p.map((v, d) => 1.3 * Math.tanh(v / scale[d] / 1.3) * SPREAD) as Vec3);
}

// Decorative "messages" on your lines: a soft pulse runs out from you (ember, your agent) and back
// (periwinkle, theirs), each line on its own clock. Not tied to real message timing.
const SEGMENTS = 28;
const PERIOD = 3.6;
const PULSE_WIDTH = 0.11;

function PulseLine({ sim, a, b, seed, on, conflict, width, opacity, handlers }: {
  sim: Elastic;
  a: number;
  b: number;
  seed: number;
  on: boolean;
  conflict: boolean;
  width: number;
  opacity: number;
  handlers: object;
}) {
  const line = useRef<ComponentRef<typeof Line>>(null);
  const dot = useRef<Mesh>(null);
  const init = useMemo(
    () => ({
      points: Array.from({ length: SEGMENTS + 1 }, (_, i): Vec3 => [i, 0, 0]),
      colors: Array.from({ length: SEGMENTS + 1 }, (): Vec3 => [1, 1, 1]),
    }),
    [],
  );
  const c = useMemo(() => ({ ink: new Color(INK), ember: new Color(EMBER), peri: new Color(PERIWINKLE), soft: new Color("#f6c9b2"), tmp: new Color() }), []);
  useFrame(({ clock }) => {
    const l = line.current;
    if (!l) return;
    const pa = sim.get(a);
    const pb = sim.get(b);
    const t = (clock.elapsedTime / PERIOD + seed) % 1;
    const outbound = t < 0.5;
    const u = outbound ? t * 2 : 2 - t * 2;
    const base = on ? c.ember : c.ink;
    const pulse = on ? c.soft : outbound ? c.ember : c.peri;
    const strength = conflict ? 0 : on ? 0.8 : 0.9;
    const pos = new Float32Array((SEGMENTS + 1) * 3);
    const col = new Float32Array((SEGMENTS + 1) * 3);
    for (let i = 0; i <= SEGMENTS; i++) {
      const s = i / SEGMENTS;
      for (let k = 0; k < 3; k++) pos[i * 3 + k] = pa[k] + (pb[k] - pa[k]) * s;
      const bump = Math.exp(-(((s - u) / PULSE_WIDTH) ** 2)) * strength;
      c.tmp.copy(base).lerp(pulse, bump).toArray(col, i * 3);
    }
    l.geometry.setPositions(pos);
    l.geometry.setColors(col);
    if (conflict) l.computeLineDistances();
    if (dot.current) {
      dot.current.visible = !conflict;
      dot.current.position.set(...(pa.map((v, k) => v + (pb[k] - v) * u) as Vec3));
      const m = dot.current.material as MeshBasicMaterial;
      m.color.copy(pulse);
      // Fades in and out at the ends, so it reads as leaving one agent and arriving at the other.
      m.opacity = Math.sin(Math.PI * u) * (on ? 1 : 0.85);
    }
  });
  return (
    <>
      <Line
        ref={line}
        points={init.points}
        vertexColors={init.colors}
        color="#ffffff"
        lineWidth={width}
        dashed={conflict}
        dashSize={0.04}
        gapSize={0.06}
        transparent
        opacity={opacity}
        {...handlers}
      />
      <mesh ref={dot}>
        <sphereGeometry args={[on ? 0.034 : 0.026, 12, 12]} />
        <meshBasicMaterial transparent depthWrite={false} />
      </mesh>
    </>
  );
}

/** Other people's pairs as one plain line batch, re-read from the simulation every frame. */
function LinkBatch({ sim, links, opacity }: { sim: Elastic; links: [number, number][]; opacity: number }) {
  const geo = useRef<BufferGeometry>(null);
  const initial = useMemo(() => new Float32Array(links.length * 6), [links]);
  useFrame(() => {
    const g = geo.current;
    if (!g) return;
    const arr = g.attributes.position.array as Float32Array;
    links.forEach(([a, b], i) => {
      arr.set(sim.get(a), i * 6);
      arr.set(sim.get(b), i * 6 + 3);
    });
    g.attributes.position.needsUpdate = true;
    g.computeBoundingSphere();
  });
  if (links.length === 0) return null;
  return (
    <lineSegments>
      <bufferGeometry ref={geo}>
        <bufferAttribute attach="attributes-position" args={[initial, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={INK} transparent opacity={opacity} depthWrite={false} />
    </lineSegments>
  );
}

/**
 * Moves the DOM labels to their nodes' screen positions every frame, and fades the ones toward the back so
 * the front of a crowded patch stays readable. Labels live in one overlay outside the Canvas instead of
 * drei's <Html>, which mounts a React root per label and trips React 19's "synchronously unmount a root
 * while rendering" error on refresh.
 */
function LabelTracker({ sim, labels, refs }: { sim: Elastic; labels: Label[]; refs: LabelRefs }) {
  const v = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    const centre = camera.position.length();
    for (const { key, node, at } of labels) {
      const el = refs.current.get(key);
      if (!el) continue;
      v.set(...(node != null ? (sim.get(node) as Vec3) : at));
      const depth = v.distanceTo(camera.position) - centre;
      v.project(camera);
      const visible = v.z < 1;
      el.style.visibility = visible ? "visible" : "hidden";
      if (!visible) continue;
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
      if (node != null) el.style.opacity = String(Math.min(1, Math.max(0.3, 1 - depth / (SPREAD * 1.4))));
    }
  });
  return null;
}

function Scene({ data, sim, active, setActive, open, setDragging, labels, refs }: {
  data: UserGraph;
  sim: Elastic;
  active: string | null;
  setActive: (pairId: string | null) => void;
  open: (pairId: string) => void;
  setDragging: (on: boolean) => void;
  labels: Label[];
  refs: LabelRefs;
}) {
  const { camera, gl, controls } = useThree();
  const index = useMemo(() => new Map(data.nodes.map((n, i) => [n.user_id, i])), [data.nodes]);
  const meIndex = data.nodes.findIndex((n) => n.kind === "me");
  const named = (i: number) => data.nodes[i].kind !== "pool";

  const others = useMemo(() => {
    const buckets: Record<"within" | "named" | "pool", [number, number][]> = { within: [], named: [], pool: [] };
    for (const l of data.links) {
      const a = index.get(l.a);
      const b = index.get(l.b);
      if (l.mine || a == null || b == null) continue;
      const within = data.nodes[a].kind === "group" && data.nodes[b].kind === "group";
      buckets[within ? "within" : data.nodes[a].kind !== "pool" || data.nodes[b].kind !== "pool" ? "named" : "pool"].push([a, b]);
    }
    return buckets;
  }, [data, index]);

  // Steps the springs while anything moves; node groups follow the simulation every frame.
  const awake = useRef(true);
  const nodes = useRef(new Map<number, Group>());
  useFrame(() => {
    if (awake.current) awake.current = sim.step();
    for (const [i, g] of nodes.current) g.position.set(...(sim.get(i) as Vec3));
  });

  // Dragging a dot: it moves on the plane facing the camera through where it was grabbed. Orbit is paused
  // meanwhile. A press that barely moves is a tap.
  const drag = useRef<{ i: number; pair: string | null; x: number; y: number; moved: boolean; plane: Plane } | null>(null);
  const grab = (i: number, pair: string | null) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const orbit = controls as unknown as { enabled: boolean } | null;
    if (orbit) orbit.enabled = false;
    const normal = camera.getWorldDirection(new Vector3());
    drag.current = {
      i, pair, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, moved: false,
      plane: new Plane().setFromNormalAndCoplanarPoint(normal, new Vector3(...(sim.get(i) as Vec3))),
    };
    const ray = new Raycaster();
    const hit = new Vector3();
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.moved) {
        if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 5) return;
        d.moved = true;
        setDragging(true);
      }
      const r = gl.domElement.getBoundingClientRect();
      ray.setFromCamera(new Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
      if (ray.ray.intersectPlane(d.plane, hit)) {
        sim.drag(d.i, hit.toArray());
        awake.current = true;
      }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const d = drag.current;
      drag.current = null;
      if (orbit) orbit.enabled = true;
      if (!d) return;
      if (d.moved) {
        sim.release(d.i, false);
        awake.current = true;
        setDragging(false);
      } else if (d.pair && ev.type === "pointerup") open(d.pair);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const hover = (pairId: string | null) => ({
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      if (pairId) setActive(pairId);
      document.body.style.cursor = pairId ? "pointer" : "grab";
    },
    onPointerOut: () => {
      if (pairId) setActive(null);
      document.body.style.cursor = "";
    },
  });
  const lineHandlers = (pairId: string) => ({
    ...hover(pairId),
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      open(pairId);
    },
  });

  return (
    <>
      <LabelTracker sim={sim} labels={labels} refs={refs} />

      {/* Keyword axes: light at the low end, darker toward "more", with an arrowhead on the high end. */}
      {data.axes &&
        AXIS_ENDS.map((end, i) => (
          <group key={i}>
            <Line
              points={[end.map((v) => -v) as Vec3, end]}
              color="#ffffff"
              vertexColors={[new Color(AXIS_LOW), new Color(MUTED)]}
              lineWidth={1}
              transparent
              opacity={0.9}
            />
            <mesh position={end} rotation={ARROW_ROTATION[i]}>
              <coneGeometry args={[0.045, 0.14, 12]} />
              <meshBasicMaterial color={MUTED} />
            </mesh>
          </group>
        ))}

      {/* Other people's pairs: faint texture, firmer when both ends are people you know. */}
      <LinkBatch sim={sim} links={others.within} opacity={0.3 * (active ? 0.5 : 1)} />
      <LinkBatch sim={sim} links={others.named} opacity={0.16 * (active ? 0.5 : 1)} />
      <LinkBatch sim={sim} links={others.pool} opacity={0.09 * (active ? 0.5 : 1)} />

      {/* Your pairs: each line opens that agent conversation. */}
      {meIndex >= 0 &&
        data.nodes.map((n, i) => {
          if (!n.pair_id) return null;
          const on = active === n.pair_id;
          return (
            <PulseLine
              key={n.pair_id}
              sim={sim}
              a={meIndex}
              b={i}
              seed={(i * 0.37) % 1}
              on={on}
              conflict={n.conflict}
              width={on ? 2.2 : n.kind === "group" ? 1.3 : 1}
              opacity={on ? 0.95 : (n.kind === "group" ? 0.6 : 0.4) * (active ? 0.5 : 1)}
              handlers={lineHandlers(n.pair_id)}
            />
          );
        })}

      {data.nodes.map((n, i) => {
        const on = !!n.pair_id && active === n.pair_id;
        const handlers = { ...hover(n.pair_id), onPointerDown: grab(i, n.pair_id) };
        return (
          <Billboard
            key={n.user_id}
            ref={(g: Group | null) => {
              if (g) nodes.current.set(i, g);
              else nodes.current.delete(i);
            }}
          >
            <mesh>
              {n.kind === "match" ? (
                <ringGeometry args={[0.038, 0.056, 32]} />
              ) : (
                <circleGeometry args={[n.kind === "me" ? 0.08 : n.kind === "group" ? 0.065 : 0.03, 32]} />
              )}
              <meshBasicMaterial
                color={on ? EMBER : n.kind === "pool" ? POOL : INK}
                transparent
                opacity={n.conflict && !on ? 0.5 : 1}
              />
            </mesh>
            {/* Bigger invisible hit target, so even pool dots can be grabbed. */}
            <mesh {...handlers}>
              <circleGeometry args={[named(i) ? 0.16 : 0.09, 16]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            {n.kind === "me" && (
              <mesh>
                <ringGeometry args={[0.115, 0.128, 48]} />
                <meshBasicMaterial color={EMBER} transparent opacity={0.8} />
              </mesh>
            )}
          </Billboard>
        );
      })}
    </>
  );
}

export function ConnectionsGraph3D({ data }: { data: UserGraph }) {
  const pairs = useOpenPair();
  const [hovered, setHovered] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const refs = useRef(new Map<string, HTMLElement>());
  // The open conversation stays lit while its drawer is up.
  const active = opening ?? hovered ?? pairs.current;
  // Same feel as the 2D graph: light the edge so the tap visibly lands, then open the conversation.
  const open = (pairId: string) => {
    if (opening) return;
    setOpening(pairId);
    setTimeout(() => {
      pairs.open(pairId);
      setOpening(null);
    }, 220);
  };
  const setActive = (pairId: string | null) => {
    setHovered(pairId);
    if (pairId) pairs.prefetch(pairId);
  };

  const sim = useMemo(() => {
    const index = new Map(data.nodes.map((n, i) => [n.user_id, i]));
    const springs = data.links.flatMap((l) => {
      const a = index.get(l.a);
      const b = index.get(l.b);
      return a != null && b != null ? [{ a, b }] : [];
    });
    // Collision radii spread apart people who'd otherwise sit on top of each other.
    const radius = data.nodes.map((n) => (n.kind === "me" ? 0.26 : n.kind === "pool" ? 0.08 : 0.2));
    return new Elastic(homesOf(data), springs, { anchor: 0.02, spring: 0.05, damping: 0.86, radius });
  }, [data]);

  const namedNodes = data.nodes.map((n, i) => ({ n, i })).filter(({ n }) => n.name);
  const labels = useMemo<Label[]>(
    () => [
      ...data.nodes.flatMap((n, i) => (n.name ? [{ key: n.user_id, node: i, at: [0, 0, 0] as Vec3 }] : [])),
      ...(data.axes
        ? AXIS_ENDS.flatMap((end, i) => [
            { key: `axis-hi-${i}`, at: end.map((v) => v * 1.14) as Vec3 },
            { key: `axis-lo-${i}`, at: end.map((v) => v * -1.1) as Vec3 },
          ])
        : []),
    ],
    [data],
  );
  const track = (key: string) => (el: HTMLElement | null) => {
    if (el) refs.current.set(key, el);
    else refs.current.delete(key);
  };

  return (
    <div className="fade-in relative h-full w-full">
      <Canvas camera={{ position: [0, 0, 9.4], fov: 40 }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
        <Scene
          data={data}
          sim={sim}
          active={active}
          setActive={setActive}
          open={open}
          setDragging={setDragging}
          labels={labels}
          refs={refs}
        />
        <OrbitControls
          makeDefault
          enableDamping
          autoRotate={!active && !dragging}
          autoRotateSpeed={0.35}
          minDistance={2.5}
          maxDistance={16}
        />
      </Canvas>

      {/* Labels: positioned by LabelTracker each frame; the inner span offsets them beside the node. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {data.axes?.map((name, i) => (
          <Fragment key={i}>
            <span ref={track(`axis-hi-${i}`)} className="invisible absolute top-0 left-0">
              <span className="block -translate-x-1/2 -translate-y-1/2 rounded-full border border-line bg-paper/85 px-2.5 py-1 font-mono text-[11.5px] tracking-[0.08em] whitespace-nowrap text-ink lowercase">
                <span className="text-ink-faint">{"xyz"[i]} ·</span> more {name}
              </span>
            </span>
            <span ref={track(`axis-lo-${i}`)} className="invisible absolute top-0 left-0">
              <span className="block -translate-x-1/2 -translate-y-1/2 font-mono text-[11px] tracking-[0.08em] whitespace-nowrap text-ink-faint lowercase">
                less {name}
              </span>
            </span>
          </Fragment>
        ))}
        {namedNodes.map(({ n }) => {
          const on = !!n.pair_id && active === n.pair_id;
          return (
            <span key={n.user_id} ref={track(n.user_id)} className="invisible absolute top-0 left-0">
              <span
                className="block translate-x-[11px] -translate-y-1/2 rounded-full bg-paper/60 px-1 whitespace-nowrap font-sans lowercase transition-colors"
                style={{
                  fontSize: n.kind === "match" ? 12 : 12.5,
                  letterSpacing: "0.12em",
                  fontWeight: n.kind !== "match" || on ? 400 : 300,
                  color: on ? "var(--color-ember-text)" : n.kind === "match" ? "var(--color-ink-muted)" : "var(--color-ink)",
                }}
              >
                {n.kind === "me" ? (
                  <>
                    me <span className="font-light text-ink-muted">({n.name!.toLowerCase()})</span>
                  </>
                ) : (
                  n.name!.toLowerCase()
                )}
                {n.pair_id && (
                  <span className="ml-[5px] font-mono" style={{ fontSize: 10, letterSpacing: "0.08em" }}>
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
