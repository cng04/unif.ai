import { z } from "zod";

// ---------- Profile pasted back from the user's own AI (untrusted) ----------

const str = (max: number) => z.string().trim().max(max).catch("");
const list = (max = 25) =>
  z.array(z.string().trim().max(400)).max(max).catch([]);

export const ImportedProfile = z
  .object({
    interests: list(),
    thinking_style: str(1500),
    communication: z
      .object({ tone: str(600), humor: str(600), example: str(600) })
      .partial()
      .catch({}),
    social_energy: str(1500),
    values: list(),
    frustrations: list(),
    quirks: list(),
    group_role: str(1000),
    possible_dealbreakers: list(),
    surprising_traits: list(),
    unknowns: list(),
  })
  .partial()
  // Unknown keys are dropped, so nothing outside the schema reaches a prompt.
  .strip();
export type ImportedProfile = z.infer<typeof ImportedProfile>;

const KNOWN_KEYS = Object.keys(ImportedProfile.shape);

/** Pull the profile JSON object out of a pasted AI reply. Returns null if none is found. */
export function extractImportedProfile(raw: string): ImportedProfile | null {
  const text = raw.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const candidates: string[] = [];
  for (const m of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) candidates.push(m[1]);
  candidates.push(...balancedObjects(text));

  // Prefer the last match: the prompt asks for the JSON at the end.
  for (const c of candidates.reverse()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(c);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    if (!Object.keys(parsed).some((k) => KNOWN_KEYS.includes(k))) continue;
    const result = ImportedProfile.safeParse(parsed);
    if (result.success) return result.data;
  }
  return null;
}

/** Top-level `{...}` spans, respecting strings. */
function balancedObjects(text: string): string[] {
  const out: string[] = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"' && depth > 0) inStr = true;
    else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0) out.push(text.slice(start, i + 1));
    }
  }
  return out;
}

/** Things the interviewer should follow up on: unknowns and [inferred] claims. */
export function followUps(p: ImportedProfile): string[] {
  const items: string[] = [...(p.unknowns ?? [])];
  const scan = (label: string, v: unknown) => {
    if (typeof v === "string") {
      if (/\[inferred\]/i.test(v)) items.push(`${label}: ${v}`);
      if (/^unknown\.?$/i.test(v.trim())) items.push(`${label}: unknown`);
    } else if (Array.isArray(v)) v.forEach((x) => scan(label, x));
    else if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) scan(`${label}.${k}`, x);
  };
  for (const [k, v] of Object.entries(p)) if (k !== "unknowns") scan(k, v);
  return items;
}

// ---------- Accounts ----------

