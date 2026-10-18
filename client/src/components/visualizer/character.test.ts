import { describe, expect, it } from "vitest";
import { HAIRS, HAIR_STYLES, PANTS, SKINS, paletteFor } from "./character";

const ID = "06b61d31-ec19-5ad2-b5b6-ba1f3027f88a";

describe("paletteFor with a look", () => {
  it("is unchanged without a look, and deterministic", () => {
    expect(paletteFor(ID)).toEqual(paletteFor(ID, null));
    expect(paletteFor(ID, {})).toEqual(paletteFor(ID));
    expect(paletteFor(ID)).toEqual(paletteFor(ID));
  });

  it("overrides only the parts that are set", () => {
    const base = paletteFor(ID);
    const p = paletteFor(ID, { hair: 5, hair_style: 2 });
    expect(p.hair).toBe(HAIRS[5]);
    expect(p.hairStyle).toBe(2);
    expect({ ...p, hair: 0, hairStyle: 0 }).toEqual({ ...base, hair: 0, hairStyle: 0 });
  });

  it("maps every part", () => {
    const p = paletteFor(ID, { skin: 4, shirt_hue: 120, pants: 3 });
    expect(p.skin).toBe(SKINS[4]);
    expect(p.pants).toBe(PANTS[3]);
    expect(p.shirt).toContain("hsl(120 ");
  });

  it("ignores out-of-range or non-integer parts", () => {
    const base = paletteFor(ID);
    expect(paletteFor(ID, { skin: 6, hair: -1, hair_style: 5, shirt_hue: 360, pants: 7 })).toEqual(base);
    expect(paletteFor(ID, { skin: 1.5, hair: null })).toEqual(base);
  });

  it("matches the server's ranges (agent/src/unifai_agent/profile.py LOOK_MAX)", () => {
    expect([SKINS.length, HAIRS.length, HAIR_STYLES, PANTS.length]).toEqual([6, 10, 5, 7]);
  });
});
