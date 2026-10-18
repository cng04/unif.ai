import { describe, expect, it } from "vitest";
import { bestPreset, termScore } from "./match";
import { MIN_PEOPLE, selectStructures, tierFor, type SelectInput } from "./select";

const member = (id: string, ...top: string[]) => ({ id, top_keywords: top });
const kw = (...names: string[]) => names.map((name) => ({ name, people: 0 }));

describe("keyword matching", () => {
  it("matches stems, phrases and single words inside phrases", () => {
    expect(termScore("Bouldering", "boulder")).toBe(1);
    expect(termScore("live music", "music")).toBe(0.85);
    expect(termScore("long breakfasts", "breakfast")).toBe(0.85);
    expect(termScore("reliability", "read")).toBe(0);
    expect(bestPreset("rock climbing")?.preset.id).toBe("climbing");
    expect(bestPreset("board games")?.preset.id).toBe("boardgames");
    expect(bestPreset("punctuality")).toBeNull();
  });
});

describe("structure selection", () => {
  it("builds nothing without keywords or people", () => {
    expect(selectStructures({ keywords: [], members: [] })).toEqual({ structures: [], leftOut: [], homes: {} });
    expect(selectStructures({ keywords: kw("climbing"), members: [] }).structures).toEqual([]);
  });

  it("gives related keywords one structure, never one per keyword", () => {
    const sel = selectStructures({
      keywords: kw("climbing", "bouldering"),
      members: [member("a", "climbing"), member("b", "bouldering"), member("c", "climbing", "bouldering")],
    });
    expect(sel.structures.map((s) => s.id)).toEqual(["climbing"]);
    expect(sel.structures[0].keywords).toEqual(["bouldering", "climbing"]);
    expect(sel.structures[0].people).toEqual(["a", "b", "c"]);
  });

  it(`needs at least ${MIN_PEOPLE} people`, () => {
    const sel = selectStructures({ keywords: kw("chess"), members: [member("a", "chess")] });
    expect(sel.structures).toEqual([]);
    expect(sel.leftOut).toEqual(["chess"]);
  });

  it("sends an unmatched keyword to the structure its crowd shares, or leaves it out", () => {
    const sel = selectStructures({
      keywords: kw("cooking", "punctuality", "astrology"),
      members: [member("a", "cooking", "punctuality"), member("b", "cooking", "punctuality"), member("c", "astrology"), member("d", "astrology")],
    });
    expect(sel.structures.map((s) => s.id)).toEqual(["kitchen"]);
    expect(sel.structures[0].keywords).toEqual(["cooking", "punctuality"]);
    expect(sel.leftOut).toEqual(["astrology"]);
  });

  it("merges structures with mostly the same people into one open-plan zone", () => {
    const sel = selectStructures({
      keywords: kw("cooking", "board games", "running"),
      members: [
        member("a", "cooking", "board games"),
        member("b", "cooking", "board games"),
        member("c", "cooking", "board games"),
        member("d", "running"),
        member("e", "running"),
      ],
    });
    expect(sel.structures.map((s) => s.id)).toEqual(["kitchen+boardgames", "fitness"]);
    expect(sel.structures[0].presets.map((p) => p.id)).toEqual(["kitchen", "boardgames"]);
  });

  it("scales prominence and tier with the crowd", () => {
    const members = [
      ...Array.from({ length: 6 }, (_, i) => member(`k${i}`, "cooking")),
      ...Array.from({ length: 2 }, (_, i) => member(`r${i}`, "reading")),
    ];
    const sel = selectStructures({ keywords: kw("cooking", "reading"), members });
    const [kitchen, study] = sel.structures;
    expect(kitchen.id).toBe("kitchen");
    expect(kitchen.prominence).toBeCloseTo(0.75);
    expect(kitchen.tier).toBe("L");
    expect(study.tier).toBe("M");
    expect(tierFor(0.1)).toBe("S");
  });

  it("is deterministic regardless of input order", () => {
    const input: SelectInput = {
      keywords: kw("climbing", "cooking", "guitar", "film", "chess"),
      members: [member("a", "climbing", "cooking"), member("b", "guitar", "film"), member("c", "chess", "film"),
        member("d", "climbing"), member("e", "guitar"), member("f", "cooking", "chess")],
    };
    const shuffled: SelectInput = { keywords: [...input.keywords].reverse(), members: [...input.members].reverse() };
    expect(selectStructures(shuffled)).toEqual(selectStructures(input));
  });

  it("orders each member's homes by their own keywords", () => {
    const sel = selectStructures({
      keywords: kw("guitar", "climbing"),
      // Crowds overlap by 2 of 6, under the merge line, so these stay two structures.
      members: [member("a", "guitar", "climbing"), member("b", "climbing", "guitar"), member("c", "guitar"),
        member("d", "climbing"), member("e", "guitar"), member("f", "climbing")],
    });
    expect(sel.homes.a).toEqual(["music", "climbing"]);
    expect(sel.homes.b).toEqual(["climbing", "music"]);
  });
});
