"use server";

import { refresh, updateTag } from "next/cache";
import { api, ApiError } from "@/lib/api";
import { userTag } from "@/lib/cached";

export type VoteState = { error?: string };

// TODO(auth): trust the user id from the login-link session instead of the bound argument.
export async function setVote(userId: string, eventId: string, going: boolean): Promise<VoteState> {
  let memberIds = [userId];
  try {
    const group = await api.vote(userId, eventId, going);
    memberIds = group.members.map((m) => m.user_id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      updateTag(userTag(userId)); // show the plan they locked in
      refresh();
      return { error: "your group already locked in another plan." };
    }
    return { error: "couldn't save that just now. try again in a bit." };
  }
  // Everyone in the group sees the new count (and a lock) on their next view, not after the 10s cache.
  for (const id of memberIds) updateTag(userTag(id));
  refresh();
  return {};
}
