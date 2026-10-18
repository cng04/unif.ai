'use client'
// 3D constellation of a universe, styled after the Paper mockups (frame 7a). Data comes from
// useUniverse() in ./universe. No framework-specific imports, so it drops into the Next client as-is.
// Peer deps: three, @react-three/fiber, @react-three/drei.

import { Billboard, Html, Line, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useMemo, useState, type CSSProperties } from 'react'
import { firstName, type GraphPoint, type Pair, type UniverseData } from './universe'

export type Selection = { kind: 'person'; userId: string } | { kind: 'pair'; pair: Pair }

/** "auto" = server-side PCA of all keyword scores; otherwise three keyword names for x, y, z. */
export type Axes = 'auto' | [string, string, string]

type Props = {
  data: UniverseData
  /** Drawn larger and labelled "you", like the "me" node in the designs. */
  meUserId?: string
  axes?: Axes
  selected?: Selection | null
  onSelect?: (s: Selection | null) => void
  style?: CSSProperties
}

type Vec3 = [number, number, number]

const SPREAD = 2.4 // half-width of the plotted cube
const INK = '#1c1b1a'
const MUTED = '#8a8782'
const ACCENT = '#e0623b'
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

// Soft peach / blue blurs over warm paper, plus a faint grain.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.09'/%3E%3C/svg%3E\")"
const BACKDROP = [
  GRAIN,
  'radial-gradient(38% 34% at 58% 46%, rgba(236,160,110,.55), transparent 70%)',
  'radial-gradient(30% 30% at 30% 30%, rgba(244,206,170,.5), transparent 70%)',
  'radial-gradient(36% 32% at 78% 78%, rgba(160,178,222,.55), transparent 70%)',
  'radial-gradient(40% 36% at 18% 72%, rgba(196,200,176,.35), transparent 70%)',
].join(',')

const label: CSSProperties = {
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: '.02em',
  transition: 'opacity .15s',
}

const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/** Minimum spanning tree inside each group, so every group reads as one connected constellation. */
function groupTree(points: GraphPoint[], pos: Map<string, Vec3>): [string, string][] {
  const byGroup = new Map<string, string[]>()
  for (const p of points) if (p.group_id) byGroup.set(p.group_id, [...(byGroup.get(p.group_id) ?? []), p.user_id])
  const dist = (a: string, b: string) => {
    const [pa, pb] = [pos.get(a)!, pos.get(b)!]
    return Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2])
  }
  const edges: [string, string][] = []
  for (const members of byGroup.values()) {
    const inTree = new Set([members[0]])
    while (inTree.size < members.length) {
      let best: [string, string] = ['', '']
      let bestD = Infinity
      for (const a of inTree)
        for (const b of members)
          if (!inTree.has(b) && dist(a, b) < bestD) {
            bestD = dist(a, b)
            best = [a, b]
          }
      edges.push(best)
      inTree.add(best[1])
    }
  }
  return edges
}

function positions(data: UniverseData, axes: Axes): Map<string, Vec3> {
  const pos = new Map<string, Vec3>()
  if (axes === 'auto' || !data.matrix) {
    for (const p of data.points) pos.set(p.user_id, [p.x * SPREAD, p.y * SPREAD, p.z * SPREAD])
    return pos
  }
  const idx = axes.map((name) => data.matrix!.keywords.findIndex((k) => k.name === name))
  for (const p of data.matrix.people) {
    // Scores are 0-1 with 0.5 = no signal, so "no signal" sits at the origin.
    pos.set(p.user_id, idx.map((i) => ((p.scores[i] ?? 0.5) - 0.5) * 2 * SPREAD) as Vec3)
  }
  return pos
}

function KeywordAxes({ names }: { names: [string, string, string] }) {
  const ends: Vec3[] = [
    [SPREAD, 0, 0],
    [0, SPREAD, 0],
    [0, 0, SPREAD],
  ]
  return (
    <>
      {ends.map((end, i) => (
        <group key={i}>
          <Line points={[end.map((v) => -v) as Vec3, end]} color={MUTED} lineWidth={0.6} dashed dashSize={0.06} gapSize={0.06} transparent opacity={0.6} />
          <Html position={end} center zIndexRange={[5, 0]} style={{ ...label, color: MUTED }}>
            {'xyz'[i]} · {names[i]} →
          </Html>
        </group>
      ))}
    </>
  )
}

