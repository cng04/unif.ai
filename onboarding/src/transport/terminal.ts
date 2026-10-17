// Local dev: chat with the bot in your terminal, no Photon account needed.
import { createInterface } from "node:readline/promises";
import type { Inbound, Reply } from "./types.ts";

export async function startTerminal(onMessage: (msg: Inbound, reply: Reply) => Promise<void>) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "you › " });
  const reply: Reply = {
    async send(text) {
      console.log(`\x1b[36mbot ›\x1b[0m ${text}`);
    },
    async typing() {},
  };
  console.log('terminal mode: say anything to start (type "restart" to begin again)');
  rl.prompt();
  // Read lines one at a time so a long paste split over several lines is handled in order.
  for await (const line of rl) {
    await onMessage({ chatId: "terminal", platform: "terminal", text: line }, reply);
    rl.prompt();
  }
}
