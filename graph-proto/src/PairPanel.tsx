'use client'
// Side panel for a graph selection: the viewer's agent-to-agent chat with the selected person (frame 8b),
// or their shared keywords if the agents never met. Only the viewer's own chats are shown; the API itself
// is open until there's auth.

import type { CSSProperties } from 'react'
import type { Selection } from './UniverseGraph'
import { firstName, pairOf, sharedKeywords, usePairMessages, type Pair, type UniverseData } from './universe'

type Props = {
  apiBase: string
  data: UniverseData
  meUserId?: string
  selected: Selection | null
  onSelect: (s: Selection | null) => void
  style?: CSSProperties
}

const score = (vibe: number | null) => (vibe == null ? '—' : (vibe / 10).toFixed(2).replace(/^0/, ''))

function Transcript({ apiBase, pair, meUserId }: { apiBase: string; pair: Pair; meUserId: string }) {
  const messages = usePairMessages(apiBase, pair.id)
  if (!messages) return <p className="caption">( loading chat )</p>
  if (messages.length === 0) return <p className="caption">( no messages saved for this chat )</p>
  return (
    <div className="chat">
      {messages.map((m, i) => (
        <p key={i} className={m.speaker_id === meUserId ? 'bubble mine' : 'bubble'}>
          {m.content}
        </p>
      ))}
    </div>
  )
}

function Verdict({ pair }: { pair: Pair }) {
  return (
    <div className="verdict">
      <div>
        <strong>{score(pair.vibe_score)}</strong>
        <span>chemistry</span>
      </div>
      <div>
        <strong>{pair.logistics_fit ?? '—'}</strong>
        <span>logistics</span>
      </div>
      <div>
        <strong className={pair.dealbreaker_flags.length ? 'accent' : ''}>{pair.dealbreaker_flags.length || 'none'}</strong>
        <span>dealbreakers</span>
      </div>
    </div>
  )
}

function Keywords({ data, a, b }: { data: UniverseData; a: string; b: string }) {
  if (!data.matrix) return null
  return (
    <ul className="keywords">
      {sharedKeywords(data.matrix, a, b).map((k) => (
        <li key={k.name}>
          <span>{k.name}</span>
          <span className="caption">
            {k.a.toFixed(2).replace(/^0/, '')} · {k.b.toFixed(2).replace(/^0/, '')}
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function PairPanel({ apiBase, data, meUserId = '', selected, onSelect, style }: Props) {
  const nameOf = (id: string) => firstName(data.points.find((p) => p.user_id === id)?.name ?? '?')

  // Selecting a pair that includes the viewer is the same as selecting the other person.
  let otherId: string | null = null
  if (selected?.kind === 'person') otherId = selected.userId
  if (selected?.kind === 'pair' && meUserId && [selected.pair.user_a, selected.pair.user_b].includes(meUserId))
    otherId = selected.pair.user_a === meUserId ? selected.pair.user_b : selected.pair.user_a

  let body
  if (!selected) {
    body = <p className="caption">( tap someone to read how your agents met )</p>
  } else if (selected.kind === 'pair' && !otherId) {
    // Someone else's chat: verdict only.
    const p = selected.pair
    body = (
      <>
        <p className="caption">( their agents · not your chat )</p>
        <h2>
          {nameOf(p.user_a)} × {nameOf(p.user_b)}
        </h2>
        <Verdict pair={p} />
        <p className="caption">( only {nameOf(p.user_a)} and {nameOf(p.user_b)} can read this chat )</p>
      </>
    )
  } else if (!meUserId) {
    body = (
      <>
        <h2>{nameOf(otherId!)}</h2>
        <p className="caption">( pick who you're viewing as to see your agents' chats )</p>
      </>
    )
  } else if (otherId === meUserId) {
    const mine = data.pairs.filter((p) => p.user_a === meUserId || p.user_b === meUserId)
    body = (
      <>
        <p className="caption">( that's you )</p>
        <h2>your agent met {mine.length}</h2>
        <ul className="keywords">
          {mine
            .sort((x, y) => (y.vibe_score ?? 0) - (x.vibe_score ?? 0))
            .map((p) => {
              const other = p.user_a === meUserId ? p.user_b : p.user_a
              return (
                <li key={p.id}>
                  <button onClick={() => onSelect({ kind: 'person', userId: other })}>{nameOf(other)}</button>
                  <span className="caption">{score(p.vibe_score)}</span>
                </li>
              )
            })}
        </ul>
      </>
    )
  } else {
    const pair = pairOf(data.pairs, meUserId, otherId!)
    body = pair ? (
      <>
        <p className="caption">( your agent × {nameOf(otherId!)}'s agent )</p>
        <h2>you × {nameOf(otherId!)}</h2>
        <Verdict pair={pair} />
        <Keywords data={data} a={meUserId} b={otherId!} />
        <Transcript apiBase={apiBase} pair={pair} meUserId={meUserId} />
      </>
    ) : (
      <>
        <p className="caption">( your agents haven't met )</p>
        <h2>you × {nameOf(otherId!)}</h2>
        <p className="caption">what you'd have in common · your score · theirs</p>
        <Keywords data={data} a={meUserId} b={otherId!} />
      </>
    )
  }

  return (
    <aside className="panel" style={style}>
      {body}
    </aside>
  )
}
