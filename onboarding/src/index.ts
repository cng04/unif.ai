import { coalesce } from "./coalesce.ts";
import * as copy from "./copy.ts";
import { handle } from "./flow.ts";
import { logMessages } from "./members.ts";
import { loadSession, newSession, saveSession, type Session } from "./store.ts";
import { startPhoton } from "./transport/photon.ts";
import { startHttp } from "./transport/http.ts";
import { startTerminal } from "./transport/terminal.ts";
import type { Inbound, Reply } from "./transport/types.ts";

// `npm run dev` chats in the terminal. Otherwise CHANNELS picks what to run (comma-separated):
// "photon" (iMessage, the default) and/or "http" (local relay channel used by the ASI:One agent).
const useTerminal = process.argv.includes("--terminal");
const channels = (process.env.CHANNELS ?? "photon").split(",").map((c) => c.trim()).filter(Boolean);
console.info(`channels: ${useTerminal ? "terminal" : channels.join(", ")}`);

async function onMessage(msg: Inbound, reply: Reply) {
  let session = (await loadSession(msg.chatId)) ?? newSession(msg.chatId, msg.platform, msg.senderHandle);

  const say = async (...bubbles: string[]) => {
    for (const text of bubbles) {
      await reply.send(text);
      session.transcript.push({ from: "agent", text, at: new Date().toISOString() });
      if (msg.platform === "imessage") await sleep(Math.min(400 + text.length * 8, 1500)); // feels like texting
    }
  };

  if (msg.text === null) {
    await say(copy.TEXT_ONLY);
    await flushTranscript(session);
    return saveSession(session);
  }
  const text = msg.text;
  session.transcript.push({ from: "user", text, at: new Date().toISOString() });

  await reply.typing(true);
  try {
    session = await handle(session, text, say);
  } catch (err) {
    console.error(`[${msg.chatId}]`, err);
    await say(copy.ERROR);
    // Roll back to the state before this message so resending it retries cleanly.
    return;
  } finally {
    await reply.typing(false);
  }
  await flushTranscript(session);
  await saveSession(session);
}

/** Copy transcript lines not yet in onboarding_messages. Best-effort: a failure is retried on the next message. */
async function flushTranscript(s: Session) {
  if (!s.userId) return;
  const from = s.loggedCount ?? 0;
  try {
    await logMessages(s.userId, s.transcript.slice(from));
    s.loggedCount = s.transcript.length;
  } catch (err) {
    console.error(`[${s.spaceId}] logging messages failed`, err);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

if (useTerminal) await startTerminal(onMessage);
else {
  if (channels.includes("http")) startHttp(onMessage);
  // One turn at a time per chat: bubbles sent together, or while a reply is being written, reach the model together.
  // Whether to answer or wait for more is the model's call. (The ASI:One relay waits for each reply anyway.)
  if (channels.includes("photon")) await startPhoton(coalesce(onMessage, 1000));
}