function Constellation({ data, meUserId, axes, selected, onSelect }: Required<Omit<Props, 'style'>>) {
  const [hover, setHover] = useState<string | null>(null)
  const pos = useMemo(() => positions(data, axes), [data, axes])
  const points = useMemo(() => data.points.filter((p) => pos.has(p.user_id)), [data.points, pos])
  const byId = useMemo(() => new Map(points.map((p) => [p.user_id, p])), [points])
  const tree = useMemo(() => groupTree(points, pos), [points, pos])
  const treeKeys = useMemo(() => new Set(tree.map(([a, b]) => edgeKey(a, b))), [tree])

  // Who to highlight: the hovered or selected person, their group, and everyone their agent met.
  const focusId = hover ?? (selected?.kind === 'person' ? selected.userId : null)
  const focusSet = useMemo(() => {
    if (selected?.kind === 'pair' && !hover) return new Set([selected.pair.user_a, selected.pair.user_b])
    if (!focusId) return null
    const group = byId.get(focusId)?.group_id
    const set = new Set([focusId])
    for (const p of points) if (group && p.group_id === group) set.add(p.user_id)
    for (const p of data.pairs) {
      if (p.user_a === focusId) set.add(p.user_b)
      if (p.user_b === focusId) set.add(p.user_a)
    }
    return set
  }, [focusId, selected, hover, byId, points, data.pairs])
  const lit = (id: string) => !focusSet || focusSet.has(id)
  const touchesFocus = (a: string, b: string) =>
    focusSet !== null && (focusId ? a === focusId || b === focusId : focusSet.has(a) && focusSet.has(b))

  return (
    <>
      {axes !== 'auto' && <KeywordAxes names={axes} />}

      {/* Group constellations: solid. */}
      {tree.map(([a, b]) => (
        <Line
          key={edgeKey(a, b)}
          points={[pos.get(a)!, pos.get(b)!]}
          color={focusSet && lit(a) && lit(b) ? ACCENT : INK}
          lineWidth={0.9}
          transparent
          opacity={!focusSet ? 0.7 : lit(a) && lit(b) ? 0.85 : 0.08}
        />
      ))}

      {/* Judged pairs (agents chatted, Jev scored chemistry). Across groups they're dashed and faint. */}
      {data.pairs.map((p) => {
        if (!pos.has(p.user_a) || !pos.has(p.user_b) || treeKeys.has(edgeKey(p.user_a, p.user_b))) return null
        const sameGroup = byId.get(p.user_a)?.group_id != null && byId.get(p.user_a)?.group_id === byId.get(p.user_b)?.group_id
        const isSelected = selected?.kind === 'pair' && selected.pair.id === p.id
        const on = isSelected || touchesFocus(p.user_a, p.user_b)
        return (
          <Line
            key={p.id}
            points={[pos.get(p.user_a)!, pos.get(p.user_b)!]}
            color={on ? ACCENT : INK}
            lineWidth={isSelected ? 2 : on ? 1.2 : 0.7}
            dashed={!sameGroup}
            dashSize={0.05}
            gapSize={0.05}
            transparent
            opacity={on ? 0.9 : focusSet ? 0.05 : sameGroup ? 0.35 : 0.22}
            onClick={(e) => (e.stopPropagation(), onSelect({ kind: 'pair', pair: p }))}
            onPointerOver={() => (document.body.style.cursor = 'pointer')}
            onPointerOut={() => (document.body.style.cursor = '')}
          />
        )
      })}

      {points.map((p) => {
        const me = p.user_id === meUserId
        const on = lit(p.user_id)
        const accent = focusSet !== null && on && (p.user_id === focusId || selected?.kind === 'pair')
        return (
          <group key={p.user_id} position={pos.get(p.user_id)!}>
            <Billboard>
              <mesh
                onPointerOver={(e) => (e.stopPropagation(), setHover(p.user_id), (document.body.style.cursor = 'pointer'))}
                onPointerOut={() => (setHover((h) => (h === p.user_id ? null : h)), (document.body.style.cursor = ''))}
                onClick={(e) => (e.stopPropagation(), onSelect({ kind: 'person', userId: p.user_id }))}
              >
                {/* Ungrouped people are hollow, like "lena" in 7a. */}
                {p.group_id ? (
                  <circleGeometry args={[me ? 0.09 : 0.055, 32]} />
                ) : (
                  <ringGeometry args={[me ? 0.07 : 0.042, me ? 0.095 : 0.06, 32]} />
                )}
                <meshBasicMaterial color={accent ? ACCENT : INK} transparent opacity={on ? 1 : 0.2} />
              </mesh>
            </Billboard>
            <Html
              position={[0.1, 0, 0]}
              zIndexRange={[10, 0]}
              style={{ ...label, transform: 'translateY(-50%)', color: on ? INK : MUTED, opacity: on ? 1 : 0.35 }}
            >
              {me ? 'you' : firstName(p.name)}
            </Html>
          </group>
        )
      })}
    </>
  )
}

export default function UniverseGraph({ data, meUserId = '', axes = 'auto', selected = null, onSelect = () => {}, style }: Props) {
  const status = data.error
    ? `( couldn't load graph · ${data.error} )`
    : data.loading
      ? '( loading )'
      : data.points.length === 0
        ? data.universe?.status === 'matching'
          ? '( matching · waiting for jev scores )'
          : '( no matching data yet )'
        : null

  return (
    <div style={{ position: 'relative', background: `${BACKDROP}, #ecebe8`, overflow: 'hidden', ...style }}>
      {status ? (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', ...label, fontSize: 11, color: MUTED }}>
          {status}
        </div>
      ) : (
        <Canvas
          camera={{ position: [0, 0, 7.5], fov: 40 }}
          gl={{ alpha: true, antialias: true }}
          dpr={[1, 2]}
          onPointerMissed={() => onSelect(null)}
        >
          <Constellation data={data} meUserId={meUserId} axes={axes} selected={selected} onSelect={onSelect} />
          <OrbitControls enablePan={false} enableDamping autoRotate={!selected} autoRotateSpeed={0.35} minDistance={3} maxDistance={14} />
        </Canvas>
      )}
    </div>
  )
}
