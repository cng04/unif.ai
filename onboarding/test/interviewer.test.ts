import assert from "node:assert/strict";
import { test } from "node:test";
import { classifySkip } from "../src/interviewer.ts";

test("classifySkip: skipping one question", () => {
  for (const t of ["skip", "Pass.", "idk", "I don't know", "next", "nah", "rather not say"]) assert.equal(classifySkip(t), "one", t);
});

test("classifySkip: ending the interview", () => {
  for (const t of ["done", "that's it", "I'm good", "skip the rest", "can we wrap up?", "no more questions", "let's finish"])
    assert.equal(classifySkip(t), "all", t);
});

test("classifySkip: real answers aren't skips", () => {
  for (const t of ["I skip breakfast most days", "done with work by 6 usually", "not sure yet but probably climbing", "next weekend works"])
    assert.equal(classifySkip(t), null, t);
});
