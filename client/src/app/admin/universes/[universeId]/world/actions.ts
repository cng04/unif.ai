"use server";

import type { ChatLine } from "@/components/visualizer/types";
import type { Unchanged, WorldSnapshot } from "@/components/visualizer/world/snapshot";
import { adminApi, api } from "@/lib/api";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Transcript of one agent-to-agent chat. Messages only; the API never returns agents' private notes. */
export async function loadPairMessages(pairId: string): Promise<ChatLine[]> {
  if (!UUID.test(pairId)) throw new Error("invalid pair id");
  const rows = await api.pairMessages(pairId);
  return rows.map((r) => ({ speakerId: r.speaker_id, content: r.content, createdAt: r.created_at }));
}

/** The admin World snapshot, or `{unchanged: true}` when `since` is current. Runs on the server, so the admin
 * password never reaches the browser. The page already sits behind the /admin basic auth. */
export async function fetchWorld(universeId: string, since: string): Promise<WorldSnapshot | Unchanged> {
  if (!UUID.test(universeId)) throw new Error("invalid universe id");
  return adminApi.world(universeId, since);
}
