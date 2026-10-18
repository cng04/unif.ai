import { describe, expect, it } from "vitest";
import { keepNewerLines, mergeLiveTurn } from "./live-line";
import type { WorldSnapshot } from "./snapshot";

const snapshot = {
  pairs: [
    { id: "p1", a: "a", b: "b", status: "running", started_at: "", completed_at: null },
    { id: null, a: "c", b: "d", status: "running", started_at: "", completed_at: null },
  ],
} as WorldSnapshot;

describe("live chat lines", () => {
  it("shows a new turn on that pair and ignores an older one", () => {
    const next = mergeLiveTurn(snapshot, { id: 2, pair_id: "p1", speaker_id: "a", content: "hello there" });
    expect(next.pairs[0].line).toEqual({ id: 2, speaker_id: "a", content: "hello there" });
    expect(mergeLiveTurn(next, { id: 1, pair_id: "p1", speaker_id: "b", content: "too late" })).toBe(next);
  });

  it("leaves a pair the viewer cannot see untouched", () => {
    expect(mergeLiveTurn(snapshot, { id: 1, pair_id: "missing", speaker_id: "a", content: "nope" })).toBe(snapshot);
  });

  it("keeps the newer line when an older snapshot arrives", () => {
    const live = mergeLiveTurn(snapshot, { id: 5, pair_id: "p1", speaker_id: "b", content: "just said" });
    const stale = {
      ...snapshot,
      pairs: [{ ...snapshot.pairs[0], line: { id: 4, speaker_id: "a", content: "earlier" } }, snapshot.pairs[1]],
    } as WorldSnapshot;
    expect(keepNewerLines(live, stale).pairs[0].line?.content).toBe("just said");
    expect(keepNewerLines(live, live)).toBe(live);
  });
});