const PLATFORMS: Record<string, RegExp> = {
  Instagram: /\b(instagram|insta|ig)\b/i,
  Spotify: /\bspotify\b/i,
  Letterboxd: /\bletterboxd\b/i,
  Goodreads: /\b(goodreads|storygraph)\b/i,
  Strava: /\bstrava\b/i,
  Beli: /\bbeli\b/i,
  LinkedIn: /\blinked\s?in\b/i,
  X: /\b(twitter|x\.com)\b|(^|[\s,])x\s*[:@(]|(^|[\s,])x\s*$/i,
  TikTok: /\btik\s?tok\b/i,
  Pinterest: /\bpinterest\b/i,
};

export function parseAccounts(text: string): string[] {
  if (/^\s*(skip|none|no|nah|pass)\b/i.test(text)) return [];
  return Object.entries(PLATFORMS)
    .filter(([, re]) => re.test(text))
    .map(([name]) => name);
}

const HOSTS: Record<string, string> = {
  "letterboxd.com": "letterboxd",
  "goodreads.com": "goodreads",
  "app.thestorygraph.com": "storygraph",
  "strava.com": "strava",
  "open.spotify.com": "spotify",
  "instagram.com": "instagram",
  "linkedin.com": "linkedin",
  "x.com": "x",
  "twitter.com": "x",
  "tiktok.com": "tiktok",
  "github.com": "github",
  "beliapp.com": "beli",
};

// Platforms where a bare handle maps to a public profile URL.
const HANDLE_URLS: Record<string, (h: string) => string> = {
  letterboxd: (h) => `https://letterboxd.com/${h}/`,
  instagram: (h) => `https://www.instagram.com/${h}/`,
  x: (h) => `https://x.com/${h}`,
  twitter: (h) => `https://x.com/${h}`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  github: (h) => `https://github.com/${h}`,
  linkedin: (h) => `https://www.linkedin.com/in/${h}/`,
};

/** Profile links from free text: URLs (with or without https://) and "platform: @handle" pairs. */
export function extractLinks(text: string): Record<string, string> {
  const links: Record<string, string> = {};
  const urlRe = /\b(?:https?:\/\/)?(?:www\.)?((?:[a-z0-9-]+\.)+[a-z]{2,})(\/[^\s,;)]*)?/gi;
  for (const m of text.matchAll(urlRe)) {
    const host = m[1].toLowerCase();
    const platform = HOSTS[host] ?? Object.entries(HOSTS).find(([h]) => host.endsWith(`.${h}`))?.[1];
    const path = m[2] ?? "";
    if (!platform && !/^https?:\/\//i.test(m[0])) continue; // "e.g." etc. aren't sites
    if (platform && path.length <= 1) continue; // a bare homepage isn't a profile
    const key = platform ?? "website";
    links[key] ??= `https://${m[0].replace(/^https?:\/\//i, "")}`;
  }
  const handleRe = /\b(letterboxd|instagram|insta|ig|twitter|x|tiktok|github|linkedin)\s*(?::|-|\s)\s*@?([a-z0-9._-]{2,40})\b/gi;
  for (const m of text.matchAll(handleRe)) {
    const raw = m[1].toLowerCase();
    const platform = raw === "insta" || raw === "ig" ? "instagram" : raw === "twitter" ? "x" : raw;
    const handle = m[2].replace(/^@/, "");
    if (handle.includes(".") && /\.(com|app|io)$/i.test(handle)) continue; // a domain, handled above
    links[platform] ??= HANDLE_URLS[platform](handle);
  }
  return links;
}

// ---------- Final profile (what the interviewer submits) ----------

const Source = z.enum(["stated_by_user", "observed_by_ai", "inferred_by_ai"]);
const Fact = z.object({ text: z.string(), source: Source });

export const Profile = z.object({
  public: z.object({
    name: z.string(),
    /** Their own words, verbatim. The agent may quote it. */
    intro: z.string(),
    interests: z.array(Fact),
    vibe: z.string(),
    looking_for: z.string(),
  }),
  private: z.object({
    dealbreakers: z.array(z.string()),
    values: z.array(Fact),
    frustrations: z.array(Fact),
    energy: z.string(),
    logistics: z.object({ area: z.string(), travel: z.string(), budget: z.string(), availability: z.string() }),
  }),
  enjoyment_definition: z.string(),
  communication: z.object({ tone: z.string(), humor: z.string(), example: z.string() }),
  thinking_style: z.string(),
  quirks: z.array(Fact),
  group_role: z.string(),
  surprising_traits: z.array(Fact),
});
export type Profile = z.infer<typeof Profile>;

// Hand-written JSON schema for the submit_profile tool (strict mode needs
// additionalProperties:false and every key required at every level).
const s = { type: "string" } as const;
const fact = {
  type: "object",
  properties: { text: s, source: { type: "string", enum: Source.options } },
  required: ["text", "source"],
  additionalProperties: false,
} as const;
const facts = { type: "array", items: fact } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const PROFILE_JSON_SCHEMA = obj({
  public: obj({ name: s, intro: s, interests: facts, vibe: s, looking_for: s }),
  private: obj({
    dealbreakers: { type: "array", items: s },
    values: facts,
    frustrations: facts,
    energy: s,
    logistics: obj({ area: s, travel: s, budget: s, availability: s }),
  }),
  enjoyment_definition: s,
  communication: obj({ tone: s, humor: s, example: s }),
  thinking_style: s,
  quirks: facts,
  group_role: s,
  surprising_traits: facts,
});

/**
 * Human-readable summary for the review step (one string per bubble), split the same way the
 * agent profile is (toServerProfile): what the agent may share vs. what stays private.
 */
export function summarize(p: Profile): string[] {
  const t = (fs: { text: string }[]) => fs.map((f) => f.text).join("; ") || "—";
  return [
    "🗣 what your agent can share:",
    `${p.public.name}: ${p.public.vibe}\nlooking for: ${p.public.looking_for}`,
    ...(p.public.intro.trim() ? [`💬 in your words (your agent may quote this): "${p.public.intro.trim()}"`] : []),
    `🎯 into: ${t(p.public.interests)}\n😂 humor: ${p.communication.humor}\n🧩 group role: ${p.group_role}\n🌀 quirks: ${t(p.quirks)}`,
    "🔒 private: your agent never says these out loud, but they shape how it acts and who it thinks you'll click with:",
    `💛 values: ${t(p.private.values)}\n😤 frustrated by: ${t(p.private.frustrations)}\n✨ you enjoy people who: ${p.enjoyment_definition}`,
    `⚡ energy: ${p.private.energy}\n🎁 surprising: ${t(p.surprising_traits)}`,
    `📍 ${p.private.logistics.area} (${p.private.logistics.travel}) · 💸 ${p.private.logistics.budget} · 🗓 ${p.private.logistics.availability}`,
  ];
}

// ---------- Server shape (agent/src/unifai_agent/profile.py: ProfileDraft) ----------

const known = (v: string) => (/^\s*(unknown|n\/a|none)?\.?\s*$/i.test(v) ? null : v.trim());

/**
 * Map the interviewer's profile onto the server's public/private ProfileDraft, which matching reads.
 * Facts become plain strings; everything the server schema has no slot for goes in `extras`
 * (stored under raw_sources) so nothing is lost.
 */
export function toServerProfile(p: Profile) {
  const texts = (fs: { text: string }[]) => fs.map((f) => f.text);
  const availability = known(p.private.logistics.availability);
  return {
    public: {
      name: p.public.name,
      intro: p.public.intro.trim(),
      interests: texts(p.public.interests),
      vibe: known(p.public.vibe) ?? "",
      looking_for: known(p.public.looking_for) ?? "",
      humor: known(p.communication.humor) ?? "",
      quirks: texts(p.quirks),
      group_role: known(p.group_role) ?? "",
    },
    private: {
      dealbreakers: p.private.dealbreakers,
      values: texts(p.private.values),
      energy: known(p.private.energy) ?? "",
      logistics: {
        area: known(p.private.logistics.area),
        travel: known(p.private.logistics.travel),
        budget: known(p.private.logistics.budget),
        free: availability ? [availability] : [],
      },
      enjoyment_definition: known(p.enjoyment_definition) ?? "",
      frustrations: texts(p.private.frustrations),
      surprising_traits: texts(p.surprising_traits),
    },
    extras: {
      enjoyment_definition: p.enjoyment_definition,
      communication: p.communication,
      thinking_style: p.thinking_style,
      group_role: p.group_role,
      // Source-tagged versions of the facts flattened above.
      interests: p.public.interests,
      values: p.private.values,
      frustrations: p.private.frustrations,
      quirks: p.quirks,
      surprising_traits: p.surprising_traits,
    },
  };
}
