import { describe, expect, it } from "vitest";
import lahacks from "./fixtures/lahacks.world.json";
import uiDemo from "./fixtures/ui-demo.world.json";
import { circleSeats } from "./geometry";
import { MAP_H, MAP_W, planWorld, tileKey, worldSeed, type WorldPlan } from "./plan";
import { selectStructures, type SelectInput } from "./select";

function reachableFrom(plan: WorldPlan, x: number, y: number): Set<string> {
  const seen = new Set([tileKey(x, y)]);
  const queue = [[x, y]];
  while (queue.length) {
    const [cx, cy] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      const k = tileKey(nx, ny);
      if (nx < 0 || ny < 0 || nx >= plan.width || ny >= plan.height || plan.walk[ny][nx] || seen.has(k)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

function targets(plan: WorldPlan) {
  const out: { x: number; y: number; what: string }[] = [];
  for (const z of plan.zones) out.push({ ...z.entrance, what: `${z.id} entrance` });
  for (const [z, list] of Object.entries(plan.spots)) for (const s of list) out.push({ ...s, what: `${z} spot` });
  for (const [z, list] of Object.entries(plan.circles))
    for (const c of list) for (const s of circleSeats(c.x, c.y, c.pose, c.activity)) out.push({ ...s, what: `${z} seat` });
  for (const [z, list] of Object.entries(plan.chatSpots)) for (const [a, b] of list) out.push({ ...a, what: `${z} chat` }, { ...b, what: `${z} chat` });
  for (const b of plan.benches) out.push({ ...b, what: "bench" });
  for (const t of plan.spawnTiles) out.push({ ...t, what: "spawn" });
  return out;
}

function checkPlan(plan: WorldPlan) {
  const structures = plan.zones.filter((z) => z.kind === "structure");
  for (const z of plan.zones) {
    expect(z.x).toBeGreaterThanOrEqual(0);
    expect(z.y).toBeGreaterThanOrEqual(0);
    expect(z.x + z.w).toBeLessThanOrEqual(MAP_W);
    expect(z.y + z.h).toBeLessThanOrEqual(MAP_H);
  }
  for (let i = 0; i < plan.zones.length; i++)
    for (let j = i + 1; j < plan.zones.length; j++) {
      const a = plan.zones[i];
      const b = plan.zones[j];
      expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, `${a.id} overlaps ${b.id}`).toBe(false);
    }
  const square = plan.zones.find((z) => z.id === "square")!;
  const start = { x: square.x + 1, y: square.y + Math.floor(square.h / 2) };
  const reach = reachableFrom(plan, start.x, start.y);
  for (const t of targets(plan)) {
    expect(plan.walk[t.y][t.x], `${t.what} at ${t.x},${t.y} is blocked`).toBe(0);
    expect(reach.has(tileKey(t.x, t.y)), `${t.what} at ${t.x},${t.y} unreachable`).toBe(true);
  }
  // Every structure has its group table and somewhere to do its activity.
  for (const z of structures) {
    expect(plan.circles[z.id].length, `${z.id} has no group table`).toBeGreaterThan(0);
    expect(plan.spots[z.id].length, `${z.id} has no activity spots`).toBeGreaterThan(0);
  }
  // Paths connect: every path tile is walkable and reachable.
  for (const k of plan.paths) expect(reach.has(k), `path ${k} disconnected`).toBe(true);
}

describe.each([
  ["LA Hacks seed", lahacks],
  ["UI Demo", uiDemo],
])("%s plan", (_, world) => {
  const selection = selectStructures(world);
  const seed = worldSeed(world.universe.id, world.keywords.map((k) => k.name));
  const plan = planWorld(selection, seed);

  it("places every selected structure plus the square and plaza", () => {
    expect(plan.zones.filter((z) => z.kind === "structure").map((z) => z.id).sort()).toEqual(selection.structures.map((s) => s.id).sort());
    expect(plan.zones.map((z) => z.id)).toEqual(expect.arrayContaining(["square", "spawn"]));
  });

  it("is coherent and fully navigable", () => checkPlan(plan));

  it("is the same world for the same seed", () => {
    expect(planWorld(selectStructures(world), seed)).toEqual(plan);
  });
});

describe("layout over many seeds", () => {
  it("stays navigable", () => {
    const sel = selectStructures(lahacks);
    for (let s = 1; s <= 40; s++) checkPlan(planWorld(sel, s * 7919));
  });
});

describe("stability", () => {
  const base: SelectInput = uiDemo;
  const seed = worldSeed(uiDemo.universe.id, uiDemo.keywords.map((k) => k.name));
  const centers = (plan: WorldPlan) =>
    Object.fromEntries(plan.zones.map((z) => [z.id, [z.x + z.w / 2, z.y + z.h / 2].map((v) => Math.round(v))]));

  it("a new member doesn't change the world", () => {
    const joined = { ...base, members: [...base.members, { id: "newcomer", top_keywords: [] }] };
    expect(planWorld(selectStructures(joined), seed).zones).toEqual(planWorld(selectStructures(base), seed).zones);
  });

  it("a structure growing or shrinking keeps its place", () => {
    const sel = selectStructures(base);
    const shrunk = { ...sel, structures: sel.structures.map((s) => ({ ...s, tier: "S" as const })) };
    const a = centers(planWorld(sel, seed));
    const b = centers(planWorld(shrunk, seed));
    for (const id of Object.keys(a)) for (const i of [0, 1]) expect(Math.abs(a[id][i] - b[id][i])).toBeLessThanOrEqual(1);
  });

  it("a different keyword set is a different seed", () => {
    expect(worldSeed("u", ["a", "b"])).toBe(worldSeed("u", ["b", "a"]));
    expect(worldSeed("u", ["a", "b"])).not.toBe(worldSeed("u", ["a", "c"]));
  });
});
