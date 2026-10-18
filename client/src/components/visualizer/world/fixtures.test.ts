// Selection on real snapshots of the two seeded demo universes (captured from GET /admin/api/universes/{id}/world
// after db/seed.sql + db/dev_graph_seed.sql and server/scripts/seed_demo.py). Synthetic people only.

import { describe, expect, it } from "vitest";
import lahacks from "./fixtures/lahacks.world.json";
import uiDemo from "./fixtures/ui-demo.world.json";
import { MIN_PEOPLE, selectStructures } from "./select";

describe.each([
  ["LA Hacks seed", lahacks],
  ["UI Demo", uiDemo],
])("%s", (_, world) => {
  const sel = selectStructures(world);

  it("places or explicitly leaves out every keyword", () => {
    const placed = sel.structures.flatMap((s) => s.keywords);
    expect([...placed, ...sel.leftOut].sort()).toEqual(world.keywords.map((k) => k.name).sort());
  });

  it("only builds structures with a crowd, one per preset", () => {
    expect(sel.structures.length).toBeGreaterThan(0);
    for (const s of sel.structures) expect(s.people.length).toBeGreaterThanOrEqual(MIN_PEOPLE);
    const presets = sel.structures.flatMap((s) => s.presets.map((p) => p.id));
    expect(new Set(presets).size).toBe(presets.length);
  });

  it("gives everyone with a placed keyword a home", () => {
    for (const m of world.members) {
      const placedKeyword = m.top_keywords.some((k) => sel.structures.some((s) => s.keywords.includes(k)));
      expect(sel.homes[m.id].length > 0).toBe(placedKeyword);
    }
  });

  it("matches the reviewed selection", () => {
    expect(sel.structures.map((s) => `${s.id}:${s.tier}:${s.people.length} [${s.keywords.join(", ")}]`)).toMatchSnapshot();
    expect(sel.leftOut).toMatchSnapshot();
  });
});
