// Local HTTP channel for relays such as the ASI:One agent (../asi-agent). A relay POSTs one user
// message and gets back the bubbles the bot replied with. Never expose it publicly; set RELAY_TOKEN to
// require a shared secret.
import { createServer } from "node:http";
import type { Inbound, Reply } from "./types.ts";

export function startHttp(onMessage: (msg: Inbound, reply: Reply) => Promise<void>) {
  const port = Number(process.env.BOT_HTTP_PORT ?? 8787);
  // Localhost by default; Docker sets 0.0.0.0 so the asi-agent container can reach it on the private network.
  const host = process.env.BOT_HTTP_HOST ?? "127.0.0.1";
  const token = process.env.RELAY_TOKEN;
  // Messages from one chat run in order; different chats run concurrently.
  const queues = new Map<string, Promise<unknown>>();

  createServer(async (req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.method !== "POST" || req.url !== "/message") return send(404, { error: "not found" });
    if (token && req.headers.authorization !== `Bearer ${token}`) return send(401, { error: "unauthorized" });

    let body: any;
    try {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 200_000) return send(413, { error: "too large" });
      }
      body = JSON.parse(raw);
    } catch {
      return send(400, { error: "invalid JSON" });
    }
    const { chatId, platform, text, sender } = body ?? {};
    if (typeof chatId !== "string" || !chatId || typeof platform !== "string") {
      return send(400, { error: "chatId and platform are required" });
    }

    const bubbles: string[] = [];
    const reply: Reply = { send: async (t) => void bubbles.push(t), typing: async () => {} };
    const run = (queues.get(chatId) ?? Promise.resolve())
      .catch(() => {})
      .then(() =>
        onMessage(
          {
            chatId,
            platform,
            senderHandle: typeof sender === "string" ? sender : undefined,
            // Relays should strip "@agent…" mentions; do it here too so commands still match.
            text: typeof text === "string" ? text.replace(/^(?:@\S+\s*)+/, "").trim() : null,
          },
          reply,
        ),
      );
    queues.set(chatId, run);
    try {
      await run;
      send(200, { bubbles });
    } catch (err) {
      console.error(`[http] ${chatId}`, err);
      send(500, { error: "handler failed", bubbles });
    }
  }).listen(port, host, () => console.info(`[http] relay channel on http://${host}:${port}/message`));
}
