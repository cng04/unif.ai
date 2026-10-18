import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import type { ImportedProfile, Profile } from "./profile.ts";

export type Stage =
  | "new"
  | "pool"
  | "name"
  | "accounts"
  | "paste"
  | "interview"
  | "review"
  | "dealbreakers"
  | "done";

export interface Session {
  spaceId: string;
  platform: string;
  senderId?: string;
  /** Server user id, when this phone signed up on the join page. */
  userId?: string;
  /** Pool picked with a "join <code>" message (ASI:One); otherwise DEFAULT_UNIVERSE_ID. */
  pool?: { id: string; name: string };
  stage: Stage;
  name?: string;
  accounts: { raw: string; platforms: string[]; links?: Record<string, string> } | null;
  /** Public-profile summaries scraped by the server (untrusted web content). */
  scraped?: Record<string, string>;
  pasteBuffer: string; // raw paste text, kept only until parsed; never sent to a model
  imported: ImportedProfile | null;
  followUps: string[];
  /** Interviewer conversation with Claude (append-only). */
  llm: Anthropic.Beta.Messages.BetaMessageParam[];
  interviewTurns: number;
  /** Consecutive interview replies that skipped the question (see classifySkip). Missing on older sessions. */
  skipsInARow?: number;
  draft: Profile | null;
  /** Full human-readable log of the onboarding chat. */
  transcript: { from: "user" | "agent"; text: string; at: string }[];
  /** How many transcript lines have been written to onboarding_messages. */
  loggedCount?: number;
  updatedAt: string;
}

const DATA = join(import.meta.dirname, "..", "data");
const safe = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, "_");
const sessionPath = (id: string) => join(DATA, "sessions", `${safe(id)}.json`);

export function newSession(spaceId: string, platform: string, senderId?: string): Session {
  return {
    spaceId,
    platform,
    senderId,
    stage: "new",
    accounts: null,
    pasteBuffer: "",
    imported: null,
    followUps: [],
    llm: [],
    interviewTurns: 0,
    draft: null,
    transcript: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function loadSession(spaceId: string): Promise<Session | null> {
  try {
    return JSON.parse(await readFile(sessionPath(spaceId), "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(path: string, data: unknown) {
  await mkdir(join(path, ".."), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, path);
}

export async function saveSession(s: Session) {
  s.updatedAt = new Date().toISOString();
  await writeJson(sessionPath(s.spaceId), s);
}

/** The record the rest of the pipeline (persona agents, scoring) reads. */
export async function saveProfile(s: Session, profile: Profile) {
  const path = join(DATA, "profiles", `${safe(s.spaceId)}.json`);
  await writeJson(path, {
    id: safe(s.spaceId),
    platform: s.platform,
    contact: s.senderId ?? null,
    ...profile,
    dealbreakers_confirmed_at: new Date().toISOString(),
    accounts: s.accounts,
    scraped_accounts: s.scraped ?? {},
    server_user_id: s.userId ?? null,
    imported_from_ai: s.imported,
    onboarding_transcript: s.transcript,
    created_at: new Date().toISOString(),
  });
  return path;
}
