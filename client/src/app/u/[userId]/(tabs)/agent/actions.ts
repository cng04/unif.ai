"use server";

import { refresh } from "next/cache";
import { api } from "@/lib/api";

export type SendState = { error?: string };

// TODO(auth): trust the user id from the login-link session instead of the bound argument.
export async function sendToAgent(userId: string, _prev: SendState, form: FormData): Promise<SendState> {
  const message = String(form.get("message") ?? "").trim();
  if (!message) return {};
  try {
    await api.sendInterview(userId, message);
  } catch {
    return { error: "your agent couldn't reply just now. try again in a bit." };
  }
  refresh();
  return {};
}
