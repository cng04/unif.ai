"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { api, ApiError } from "@/lib/api";

export type SendState = { error?: string };

// TODO(auth): trust the user id from the login-link session instead of the bound argument.
export async function sendToAgent(userId: string, _prev: SendState, form: FormData): Promise<SendState> {
  const message = String(form.get("message") ?? "").trim();
  if (!message) return {};
  try {
    await api.sendInterview(userId, message);
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) return { error: "finish onboarding in iMessage first, then you can chat here." };
    return { error: "your agent couldn't reply just now. try again in a bit." };
  }
  // What they tell their agent here should reach their profile (the "you" tab and matching). Rebuild it once the
  // reply is on screen, so chatting doesn't wait on it; a failure just leaves the previous profile in place.
  after(() => api.rebuildProfile(userId).catch(() => undefined));
  refresh();
  return {};
}
