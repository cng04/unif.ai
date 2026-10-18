const API_URL = process.env.API_URL ?? "http://localhost:8000";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ universeId: string }> },
) {
  const { universeId } = await params;
  const incoming = new URL(request.url);
  const upstream = new URL(`/admin/api/universes/${encodeURIComponent(universeId)}/chats/stream`, API_URL);
  if (incoming.searchParams.has("after")) upstream.searchParams.set("after", incoming.searchParams.get("after")!);

  const headers = new Headers({ accept: "text/event-stream" });
  const password = process.env.ADMIN_PASSWORD;
  if (password) headers.set("authorization", `Basic ${btoa(`admin:${password}`)}`);
  const lastEventId = request.headers.get("last-event-id");
  if (lastEventId) headers.set("last-event-id", lastEventId);

  const response = await fetch(upstream, {
    headers,
    cache: "no-store",
    signal: request.signal,
  });
  if (!response.ok || !response.body) {
    return new Response(await response.text(), { status: response.status });
  }
  return new Response(response.body, {
    headers: {
      "cache-control": "no-cache, no-transform",
      "content-type": "text/event-stream",
      "x-accel-buffering": "no",
    },
  });
}
