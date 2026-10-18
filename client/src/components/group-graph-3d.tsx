"use client";

import { Billboard, Line, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import { Vector3 } from "three";
import type { UserGroup } from "@/lib/api";

// The group reveal's graph in 3D, keeping the 2D look (you in the middle with the ember halo, groupmates on a ring,
// faint ambient dots). Built like connections-graph-3d.tsx; loaded lazily via group-graph-3d-lazy.tsx.

type Vec3 = [number, number, number];
type LabelRefs = RefObject<Map<string, HTMLElement>>;

const INK = "#26241f";
const EMBER = "#e27a50";
const POOL = "#cfcbc2";
const RING = 1.25;
const AMBIENT = 14;

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function LabelTracker({ labels, refs }: { labels: { key: string; at: Vec3 }[]; refs: LabelRefs }) {
  const v = useMemo(() => new Vector3(), []);
  useFrame(({ camera, size }) => {
    for (const { key, at } of labels) {
      const el = refs.current.get(key);
      if (!el) continue;
      v.set(...at).project(camera);
      el.style.visibility = v.z < 1 ? "visible" : "hidden";
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
    }
  });
  return null;
}

export function GroupGraph3D({ group }: { group: UserGroup }) {
  const refs = useRef(new Map<string, HTMLElement>());
  const me = group.members.find((m) => m.is_me);
  const mates = group.members.filter((m) => !m.is_me);

  const pos = useMemo(() => {
    const out = new Map<string, Vec3>();
    if (me) out.set(me.user_id, [0, 0, 0]);
    mates.forEach((m, i) => {
      const a = -Math.PI * 0.75 + (i / mates.length) * Math.PI * 2;
      // A little depth per person, so turning it reads as 3D without losing the ring.
      const z = (((hash(m.user_id) % 100) / 100) - 0.5) * 0.9;
      out.set(m.user_id, [Math.cos(a) * RING, Math.sin(a) * RING * 0.75, z]);
    });
    return out;
  }, [me, mates]);
  const ambient = useMemo<Vec3[]>(
    () =>
      Array.from({ length: AMBIENT }, (_, i) => {
        const y = 1 - (2 * (i + 0.5)) / AMBIENT;
        const ring = Math.sqrt(1 - y * y);
        const t = i * Math.PI * (3 - Math.sqrt(5));
        return [Math.cos(t) * ring * 2.4, y * 1.7, Math.sin(t) * ring * 2.4];
      }),
    [],
  );
  const labels = useMemo(
    () => group.members.map((m) => ({ key: m.user_id, at: pos.get(m.user_id)! })).filter((l) => l.at),
    [group.members, pos],
  );
  const track = (key: string) => (el: HTMLElement | null) => {
    if (el) refs.current.set(key, el);
    else refs.current.delete(key);
  };
  const isMe = (id: string) => id === me?.user_id;

  return (
    <div className="fade-in relative h-full w-full">
      <Canvas camera={{ position: [0, 0, 5.2], fov: 40 }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
        <LabelTracker labels={labels} refs={refs} />
        {ambient.map((at, i) => (
          <Billboard key={i} position={at}>
            <mesh>
              <circleGeometry args={[0.028, 16]} />
              <meshBasicMaterial color={POOL} />
            </mesh>
          </Billboard>
        ))}
        {group.links.map((l) => {
          const a = pos.get(l.a);
          const b = pos.get(l.b);
          if (!a || !b) return null;
          const mine = isMe(l.a) || isMe(l.b);
          return <Line key={`${l.a}-${l.b}`} points={[a, b]} color={INK} lineWidth={mine ? 1.2 : 0.9} transparent opacity={mine ? 0.6 : 0.28} />;
        })}
        {group.members.map((m) => {
          const at = pos.get(m.user_id);
          if (!at) return null;
          return (
            <Billboard key={m.user_id} position={at}>
              {m.is_me && (
                <mesh>
                  <circleGeometry args={[0.24, 48]} />
                  <meshBasicMaterial color={EMBER} transparent opacity={0.14} depthWrite={false} />
                </mesh>
              )}
              <mesh>
                <circleGeometry args={[m.is_me ? 0.085 : 0.065, 32]} />
                <meshBasicMaterial color={INK} />
              </mesh>
            </Billboard>
          );
        })}
        <OrbitControls enablePan={false} enableZoom={false} enableDamping autoRotate autoRotateSpeed={0.5} />
      </Canvas>

      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {group.members.map((m) => (
          <span key={m.user_id} ref={track(m.user_id)} className="invisible absolute top-0 left-0">
            <span
              className={`block font-mono text-[11px] tracking-[0.12em] whitespace-nowrap text-ink lowercase ${
                m.is_me ? "-translate-x-1/2 translate-y-[14px]" : "translate-x-[12px] -translate-y-1/2"
              }`}
            >
              {m.is_me ? "you" : m.full_name.toLowerCase()}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
