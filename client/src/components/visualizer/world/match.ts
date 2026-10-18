// How well a universe keyword fits a preset: plain text matching against each preset's terms, with a tiny stemmer.
// Deterministic and dependency-free, so selection gives the same answer on the server-rendered page and in tests.

import { PRESETS, type Preset } from "./presets";

/** The weakest match that still counts as "this keyword justifies this preset". */
export const MATCH_MIN = 0.6;

// Only suffixes that are safe to strip; "-er" isn't ("boulder", "river", "poker").
function stem(word: string): string {
  return word
    .replace(/(?<=\w{3})(ing|ed|es|s)$/u, "")
    .replace(/(?<=\w{3})e$/u, "");
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9&+]+/)
    .filter(Boolean)
    .map(stem);
}

/** 1 for an exact match, 0.85 when every word of the term appears in the keyword (or the other way round), 0.6
 * when one side is a single word inside the other's phrase, else 0. */
export function termScore(keyword: string, term: string): number {
  const k = words(keyword);
  const t = words(term);
  if (!k.length || !t.length) return 0;
  if (k.join(" ") === t.join(" ")) return 1;
  const ks = new Set(k);
  const ts = new Set(t);
  if (t.every((w) => ks.has(w)) || k.every((w) => ts.has(w))) return 0.85;
  if ((t.length === 1 && ks.has(t[0])) || (k.length === 1 && ts.has(k[0]))) return 0.6;
  return 0;
}

export function presetScore(keyword: string, preset: Preset): number {
  return Math.max(0, ...preset.terms.map((t) => termScore(keyword, t)));
}

/** The best preset for a keyword (ties go to the earlier preset in the library), or null below MATCH_MIN. */
export function bestPreset(keyword: string, presets: Preset[] = PRESETS): { preset: Preset; score: number } | null {
  let best: { preset: Preset; score: number } | null = null;
  for (const preset of presets) {
    const score = presetScore(keyword, preset);
    if (score >= MATCH_MIN && (!best || score > best.score)) best = { preset, score };
  }
  return best;
}
