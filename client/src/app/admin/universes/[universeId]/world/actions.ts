"use server";

import type { ChatLine } from "@/components/visualizer/types";
import { api } from "@/lib/api";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Transcript of one agent-to-agent chat. Messages only; the API never returns agents' private notes. */
export async function loadPairMessages(pairId: string): Promise<ChatLine[]> {
  if (!UUID.test(pairId)) throw new Error("invalid pair id");
  const rows = await api.pairMessages(pairId);
  return rows.map((r) => ({ speakerId: r.speaker_id, content: r.content, createdAt: r.created_at }));
}
