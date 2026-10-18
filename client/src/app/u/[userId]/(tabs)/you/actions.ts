"use server";

import { api } from "@/lib/api";
import type { Look } from "@/components/visualizer/character";

export type LookState = { look?: Look; error?: string };

// TODO(auth): trust the user id from the login-link session instead of the bound argument.
export async function saveLook(userId: string, look: Look): Promise<LookState> {
  try {
    const { skin, hair, hair_style, shirt_hue, pants } = look;
    return { look: await api.setLook(userId, { skin, hair, hair_style, shirt_hue, pants }) };
  } catch {
    return { error: "couldn't save that just now. try again in a bit." };
  }
}

export async function resetLook(userId: string): Promise<LookState> {
  try {
    return { look: await api.resetLook(userId) };
  } catch {
    return { error: "couldn't reset just now. try again in a bit." };
  }
}
