import { describe, expect, it } from "vitest";
import uiDemoJson from "./fixtures/ui-demo.world.json";
import { RECENT_MS, deriveActivity, pairKey, pipelineStage, provenance } from "./activity";
import { planWorld, tileKey, worldSeed } from "./plan";
import { selectStructures } from "./select";
import type { WorldSnapshot } from "./snapshot";

const uiDemo = uiDemoJson as unknown as WorldSnapshot;
const build = (snap: WorldSnapshot) => {
  const selection = selectStructures(snap);
  const plan = planWorld(selection, worldSeed(snap.universe.id, snap.keywords.map((k) => k.name)));
  return { selection, plan };
};
const NOW = Date.parse("2026-10-18T12:00:00Z");

describe("pipeline stage and provenance", () => {
  it("follows the universe status and recorded stage", () => {
    expect(pipelineStage(uiDemo)).toBe("matched");
    expect(pipelineStage({ ...uiDemo, universe: { ...uiDemo.universe, status: "matching", stage: "chats" } })).toBe("chats");
    expect(pipelineStage({ ...uiDemo, universe: { ...uiDemo.universe, status: "onboarding", stage: null } })).toBe("onboarding");
  });

  it("only a running pair is live", () => {
    const p = { id: "p", a: "a", b: "b", started_at: "2026-10-18T11:00:00Z" } as const;
    expect(provenance({ ...p, status: "running", completed_at: null }, NOW)).toBe("live");
    expect(provenance({ ...p, status: "complete", completed_at: new Date(NOW - RECENT_MS + 1000).toISOString() }, NOW)).toBe("completed");
    expect(provenance({ ...p, status: "complete", completed_at: new Date(NOW - RECENT_MS - 1000).toISOString() }, NOW)).toBe("historical");
  });
});

describe("intents from the UI Demo fixture (matched, 4 groups)", () => {
  const { selection, plan } = build(uiDemo);
  const act = deriveActivity(uiDemo, selection, plan, NOW);

  it("invents no live chats when nothing is running", () => {
    expect(uiDemo.pairs.every((p) => p.status === "complete")).toBe(true);
    expect(act.live).toEqual([]);
    expect(Object.values(act.intents).some((i) => i.kind === "meet")).toBe(false);
  });

  it("seats every group member at their group's table, one person per seat", () => {
    const seats = new Set<string>();
    for (const g of uiDemo.groups)
      for (const m of g.member_ids) {
        const intent = act.intents[m];
        expect(intent.kind).toBe("group");
        if (intent.kind !== "group") continue;
        expect(plan.walk[intent.spot.y][intent.spot.x]).toBe(0);
        const k = tileKey(intent.spot.x, intent.spot.y);
        expect(seats.has(k)).toBe(false);
        seats.add(k);
      }
  });

  it("puts unplaced people on the square's benches", () => {
    const grouped = new Set(uiDemo.groups.flatMap((g) => g.member_ids));
    for (const m of uiDemo.members.filter((m) => !grouped.has(m.id))) expect(act.intents[m.id].kind).toBe("bench");
  });

  it("offers judged chats for re-enactment, labelled by age", () => {
    expect(act.replayable.length).toBeGreaterThan(0);
    expect(act.replayable.every((r) => r.provenance !== "live")).toBe(true);
  });
});

describe("a run in progress", () => {
  const running: WorldSnapshot = {
    ...uiDemo,
    universe: { ...uiDemo.universe, status: "matching", stage: "chats" },
    groups: [],
    pairs: [
      ...uiDemo.pairs.slice(0, 3),
      { id: "live-1", a: uiDemo.members[0].id, b: uiDemo.members[1].id, status: "running", started_at: "2026-10-18T11:59:00Z", completed_at: null },
    ],
  };
  const { selection, plan } = build(running);
  const act = deriveActivity(running, selection, plan, NOW);

  it("brings a running pair together, facing each other", () => {
    expect(act.live).toEqual(["live-1"]);
    const a = act.intents[uiDemo.members[0].id];
    const b = act.intents[uiDemo.members[1].id];
    expect(a.kind).toBe("meet");
    expect(b.kind).toBe("meet");
    if (a.kind === "meet" && b.kind === "meet") expect(Math.abs(a.spot.x - b.spot.x) + Math.abs(a.spot.y - b.spot.y)).toBe(1);
  });

  it("lets everyone else wander their home structures", () => {
    const others = uiDemo.members.slice(2).map((m) => act.intents[m.id]);
    expect(others.every((i) => i.kind === "wander")).toBe(true);
  });

  it("mills around the square while keywords are still being read", () => {
    const waiting: WorldSnapshot = {
      ...uiDemo,
      universe: { ...uiDemo.universe, status: "matching", stage: "keywords" },
      groups: [],
      pairs: [],
      keywords: [],
      members: uiDemo.members.map((m) => ({ ...m, scored: false, top_keywords: [] })),
    };
    const s = build(waiting);
    const intents = Object.values(deriveActivity(waiting, s.selection, s.plan, NOW).intents);
    expect(intents.length).toBe(waiting.members.length);
    expect(intents.every((i) => i.kind === "wander" && i.zones.includes("square"))).toBe(true);
  });

  it("keeps unscored newcomers at the spawn plaza, thinking while scoring runs", () => {
    const scoring: WorldSnapshot = {
      ...running,
      universe: { ...running.universe, stage: "scoring" },
      members: [...running.members, { ...running.members[0], id: "new", scored: false, top_keywords: [], busy: false }],
    };
    const s = build(scoring);
    expect(deriveActivity(scoring, s.selection, s.plan, NOW).intents.new).toEqual({ kind: "spawn", thinking: true });
  });
});

describe("participant view", () => {
  it("keys other people's pairs by member ids, never an id the viewer can't see", () => {
    expect(pairKey({ id: null, a: "b", b: "a", status: "complete", started_at: "", completed_at: null })).toBe("a:b");
  });
});
