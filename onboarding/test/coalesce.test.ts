import assert from "node:assert/strict";
import { test } from "node:test";
import { coalesce } from "../src/coalesce.ts";
import type { Inbound, Reply } from "../src/transport/types.ts";

const reply: Reply = { send: async () => {}, typing: async () => {} };
const msg = (text: string | null, chatId = "a"): Inbound => ({ chatId, platform: "imessage", text });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("a burst of texts becomes one turn", async () => {
  const turns: string[] = [];
  const handler = coalesce(async (m) => void turns.push(m.text!), 40);
  for (const t of ["Ok", "Oh I've been into football", "And basketball"]) await handler(msg(t), reply);
  await sleep(100);
  assert.deepEqual(turns, ["Ok\nOh I've been into football\nAnd basketball"]);
});

test("texts arriving during a turn are folded into the next one, not run in parallel", async () => {
  const turns: string[] = [];
  let running = 0;
  const handler = coalesce(async (m) => {
    assert.equal(++running, 1, "turns must not overlap");
    turns.push(m.text!);
    await sleep(80);
    running--;
  }, 20);
  await handler(msg("first"), reply);
  await sleep(40); // first turn is now running
  await handler(msg("second"), reply);
  await handler(msg("third"), reply);
  await sleep(250);
  assert.deepEqual(turns, ["first", "second\nthird"]);
});

test("different chats and non-text messages aren't merged", async () => {
  const turns: (string | null)[] = [];
  const handler = coalesce(async (m) => void turns.push(`${m.chatId}:${m.text}`), 20);
  await handler(msg("hi", "a"), reply);
  await handler(msg("yo", "b"), reply);
  await handler(msg(null, "a"), reply);
  await sleep(80);
  assert.deepEqual(turns.sort(), ["a:hi", "a:null", "b:yo"]);
});
