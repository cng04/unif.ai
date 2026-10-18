// Fold one public chat turn into the snapshot the sprites are already showing. A slower poll must not
// replace a line the stream already delivered, and an older stream event must not replace a newer one.

import type { WorldSnapshot } from "./snapshot";

const LIMIT = 72;

export function clipTurn(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length <= LIMIT ? flat : `${flat.slice(0, LIMIT - 1).trimEnd()}…`;
}

export type LiveTurn = { id: number; pair_id: string; speaker_id: string; content: string };

/** Put this turn on its pair. Unknown pairs and older turns leave the snapshot as it was. */
export function mergeLiveTurn(snapshot: WorldSnapshot, turn: LiveTurn): WorldSnapshot {
  const content = clipTurn(turn.content);
  let changed = false;
  const pairs = snapshot.pairs.map((p) => {
    if (p.id !== turn.pair_id) return p;
    if (p.line?.id != null && p.line.id >= turn.id) return p;
    changed = true;
    return { ...p, line: { id: turn.id, speaker_id: turn.speaker_id, content } };
  });
  return changed ? { ...snapshot, pairs } : snapshot;
}

/** Keep lines the stream already showed when a snapshot fetched earlier arrives late. */
export function keepNewerLines(current: WorldSnapshot, next: WorldSnapshot): WorldSnapshot {
  const shown = new Map<string, { id: number; speaker_id: string; content: string }>();
  for (const p of current.pairs) {
    const id = p.line?.id;
    if (p.id && p.line && id != null) shown.set(p.id, { id, speaker_id: p.line.speaker_id, content: p.line.content });
  }
  let changed = false;
  const pairs = next.pairs.map((p) => {
    const live = p.id ? shown.get(p.id) : undefined;
    if (!live || (p.line?.id != null && p.line.id >= live.id)) return p;
    changed = true;
    return { ...p, line: live };
  });
  return changed ? { ...next, pairs } : next;
}
