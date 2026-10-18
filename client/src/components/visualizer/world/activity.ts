// What the World shows each agent doing, derived only from the snapshot (never invented). Pure.
//
// - Pipeline stage comes from the universe status and the stage the server records during a run.
// - A chat is "live" only while the server has its pair as `running`; "completed" for a while after it's judged;
//   "historical" after that. Completed chats can be re-enacted, always labelled as such.
// - Each agent gets one intent: mill around the square while a run is still reading keywords and nobody
//   is scored yet, wait at the spawn plaza (a newcomer who is not scored yet; thinking while the interview,
//   keywords, or scoring is running), meet their partner for a live chat, sit with their group, sit on a
//   square bench (unplaced once groups exist), or wander between their home structures.

import { circleSeats, type Spot } from "./geometry";
import { tileKey, type WorldPlan } from "./plan";
import type { Selection } from "./select";
import type { SnapshotPair, WorldSnapshot } from "./snapshot";

/** How long after it's judged a chat still counts as "completed" rather than historical. */
export const RECENT_MS = 15 * 60 * 1000;

export type Stage = "onboarding" | "keywords" | "scoring" | "chats" | "groups" | "matched";
export type Provenance = "live" | "completed" | "historical";

export function pipelineStage(s: WorldSnapshot): Stage {
  if (s.universe.status === "matched") return "matched";
  if (s.universe.status === "matching") return s.universe.stage ?? "keywords";
  return "onboarding";
}

export function provenance(p: SnapshotPair, now: number): Provenance {
  if (p.status === "running") return "live";
  const done = p.completed_at ? Date.parse(p.completed_at) : Date.parse(p.started_at);
  return now - done <= RECENT_MS ? "completed" : "historical";
}

/** A pair's stable key: its id when the viewer may see it, else the two members. */
export const pairKey = (p: SnapshotPair) => p.id ?? `${[p.a, p.b].sort().join(":")}`;

export type Intent =
  | { kind: "spawn"; thinking: boolean }
  | { kind: "meet"; pair: string; spot: Spot; partner: string }
  | { kind: "group"; group: string; zone: string; spot: Spot }
  | { kind: "bench"; spot: Spot | null }
  | { kind: "wander"; zones: string[] };

export type Activity = {
  stage: Stage;
  intents: Record<string, Intent>;
  /** Pairs talking right now. */
  live: string[];
  /** Judged chats that can be re-enacted, newest first, with how they're labelled. */
  replayable: { key: string; a: string; b: string; provenance: Provenance }[];
};

const MAX_REPLAYABLE = 40;

export function deriveActivity(snapshot: WorldSnapshot, selection: Selection, plan: WorldPlan, now: number): Activity {
  const stage = pipelineStage(snapshot);
  const intents: Record<string, Intent> = {};
  const used = new Set<string>();
  const claim = (s: Spot) => used.add(tileKey(s.x, s.y));
  const isFree = (s: Spot) => !used.has(tileKey(s.x, s.y));

  // Groups first: each sits at a table in the structure its members call home most.
  const grouped = new Set<string>();
  const tablesTaken = new Set<string>();
  if (snapshot.groups.length) {
    const structures = plan.zones.filter((z) => z.kind === "structure");
    for (const g of [...snapshot.groups].sort((a, b) => b.member_ids.length - a.member_ids.length || a.id.localeCompare(b.id))) {
      const score = (zoneId: string) => g.member_ids.filter((m) => selection.homes[m]?.includes(zoneId)).length;
      const ranked = structures
        .map((z) => z.id)
        .sort((a, b) => score(b) - score(a) || a.localeCompare(b));
      let seated = false;
      for (const zoneId of ranked) {
        const table = (plan.circles[zoneId] ?? []).find((c) => !tablesTaken.has(`${zoneId}:${c.x},${c.y}`));
        if (!table) continue;
        tablesTaken.add(`${zoneId}:${table.x},${table.y}`);
        const seats = circleSeats(table.x, table.y, table.pose, table.activity).filter(isFree);
        g.member_ids.forEach((m, i) => {
          const spot = seats[i] ?? seats[seats.length - 1];
          if (!spot) return;
          claim(spot);
          intents[m] = { kind: "group", group: g.id, zone: zoneId, spot };
          grouped.add(m);
        });
        seated = true;
        break;
      }
      // More groups than tables: they gather on the square's benches like everyone else waiting.
      if (!seated) for (const m of g.member_ids) grouped.add(m);
    }
  }

  // Live chats: the two agents meet at a shared home's chat spot, else in the square.
  const live: string[] = [];
  const members = new Map(snapshot.members.map((m) => [m.id, m]));
  for (const p of snapshot.pairs.filter((p) => p.status === "running")) {
    if (!members.has(p.a) || !members.has(p.b) || intents[p.a] || intents[p.b]) continue;
    const shared = (selection.homes[p.a] ?? []).filter((z) => (selection.homes[p.b] ?? []).includes(z));
    const zones = [...shared, "square"];
    let pairSpots: [Spot, Spot] | null = null;
    for (const z of zones) {
      pairSpots = (plan.chatSpots[z] ?? []).find(([x, y]) => isFree(x) && isFree(y)) ?? null;
      if (pairSpots) break;
    }
    if (!pairSpots) continue; // more simultaneous chats than meeting spots; they stay where they are
    const key = pairKey(p);
    claim(pairSpots[0]);
    claim(pairSpots[1]);
    intents[p.a] = { kind: "meet", pair: key, spot: pairSpots[0], partner: p.b };
    intents[p.b] = { kind: "meet", pair: key, spot: pairSpots[1], partner: p.a };
    live.push(key);
  }

  // Everyone else. A run that has not scored anyone yet used to freeze the whole cast at the spawn plaza
  // until keyword extraction finished. They mill through the square (and any home they already have) instead.
  const waitingOnKeywords = (stage === "keywords" || stage === "scoring") && snapshot.members.every((m) => !m.scored);
  const benches = plan.benches.filter(isFree);
  for (const m of snapshot.members) {
    if (intents[m.id]) continue;
    if (!m.scored && waitingOnKeywords) {
      const homes = selection.homes[m.id] ?? [];
      intents[m.id] = { kind: "wander", zones: homes.length ? [...homes, "square"] : ["square"] };
    } else if (!m.scored) intents[m.id] = { kind: "spawn", thinking: m.busy || stage === "keywords" || stage === "scoring" };
    else if (snapshot.groups.length && !grouped.has(m.id)) {
      const spot = benches.shift() ?? null;
      if (spot) claim(spot);
      intents[m.id] = { kind: "bench", spot };
    } else if (grouped.has(m.id)) intents[m.id] = { kind: "bench", spot: null };
    else intents[m.id] = { kind: "wander", zones: (selection.homes[m.id] ?? []).length ? selection.homes[m.id] : ["square"] };
  }

  const replayable = snapshot.pairs
    .filter((p) => p.status === "complete" && members.has(p.a) && members.has(p.b))
    .sort((x, y) => (y.completed_at ?? "").localeCompare(x.completed_at ?? ""))
    .slice(0, MAX_REPLAYABLE)
    .map((p) => ({ key: pairKey(p), a: p.a, b: p.b, provenance: provenance(p, now) }));

  return { stage, intents, live, replayable };
}
