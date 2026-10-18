"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { adminApi, ApiError, type PublicProfile } from "@/lib/api";
import { SOCIALS, socialUrl } from "@/lib/socials";

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

export async function renameUniverse(universeId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "name can't be empty" };
  try {
    await adminApi.renameUniverse(universeId, name);
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "couldn't rename the universe" };
  }
  refresh();
  return {};
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


export type AddPersonState = {
  error?: string;
  added?: { userId: string; public: PublicProfile; scraping: string[]; link: string; qr: string };
};

/** APP_URL is the base a judge's phone can reach; without it, fall back to whatever host the admin is browsing. */
async function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

export async function addPerson(universeId: string, _prev: AddPersonState, form: FormData): Promise<AddPersonState> {
  const text = (k: string) => String(form.get(k) ?? "").trim();
  const full_name = text("full_name");
  const transcript = text("transcript");
  if (!full_name) return { error: "a name is needed" };
  if (!transcript) return { error: "say or type a little about them first" };
  const social_links = Object.fromEntries(SOCIALS.map((p) => [p, socialUrl(p, text(p))]).filter(([, url]) => url));
  try {
    const out = await adminApi.addPerson(universeId, {
      full_name,
      transcript,
      phone: text("phone") || undefined,
      email: text("email") || undefined,
      social_links,
      scrape_consent: form.get("scrape_consent") === "on",
    });
    const link = `${await appUrl()}/u/${out.user_id}`;
    const qr = await QRCode.toString(link, { type: "svg", margin: 0, color: { dark: "#26241f", light: "#0000" } });
    refresh();
    return { added: { userId: out.user_id, public: out.public, scraping: out.scraping, link, qr } };
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "couldn't add them" };
  }
}

export async function personPublic(userId: string) {
  return adminApi.personPublic(userId);
}

export async function deletePerson(userId: string): Promise<ActionState> {
  try {
    await adminApi.deletePerson(userId);
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : "couldn't remove them" };
  }
  refresh();
  return {};
}
