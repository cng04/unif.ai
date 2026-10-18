// Photon 2.0 (beta platform): events arrive over Socket.IO, replies go out through the REST API.
// Docs: https://photon.codes/docs/beta/websocket/example and /docs/beta/get-started/imessage
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { io } from "socket.io-client";
import { ApiError, Photon } from "@photon-ai/api";
import type { Inbound, Reply } from "./types.ts";

const API_ORIGIN = process.env.PHOTON_API_ORIGIN ?? "https://api.photon.codes";
const CURSOR_FILE = join(import.meta.dirname, "..", "..", "data", "photon-cursor.json");

export async function startPhoton(onMessage: (msg: Inbound, reply: Reply) => Promise<void>) {
  const apiKey = required("PHOTON_API_KEY");
  const projectId = required("PHOTON_PROJECT_ID");
  const photon = new Photon({ headers: { Authorization: `Bearer ${apiKey}` } });

  let cursor = await loadCursor();
  let epoch = 0;
  let pending = 0;
  let queue = Promise.resolve();

  const socket = io(API_ORIGIN, {
    path: `/v1/projects/${projectId}/events/ws`,
    addTrailingSlash: false,
    transports: ["websocket"],
    extraHeaders: { Authorization: `Bearer ${apiKey}` },
    autoConnect: false,
  });

  socket.on("connect", () => {
    socket.timeout(10_000).emit("subscribe", { startSeq: cursor }, (error: unknown, result: any) => {
      if (error) socket.io.engine.close();
      else if (!result.ok) console.error("[photon] subscribe rejected:", result.error?.code);
      else console.info(`[photon] subscribed (cursor ${cursor}, api ${result.apiVersion})`);
    });
  });
  socket.on("disconnect", () => { epoch++; });
  socket.on("delivery_error", (e: any) => console.error("[photon] delivery_error:", e?.code, e?.message));
  socket.on("connect_error", (e: Error) => console.error("[photon] connect_error:", e.message));

  // Deliveries are processed one at a time and the cursor is saved only after success,
  // so a crash or failed send replays from the last handled event. Sends carry
  // idempotency keys derived from the inbound message, so replays don't double-text.
  socket.on("delivery", (event: any, { seq }: { seq: number }) => {
    const generation = epoch;
    if (++pending > 128) {
      pending--;
      epoch++;
      socket.io.engine.close();
      return;
    }
    queue = queue
      .then(async () => {
        if (generation !== epoch || seq <= cursor) return;
        const msg = receivedMessage(event);
        if (msg) await onMessage(toInbound(msg), makeReply(photon, projectId, msg));
        cursor = seq;
        await saveCursor(cursor);
      })
      .catch((error) => {
        console.error("[photon] event processing failed", error);
        if (generation === epoch) {
          epoch++;
          socket.io.engine.close();
        }
      })
      .finally(() => { pending--; });
  });

  socket.connect();
}

/**
 * Find the inbound Message in an event. The event envelope is `{ id, type, ...}`; rather than
 * hard-coding where the Message sits, accept any object shaped like a received direct
 * iMessage from a human to our agent.
 */
function receivedMessage(event: any): any | null {
  const candidates = [event?.message, event?.data?.message, event?.data?.object, event?.data, event];
  const m = candidates.find((c) => c && typeof c === "object" && c.status === "received" && c.space?.id && c.sentBy);
  if (!m) {
    if (process.env.PHOTON_DEBUG) console.debug("[photon] skipped event", event?.type, JSON.stringify(event).slice(0, 500));
    return null;
  }
  if (m.sentBy.kind !== "human" || m.receivedBy?.kind !== "agent") return null;
  if (m.space.kind && m.space.kind !== "direct") return null; // shared lines only support DMs
  // Read receipts and typing updates also come through as messages; ignore them.
  if (["message.read", "space.typing.update"].includes(m.content?.type)) return null;
  return m;
}

function toInbound(m: any): Inbound {
  return {
    chatId: m.space.id,
    platform: m.platform,
    senderHandle: m.sentBy.handle,
    text: m.content?.type === "text" ? m.content.text : null,
  };
}

function makeReply(photon: Photon, projectId: string, m: any): Reply {
  const base = { spaceId: m.space.id, senderId: m.receivedBy.id };
  let n = 0;
  let typingTimer: ReturnType<typeof setInterval> | undefined;

  const setTyping = async (typing: boolean) => {
    try {
      await photon.projects.setSpaceTyping({
        path: { id: projectId, spaceId: base.spaceId },
        body: { senderId: base.senderId, typing },
      });
    } catch {
      // Typing is best-effort (OPERATION_UNAVAILABLE on some lines).
    }
  };

  return {
    async send(text) {
      const key = `onboarding:${m.id}:${n++}`;
      try {
        await photon.projects.sendMessage({
          path: { id: projectId },
          headers: { "idempotency-key": key },
          body: { ...base, content: { type: "text", format: "plain", text } },
        });
      } catch (err) {
        // A replay after a crash may regenerate different text under the same key; the
        // original bubble already went out, so skip rather than fail the whole event.
        if (err instanceof ApiError && (err.body as any)?.code === "IDEMPOTENCY_KEY_REUSED") return;
        throw err;
      }
    },
    async typing(on) {
      clearInterval(typingTimer);
      // Shared lines reject typing updates (they fail async as message_failed), so it's opt-in.
      if (!process.env.PHOTON_TYPING) return;
      await setTyping(on);
      // Photon typing is a transient update; refresh it while we're still working.
      if (on) typingTimer = setInterval(() => void setTyping(true), 8_000);
    },
  };
}

async function loadCursor(): Promise<number> {
  try {
    return JSON.parse(await readFile(CURSOR_FILE, "utf8")).cursor ?? 0;
  } catch {
    return 0;
  }
}

async function saveCursor(cursor: number) {
  await mkdir(join(CURSOR_FILE, ".."), { recursive: true });
  await writeFile(CURSOR_FILE, JSON.stringify({ cursor }));
}

export function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name} (see .env.example)`);
  return v;
}
