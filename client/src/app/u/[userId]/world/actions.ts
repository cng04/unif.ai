"use server";

import type { ChatLine } from "@/components/visualizer/types";
import type { Unchanged, WorldSnapshot } from "@/components/visualizer/world/snapshot";
import { api } from "@/lib/api";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// TODO(auth): the user id in the link is the only identity, as everywhere under /u/[userId] today.

/** The World as this participant may see it: no scores, dealbreakers, judge flags or rationales. */
export async function fetchWorld(userId: string, since: string): Promise<WorldSnapshot | Unchanged> {
  if (!UUID.test(userId)) throw new Error("invalid user id");
  return api.userWorld(userId, since);
}

/** A transcript, only for a pair this user is in (the server checks membership; others' pairs 404). */
export async function loadPairMessages(userId: string, pairId: string): Promise<ChatLine[]> {
  if (!UUID.test(userId) || !UUID.test(pairId)) throw new Error("invalid id");
  const pair = await api.pair(userId, pairId);
  return pair.messages.map((m) => ({ speakerId: m.speaker_id, content: m.content, createdAt: m.created_at }));
}
