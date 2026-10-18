import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { api, ApiError, type Connections, type InterviewMessage, type Profile, type UserGraph } from "./api";

// Short-lived, per-user caches for the user pages. Giving reads a lifetime is what lets the tab bar prefetch the
// other tabs (data included), so switching is instant; 10s revalidation keeps matching progress and new messages
// fresh. Writes that the user should see right away call updateTag(userTag(id)) in their server action.
// Cached functions return null for a 404 instead of throwing, since errors don't cross the cache boundary cleanly.
const LIFE = { stale: 30, revalidate: 10, expire: 300 };

export const userTag = (userId: string) => `user:${userId}`;

async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function getConnections(userId: string): Promise<Connections | null> {
  "use cache";
  cacheLife(LIFE);
  cacheTag(userTag(userId));
  return orNull(api.connections(userId));
}

export async function getGraph(userId: string, axes?: string[]): Promise<UserGraph | null> {
  "use cache";
  cacheLife(LIFE);
  cacheTag(userTag(userId));
  try {
    return await orNull(api.graph(userId, axes));
  } catch (e) {
    // Stale or hand-edited axes: fall back to the similarity layout.
    if (axes && e instanceof ApiError && e.status === 422) return orNull(api.graph(userId));
    throw e;
  }
}

export async function getInterview(userId: string): Promise<InterviewMessage[] | null> {
  "use cache";
  cacheLife(LIFE);
  cacheTag(userTag(userId));
  return orNull(api.interview(userId));
}

export async function getProfile(userId: string): Promise<Profile | null> {
  "use cache";
  cacheLife(LIFE);
  cacheTag(userTag(userId));
  return orNull(api.profile(userId));
}
