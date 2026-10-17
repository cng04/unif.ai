// Reads and writes against the server's Postgres (users joined via the /join/<code> page), plus the one
// server call the bot makes: sharing social links so the server can scrape them.
import pg from "pg";

const pool = process.env.DATABASE_URL ? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 }) : null;
const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:8000";

export interface Member {
  id: string;
  fullName: string;
}

/** A pool (universe) by its invite code, if it's still taking members. */
export async function lookupPool(code: string): Promise<{ id: string; name: string } | null> {
  if (!pool) return null;
  try {
    const { rows } = await pool.query<{ id: string; name: string }>(
      "SELECT id, name FROM universes WHERE invite_code = $1 AND status = 'onboarding'",
      [code],
    );
    return rows[0] ?? null;
  } catch (err) {
    console.error("[members] pool lookup failed", err);
    return null;
  }
}

/** Which users column identifies a sender on each platform (iMessage: E.164 phone; ASI:One: agent address). */
const contactColumn = (platform: string) => (platform === "asi" ? "asi_address" : "phone");

/** An existing user for this sender: joined via the join page (phone) or onboarded on ASI:One before. Null if unknown or the DB is unreachable. */
export async function lookupMember(handle: string | undefined, platform: string): Promise<Member | null> {
  if (!pool || !handle) return null;
  try {
    const { rows } = await pool.query<{ id: string; full_name: string }>(
      `SELECT id, full_name FROM users WHERE ${contactColumn(platform)} = $1 ORDER BY created_at DESC LIMIT 1`,
      [handle],
    );
    return rows[0] ? { id: rows[0].id, fullName: rows[0].full_name } : null;
  } catch (err) {
    // Fall back to asking for their name rather than failing the message.
    console.error("[members] lookup failed", err);
    return null;
  }
}

/** Hand links to the server, which stores them and scrapes new ones in the background. Best-effort. */
export async function shareLinks(userId: string, links: Record<string, string>): Promise<void> {
  try {
    const res = await fetch(`${SERVER_URL}/users/${userId}/social-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[members] share links failed", res.status, await res.text());
  } catch (err) {
    console.error("[members] share links failed", err);
  }
}

/** Scrape summaries the server has stored so far, keyed by platform. */
export async function getScraped(userId: string): Promise<Record<string, string>> {
  if (!pool) return {};
  try {
    const { rows } = await pool.query<{ scraped: Record<string, unknown> | null }>(
      "SELECT raw_sources->'scraped' AS scraped FROM agent_profiles WHERE user_id = $1",
      [userId],
    );
    const scraped = rows[0]?.scraped ?? {};
    return Object.fromEntries(
      Object.entries(scraped)
        .filter(([, v]) => typeof v === "string" && v.trim())
        .map(([k, v]) => [k.slice(0, 40), (v as string).slice(0, 1500)]),
    );
  } catch (err) {
    console.error("[members] scraped lookup failed", err);
    return {};
  }
}

/** Wait up to `waitMs` for scrapes of `platforms` to land; returns whatever is there by then. */
export async function waitForScraped(userId: string, platforms: string[], waitMs: number): Promise<Record<string, string>> {
  const deadline = Date.now() + waitMs;
  let scraped = await getScraped(userId);
  while (platforms.some((p) => !(p in scraped)) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3_000));
    scraped = await getScraped(userId);
  }
  return scraped;
}

/** Append onboarding chat lines to onboarding_messages. Throws on failure so the caller can retry later. */
export async function logMessages(userId: string, lines: { from: "user" | "agent"; text: string; at: string }[]) {
  if (!pool || !lines.length) return;
  await pool.query(
    `INSERT INTO onboarding_messages (user_id, role, content, created_at)
     SELECT $1, role, content, at FROM unnest($2::text[], $3::text[], $4::timestamptz[]) AS t(role, content, at)`,
    [
      userId,
      lines.map((l) => (l.from === "user" ? "user" : "assistant")),
      lines.map((l) => l.text),
      lines.map((l) => l.at),
    ],
  );
}

/** Write the confirmed profile where matching reads it. `rawSources` is merged into raw_sources. */
export async function saveMemberProfile(
  userId: string,
  profile: { public: unknown; private: unknown },
  rawSources: Record<string, unknown>,
) {
  if (!pool) return;
  await pool.query(
    `UPDATE agent_profiles
     SET public = $2, private = $3, raw_sources = raw_sources || $4, updated_at = now()
     WHERE user_id = $1`,
    [userId, JSON.stringify(profile.public), JSON.stringify(profile.private), JSON.stringify(rawSources)],
  );
}

/**
 * Store the validated AI-written profile where the server's profile builder reads it
 * (raw_sources.self_report, a string). Only the schema-checked JSON is stored, never the raw paste.
 */
export async function saveSelfReport(userId: string, imported: unknown): Promise<void> {
  if (!pool) return;
  await pool.query(
    "UPDATE agent_profiles SET raw_sources = raw_sources || $2, updated_at = now() WHERE user_id = $1",
    [userId, JSON.stringify({ self_report: JSON.stringify(imported, null, 2) })],
  );
}

/**
 * Create a user for someone who texted without using a join link, mirroring the server's
 * create_user (users row + empty agent_profiles row). They land in `universeId` (from a "join <code>"
 * message) or else DEFAULT_UNIVERSE_ID.
 * Returns null when no database is configured.
 */
export async function createMember(
  fullName: string,
  handle: string | undefined,
  platform: string,
  poolId?: string,
): Promise<string | null> {
  if (!pool) return null;
  const universeId = poolId ?? process.env.DEFAULT_UNIVERSE_ID ?? "00000000-0000-0000-0000-000000000001";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO users (universe_id, full_name, ${contactColumn(platform)}) VALUES ($1, $2, $3) RETURNING id`,
      [universeId, fullName, handle ?? null],
    );
    await client.query("INSERT INTO agent_profiles (user_id, public) VALUES ($1, $2)", [
      rows[0].id,
      JSON.stringify({ name: fullName }),
    ]);
    await client.query("COMMIT");
    return rows[0].id;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
