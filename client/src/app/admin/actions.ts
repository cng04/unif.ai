"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { adminApi, ApiError } from "@/lib/api";

export type ActionState = { error?: string };

// The /admin proxy gates who can load these pages; the API re-checks ADMIN_PASSWORD on every call.

export async function createUniverse(_prev: ActionState, form: FormData): Promise<ActionState> {
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("admin_email") ?? "").trim();
  if (!name || !email) return { error: "name and admin email are both needed" };
  let id: string;
  try {
    id = (await adminApi.createUniverse(name, email)).id;
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "couldn't create the universe" };
  }
  redirect(`/admin/universes/${id}`);
}

export async function runMatching(universeId: string): Promise<ActionState> {
  try {
    await adminApi.runMatching(universeId);
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "couldn't start matching" };
  }
  refresh();
  return {};
}

export async function abortMatching(universeId: string): Promise<ActionState> {
  try {
    await adminApi.abortMatching(universeId);
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "couldn't abort matching" };
  }
  refresh();
  return {};
}
