'use client'
// Self-contained 3D constellation of a universe: GET {apiBase}/universes/{id}/graph.
// No framework-specific imports, so it drops into the Next client as-is (the directive above is
// what Next needs; Vite ignores it). Peer deps: three, @react-three/fiber, @react-three/drei.

import { Billboard, Html, Line, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useEffect, useMemo, useState, type CSSProperties } from 'react'

export type GraphPoint = {
  user_id: string
  name: string
  x: number
  y: number
  z: number
  group_id: string | null
}

type Props = {
  universeId: string
  /** Base URL of the FastAPI server, e.g. "/api" behind a proxy or "http://localhost:8000". */
  apiBase?: string
  /** Drawn larger and labelled "you", like the "me" node in the designs. */
  meUserId?: string
  onLoad?: (points: GraphPoint[]) => void
  onSelect?: (point: GraphPoint) => void
  style?: CSSProperties
}

const SPREAD = 2.4 // the API returns coords in [-1, 1]
const INK = '#1c1b1a'
const MUTED = '#8a8782'
const ACCENT = '#e0623b'

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

// Soft peach / blue blurs over warm paper, plus a faint grain, matching the Paper mockups.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.09'/%3E%3C/svg%3E\")"
const BACKDROP = [
  GRAIN,
  'radial-gradient(38% 34% at 58% 46%, rgba(236,160,110,.55), transparent 70%)',
  'radial-gradient(30% 30% at 30% 30%, rgba(244,206,170,.5), transparent 70%)',
  'radial-gradient(36% 32% at 78% 78%, rgba(160,178,222,.55), transparent 70%)',
  'radial-gradient(40% 36% at 18% 72%, rgba(196,200,176,.35), transparent 70%)',
].join(',')

type Edge = { a: GraphPoint; b: GraphPoint; group: string }

/** Minimum spanning tree inside each group, so every group reads as one connected constellation. */
function groupEdges(points: GraphPoint[]): Edge[] {
  const byGroup = new Map<string, GraphPoint[]>()
  for (const p of points) {
    if (!p.group_id) continue
    const list = byGroup.get(p.group_id) ?? []
    list.push(p)
    byGroup.set(p.group_id, list)
  }
  const dist = (a: GraphPoint, b: GraphPoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
  const edges: Edge[] = []
  for (const [group, members] of byGroup) {
    const inTree = new Set([members[0]])
    while (inTree.size < members.length) {
      let best: Edge | null = null
      let bestD = Infinity
      for (const a of inTree)
        for (const b of members)
          if (!inTree.has(b) && dist(a, b) < bestD) {
            bestD = dist(a, b)
            best = { a, b, group }
          }
      edges.push(best!)
      inTree.add(best!.b)
    }
  }
  return edges
}

const pos = (p: GraphPoint): [number, number, number] => [p.x * SPREAD, p.y * SPREAD, p.z * SPREAD]
const firstName = (name: string) => name.split(' ')[0].toLowerCase()

function Constellation({
  points,
  meUserId,
  onSelect,
}: {
  points: GraphPoint[]
  meUserId?: string
  onSelect?: (p: GraphPoint) => void
}) {
  const [hover, setHover] = useState<GraphPoint | null>(null)
  const edges = useMemo(() => groupEdges(points), [points])
  const focusGroup = hover?.group_id ?? null
  const isFocused = (p: GraphPoint) => !hover || p === hover || (focusGroup !== null && p.group_id === focusGroup)

  return (
    <>
      {edges.map((e) => {
        const on = !hover || e.group === focusGroup
        return (
          <Line
            key={e.a.user_id + e.b.user_id}
            points={[pos(e.a), pos(e.b)]}
            color={on && hover ? ACCENT : INK}
            lineWidth={on && hover ? 1.4 : 0.9}
            transparent
            opacity={on ? 0.75 : 0.12}
          />
        )
      })}

      {points.map((p) => {
        const me = p.user_id === meUserId
        const focused = isFocused(p)
        const color = hover && focused && focusGroup ? ACCENT : INK
        return (
          <group key={p.user_id} position={pos(p)}>
            <Billboard>
              <mesh
                onPointerOver={(e) => (e.stopPropagation(), setHover(p))}
                onPointerOut={() => setHover((h) => (h === p ? null : h))}
                onClick={(e) => (e.stopPropagation(), onSelect?.(p))}
              >
                {/* Ungrouped people are hollow, like "lena" in 7a. */}
                {p.group_id ? (
                  <circleGeometry args={[me ? 0.09 : 0.055, 32]} />
                ) : (
                  <ringGeometry args={[0.042, 0.06, 32]} />
                )}
                <meshBasicMaterial color={color} transparent opacity={focused ? 1 : 0.2} />
              </mesh>
            </Billboard>
            <Html
              position={[0.1, 0, 0]}
              zIndexRange={[10, 0]}
              style={{
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                transform: 'translateY(-50%)',
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: '.02em',
                color: focused ? INK : MUTED,
                opacity: focused ? 1 : 0.35,
                transition: 'opacity .15s',
              }}
            >
              {me ? 'you' : firstName(p.name)}
            </Html>
          </group>
        )
      })}
    </>
  )
}

export default function UniverseGraph({ universeId, apiBase = '/api', meUserId, onLoad, onSelect, style }: Props) {
  const [points, setPoints] = useState<GraphPoint[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    setPoints(null)
    setError(null)
    fetch(`${apiBase}/universes/${universeId}/graph`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: GraphPoint[]) => {
        setPoints(data)
        onLoad?.(data)
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(String(e.message ?? e))
      })
    return () => ctrl.abort()
    // onLoad is a callback prop; refetching when its identity changes would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, universeId])

  const status = error
    ? `( couldn't load graph · ${error} )`
    : points === null
      ? '( loading )'
      : points.length === 0
        ? '( no matching data yet )'
        : null

  return (
    <div style={{ position: 'relative', background: `${BACKDROP}, #ecebe8`, overflow: 'hidden', ...style }}>
      {status ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            fontFamily: MONO,
            fontSize: 11,
            color: MUTED,
          }}
        >
          {status}
        </div>
      ) : (
        <Canvas camera={{ position: [0, 0, 7.5], fov: 40 }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
          <Constellation points={points!} meUserId={meUserId} onSelect={onSelect} />
          <OrbitControls enablePan={false} enableDamping autoRotate autoRotateSpeed={0.35} minDistance={3} maxDistance={14} />
        </Canvas>
      )}
    </div>
  )
}
