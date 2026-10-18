import type { Inbound, Reply } from "./transport/types.ts";

export type Handler = (msg: Inbound, reply: Reply) => Promise<void>;

/**
 * Turn a burst of texts from one chat into a single bot turn. People often send a thought as several bubbles
 * ("ok" / "I've been into football" / "and basketball"); answering each one separately makes the bot talk over
 * itself. Texts are held for `quietMs` after the latest one, and anything that arrives while a turn is running is
 * folded into the next turn. Non-text messages go straight through.
 *
 * The returned handler resolves as soon as a message is queued, so the transport can move on to the next delivery.
 */
export function coalesce(handle: Handler, quietMs = 2500): Handler {
  const chats = new Map<string, { texts: string[]; reply: Reply; base: Inbound; timer?: ReturnType<typeof setTimeout>; running: boolean }>();

  const flush = async (chatId: string) => {
    const chat = chats.get(chatId)!;
    if (chat.running || chat.texts.length === 0) return;
    chat.running = true;
    const text = chat.texts.splice(0).join("\n");
    try {
      await handle({ ...chat.base, text }, chat.reply);
    } catch (err) {
      console.error(`[${chatId}] coalesced turn failed`, err);
    } finally {
      chat.running = false;
      if (chat.texts.length) schedule(chatId); // more arrived while we were replying
      else chats.delete(chatId);
    }
  };

  const schedule = (chatId: string) => {
    const chat = chats.get(chatId)!;
    clearTimeout(chat.timer);
    chat.timer = setTimeout(() => void flush(chatId), quietMs);
  };

  return async (msg, reply) => {
    if (msg.text === null) return handle(msg, reply);
    const chat = chats.get(msg.chatId) ?? { texts: [], reply, base: msg, running: false };
    chat.texts.push(msg.text);
    chat.reply = reply; // reply under the newest message (its id keys the send idempotency)
    chat.base = msg;
    chats.set(msg.chatId, chat);
    if (!chat.running) schedule(msg.chatId);
  };
}
