import { useEffect, useState } from 'react'
import UniverseGraph, { type GraphPoint } from './UniverseGraph'

// Seeded demo universe ("LA Hacks Demo"). Override with ?universe=<uuid>.
const DEFAULT_UNIVERSE = '00000000-0000-0000-0000-000000000001'
const universeId = new URLSearchParams(location.search).get('universe') ?? DEFAULT_UNIVERSE

export default function App() {
  const [universe, setUniverse] = useState<{ name: string; status: string } | null>(null)
  const [points, setPoints] = useState<GraphPoint[]>([])
  const [selected, setSelected] = useState<GraphPoint | null>(null)

  useEffect(() => {
    fetch(`/api/universes/${universeId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setUniverse)
      .catch(() => setUniverse(null))
  }, [])

  const groups = new Set(points.map((p) => p.group_id).filter(Boolean)).size
  const unplaced = points.filter((p) => !p.group_id).length

  return (
    <main className="page">
      <header>
        <p className="caption">( your universe )</p>
        <h1>{universe ? universe.name.toLowerCase() : 'unif.ai'}</h1>
        <p className="caption">
          {selected ? `${selected.name.toLowerCase()} · ${selected.group_id ? 'in a group' : 'not placed yet'}` : 'drag to orbit · hover someone to see their group'}
        </p>
      </header>

      <UniverseGraph
        universeId={universeId}
        onLoad={setPoints}
        onSelect={setSelected}
        style={{ flex: 1, minHeight: 0, borderRadius: 4 }}
      />

      <section className="stats">
        <div>
          <strong>{points.length}</strong>
          <span>agents</span>
        </div>
        <div>
          <strong>{groups}</strong>
          <span>groups</span>
        </div>
        <div>
          <strong>{unplaced}</strong>
          <span>unplaced</span>
        </div>
        <div>
          <strong className="accent">{universe?.status ?? '—'}</strong>
          <span>status</span>
        </div>
      </section>
    </main>
  )
}
