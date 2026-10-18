import { describe, expect, it } from "vitest";
import { bestPreset, termScore } from "./match";
import { MATCH_MIN } from "./match";

// Every keyword the pipeline has produced so far; each must have a preset, and a room drawn for it.
const KEYWORDS = ["board games", "cooking", "hiking", "live music", "climbing", "film", "museums", "painting", "reading",
  "running", "baking", "bouldering", "brunch", "camping", "chess", "coding", "guitar", "movies", "poetry", "startups",
  "yoga", "cocktails", "competition", "dinner parties", "late nights", "long breakfasts", "science", "songwriting",
  "training", "video games", "wildlife"];

describe("keyword catalog", () => {
  it.each(KEYWORDS)("%s has a preset", (k) => {
    expect(bestPreset(k)).not.toBeNull();
  });

  it("gives multi-room presets a variant for each keyword they serve", () => {
    for (const k of KEYWORDS) {
      const preset = bestPreset(k)!.preset;
      if (preset.variants.length < 2) continue;
      const hit = preset.variants.some((v) => (v.terms ?? []).some((t) => termScore(k, t) >= MATCH_MIN));
      expect(hit, `${k} -> ${preset.id}`).toBe(true);
    }
  });
});
