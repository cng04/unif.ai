// Structure selection: which structures a universe's keywords justify. Pure and deterministic.
//
// 1. Each keyword picks its preset by text (match.ts).
// 2. A keyword no preset matches joins the structure whose keywords the same people share most (co-occurrence in
//    members' top keywords); with no such overlap it's left out, never given a structure of its own.
// 3. One structure per preset. A structure needs MIN_PEOPLE distinct people among its keywords' fans.
// 4. Two structures whose crowds mostly overlap merge into one open-plan zone (both presets' furniture).
// 5. Size tier, decoration and population follow each structure's share of people.
//
// Inputs are only fields both the admin and participant snapshots carry, so everyone sees the same world.

import { bestPreset } from "./match";
import { PRESETS, type Preset, type Tier } from "./presets";

export const MIN_PEOPLE = 2;
/** Jaccard overlap of two structures' people above which they become one combined zone. */
export const MERGE_OVERLAP = 0.6;

export type SelectInput = {
  keywords: { name: string; people: number }[];
  members: { id: string; top_keywords: string[] }[];
};

export type Structure = {
  /** Stable id: the preset ids it combines, joined. */
  id: string;
  presets: Preset[];
  keywords: string[];
  /** Members whose top keywords point here, sorted. */
  people: string[];
  /** Share of placed people (0-1), which drives tier, decoration and population. */
  prominence: number;
  tier: Tier;
};

export type Selection = {
  structures: Structure[];
  /** Keywords that justified nothing (no preset and no shared crowd), for the admin to see. */
  leftOut: string[];
  /** For each member, the structures they belong to, best first (where their agent wanders). */
  homes: Record<string, string[]>;
};

export function selectStructures(input: SelectInput, presets: Preset[] = PRESETS): Selection {
  const fans = new Map<string, Set<string>>(); // keyword -> members with it in their top keywords
  for (const m of input.members) for (const k of m.top_keywords) (fans.get(k) ?? fans.set(k, new Set()).get(k)!).add(m.id);

  // 1. Text match.
  const byPreset = new Map<string, Set<string>>();
  const unmatched: string[] = [];
  for (const { name } of [...input.keywords].sort((a, b) => a.name.localeCompare(b.name))) {
    const hit = bestPreset(name, presets);
    if (hit) (byPreset.get(hit.preset.id) ?? byPreset.set(hit.preset.id, new Set()).get(hit.preset.id)!).add(name);
    else unmatched.push(name);
  }

  // 2. Unmatched keywords follow their crowd to the closest structure, if there is one.
  const leftOut: string[] = [];
  for (const name of unmatched) {
    const crowd = fans.get(name) ?? new Set<string>();
    let best: { id: string; shared: number } | null = null;
    for (const [id, kws] of [...byPreset].sort(([a], [b]) => a.localeCompare(b))) {
      const people = union([...kws].map((k) => fans.get(k)));
      const shared = [...crowd].filter((p) => people.has(p)).length;
      if (shared > 0 && (!best || shared > best.shared)) best = { id, shared };
    }
    if (best) byPreset.get(best.id)!.add(name);
    else leftOut.push(name);
  }

  // 3. People per preset; drop structures without a crowd.
  let groups = [...byPreset]
    .map(([id, kws]) => ({ ids: [id], keywords: [...kws].sort(), people: union([...kws].map((k) => fans.get(k))) }))
    .filter((g) => g.people.size >= MIN_PEOPLE);
  for (const g of [...byPreset].filter(([id]) => !groups.some((x) => x.ids.includes(id)))) leftOut.push(...g[1]);

  // 4. Merge structures whose crowds are mostly the same people, biggest overlap first, until none qualify.
  for (;;) {
    let best: { i: number; j: number; overlap: number } | null = null;
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        const overlap = jaccard(groups[i].people, groups[j].people);
        if (overlap >= MERGE_OVERLAP && (!best || overlap > best.overlap)) best = { i, j, overlap };
      }
    if (!best) break;
    const a = groups[best.i];
    const b = groups[best.j];
    const merged = { ids: [...a.ids, ...b.ids], keywords: [...a.keywords, ...b.keywords].sort(), people: union([a.people, b.people]) };
    groups = groups.filter((_, k) => k !== best.i && k !== best.j).concat(merged);
  }

  // 5. Prominence and tier from each structure's share of everyone placed somewhere.
  const placed = union(groups.map((g) => g.people)).size || 1;
  const order = (ids: string[]) => ids.sort((x, y) => presets.findIndex((p) => p.id === x) - presets.findIndex((p) => p.id === y));
  const structures: Structure[] = groups
    .map((g) => {
      const ids = order(g.ids);
      const prominence = g.people.size / placed;
      return {
        id: ids.join("+"),
        presets: ids.map((id) => presets.find((p) => p.id === id)!),
        keywords: g.keywords,
        people: [...g.people].sort(),
        prominence,
        tier: tierFor(prominence),
      };
    })
    .sort((a, b) => b.people.length - a.people.length || a.id.localeCompare(b.id));

  // Homes: a member's structures in the order of their own top keywords.
  const homes: Record<string, string[]> = {};
  for (const m of input.members) {
    const mine: string[] = [];
    for (const k of m.top_keywords) {
      const s = structures.find((x) => x.keywords.includes(k) && x.people.includes(m.id));
      if (s && !mine.includes(s.id)) mine.push(s.id);
    }
    homes[m.id] = mine;
  }

  return { structures, leftOut: leftOut.sort(), homes };
}

export function tierFor(prominence: number): Tier {
  return prominence >= 0.3 ? "L" : prominence >= 0.15 ? "M" : "S";
}

function union(sets: (Set<string> | undefined)[]): Set<string> {
  const out = new Set<string>();
  for (const s of sets) if (s) for (const v of s) out.add(v);
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter((x) => b.has(x)).length;
  return inter / (a.size + b.size - inter || 1);
}
