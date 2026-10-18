"use server";

import { ApiError, joinApi, type JoinResult } from "@/lib/api";

export type JoinState = { result?: JoinResult; error?: string; name?: string; phone?: string };

export async function joinPool(code: string, _prev: JoinState, form: FormData): Promise<JoinState> {
  const name = String(form.get("name") ?? "");
  const phone = String(form.get("phone") ?? "");
  try {
    // No consent checkbox on this page: tapping "join" counts as agreeing to messages from the agent.
    const result = await joinApi.join(code, { name, phone, consent: true });
    // Keep what they typed so a validation error doesn't wipe the form.
    return { result, name, phone };
  } catch (e) {
    if (e instanceof ApiError && e.status === 410) return { error: "This group just closed to new members.", name, phone };
    return { error: "Something went wrong on our end. Please try again.", name, phone };
  }
}
