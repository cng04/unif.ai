'use client'
// Types and a polling data hook for one universe. Shared by UniverseGraph and PairPanel so both read
// the same snapshot. Framework-free: drop into the Next client next to the two components.

import { useEffect, useState } from 'react'

export type GraphPoint = {
  user_id: string
  name: string
  x: number
  y: number
  z: number
  group_id: string | null
}

export type Pair = {
  id: string
  user_a: string
  user_b: string
  vibe_score: number | null
  dealbreaker_flags: string[]
  logistics_fit: 'strong' | 'workable' | 'incompatible' | null
  judge_rationale: string | null
}

export type KeywordMatrix = {
  keywords: { id: number; name: string }[]
  people: { user_id: string; name: string; group_id: string | null; scores: number[]; dealbreakers: number[] }[]
}

export type PairMessage = { speaker_id: string; kind: 'message'; content: string; created_at: string }

export type Universe = { id: string; name: string; status: 'onboarding' | 'matching' | 'matched' }

export type UniverseData = {
  universe: Universe | null
  points: GraphPoint[]
  pairs: Pair[]
  matrix: KeywordMatrix | null
  loading: boolean
  error: string | null
}

const get = <T,>(url: string, signal: AbortSignal): Promise<T> =>
  fetch(url, { signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status} ${url}`))))

/** Fetches universe, graph, pairs and keyword matrix; re-polls every `pollMs` while matching runs. */
export function useUniverse(apiBase: string, universeId: string, pollMs = 5000): UniverseData {
  const [data, setData] = useState<UniverseData>({
    universe: null,
    points: [],
    pairs: [],
    matrix: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    const ctrl = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const base = `${apiBase}/universes/${universeId}`

    const load = async () => {
      try {
        const [universe, points, pairs, matrix] = await Promise.all([
          get<Universe>(base, ctrl.signal),
          get<GraphPoint[]>(`${base}/graph`, ctrl.signal),
          get<Pair[]>(`${base}/pairs`, ctrl.signal),
          get<KeywordMatrix>(`${base}/keywords`, ctrl.signal),
        ])
        setData({ universe, points, pairs, matrix, loading: false, error: null })
        if (universe.status === 'matching') timer = setTimeout(load, pollMs)
      } catch (e) {
        if (!ctrl.signal.aborted) setData((d) => ({ ...d, loading: false, error: (e as Error).message }))
      }
    }
    load()
    return () => {
      ctrl.abort()
      clearTimeout(timer)
    }
  }, [apiBase, universeId, pollMs])

  return data
}

export function usePairMessages(apiBase: string, pairId: string | null) {
  const [messages, setMessages] = useState<PairMessage[] | null>(null)
  useEffect(() => {
    if (!pairId) return
    const ctrl = new AbortController()
    setMessages(null)
    get<PairMessage[]>(`${apiBase}/pairs/${pairId}/messages`, ctrl.signal)
      .then(setMessages)
      .catch(() => !ctrl.signal.aborted && setMessages([]))
    return () => ctrl.abort()
  }, [apiBase, pairId])
  return pairId ? messages : null
}

/** Keywords both people score highly on, strongest first (same ranking as the SQL in AGENTS.md). */
export function sharedKeywords(matrix: KeywordMatrix, a: string, b: string, top = 3) {
  const pa = matrix.people.find((p) => p.user_id === a)
  const pb = matrix.people.find((p) => p.user_id === b)
  if (!pa || !pb) return []
  return matrix.keywords
    .map((k, i) => ({ name: k.name, a: pa.scores[i], b: pb.scores[i] }))
    .sort((x, y) => y.a * y.b - x.a * x.b)
    .slice(0, top)
}

export const firstName = (name: string) => name.split(' ')[0].toLowerCase()

export const pairOf = (pairs: Pair[], a: string, b: string) =>
  pairs.find((p) => (p.user_a === a && p.user_b === b) || (p.user_a === b && p.user_b === a)) ?? null
