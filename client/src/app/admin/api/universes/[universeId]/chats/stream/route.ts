// The browser's EventSource cannot send the admin password, so this route holds it and forwards the stream.
// The upstream only emits public messages (kind = 'message'), never agents' private notes.

import { type NextRequest } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

// A matching run's chat stream stays open for minutes. Hand each chunk through as it arrives so the
// platform doesn't buffer the body until the upstream closes.
export const maxDuration = 300;

export async function GET(request: NextRequest, context: { params: Promise<{ universeId: string }> }) {
  const { universeId } = await context.params;
  const upstream = new URL(`/admin/api/universes/${encodeURIComponent(universeId)}/chats/stream`, API_URL);
  const after = request.nextUrl.searchParams.get("after");
  if (after) upstream.searchParams.set("after", after);
  const headers = new Headers();
  const password = process.env.ADMIN_PASSWORD;
  if (password) headers.set("authorization", `Basic ${btoa(`admin:${password}`)}`);
  const last = request.headers.get("last-event-id");
  if (last) headers.set("last-event-id", last);
  const response = await fetch(upstream, { headers, cache: "no-store", signal: request.signal });
  const body = response.body;
  if (!body) return new Response(null, { status: response.status });
  const reader = body.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });
  return new Response(stream, {
    status: response.status,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
