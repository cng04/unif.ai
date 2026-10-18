import { useState } from 'react'
import PairPanel from './PairPanel'
import UniverseGraph, { type Axes, type Selection } from './UniverseGraph'
import { useUniverse } from './universe'

// Seeded demo universe ("LA Hacks Demo"). Override with ?universe=<uuid>; ?me=<user_id> sets the viewer.
const API = '/api'
const params = new URLSearchParams(location.search)
const universeId = params.get('universe') ?? '00000000-0000-0000-0000-000000000001'

function setParam(key: string, value: string) {
  const url = new URL(location.href)
  if (value) url.searchParams.set(key, value)
  else url.searchParams.delete(key)
  history.replaceState(null, '', url)
}

export default function App() {
  const data = useUniverse(API, universeId)
  const [me, setMe] = useState(params.get('me') ?? '')
  const [axes, setAxes] = useState<Axes>('auto')
  const [selected, setSelected] = useState<Selection | null>(null)

  const keywords = data.matrix?.keywords.map((k) => k.name) ?? []
  const groups = new Set(data.points.map((p) => p.group_id).filter(Boolean)).size
  const unplaced = data.points.filter((p) => !p.group_id).length
  const people = [...data.points].sort((a, b) => a.name.localeCompare(b.name))

  const setAxis = (i: number, name: string) => {
    const next = (axes === 'auto' ? keywords.slice(0, 3) : [...axes]) as [string, string, string]
    next[i] = name
    setAxes(next)
  }

  return (
    <main className="page">
      <header>
        <p className="caption">( your universe )</p>
        <h1>{data.universe ? data.universe.name.toLowerCase() : 'unif.ai'}</h1>
        <div className="controls">
          <label>
            <span className="caption">viewing as</span>
            <select
              value={me}
              onChange={(e) => {
                setMe(e.target.value)
                setParam('me', e.target.value)
                setSelected(null)
              }}
            >
              <option value="">nobody</option>
              {people.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.name.toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="caption">axes</span>
            <select value={axes === 'auto' ? 'auto' : 'keywords'} onChange={(e) => setAxes(e.target.value === 'auto' ? 'auto' : (keywords.slice(0, 3) as Axes))}>
              <option value="auto">auto (similarity)</option>
              <option value="keywords" disabled={keywords.length < 3}>
                keywords
              </option>
            </select>
          </label>
          {axes !== 'auto' &&
            axes.map((name, i) => (
              <label key={i}>
                <span className="caption">{'xyz'[i]}</span>
                <select value={name} onChange={(e) => setAxis(i, e.target.value)}>
                  {keywords.map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
              </label>
            ))}
        </div>
      </header>

      <div className="stage">
        <UniverseGraph
          data={data}
          meUserId={me}
          axes={axes}
          selected={selected}
          onSelect={setSelected}
          style={{ flex: 1, minHeight: 360, borderRadius: 4 }}
        />
        <PairPanel apiBase={API} data={data} meUserId={me} selected={selected} onSelect={setSelected} />
      </div>

      <section className="stats">
        <div>
          <strong>{data.points.length}</strong>
          <span>agents</span>
        </div>
        <div>
          <strong>{data.pairs.length}</strong>
          <span>agent chats</span>
        </div>
        <div>
          <strong>{groups}</strong>
          <span>groups{unplaced ? ` · ${unplaced} unplaced` : ''}</span>
        </div>
        <div>
          <strong className="accent">{data.universe?.status ?? '—'}</strong>
          <span>status</span>
        </div>
      </section>
    </main>
  )
}
