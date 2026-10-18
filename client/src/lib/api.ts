import "server-only";

// Server-side only: the browser never talks to the API directly, so there's no CORS or key exposure.
const API_URL = process.env.API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    // FastAPI puts the reason in `detail` (e.g. "matching already in progress").
    const detail = await res.json().then((b) => (typeof b?.detail === "string" ? b.detail : null), () => null);
    throw new ApiError(res.status, detail ?? `${init?.method ?? "GET"} ${path} -> ${res.status}`);
  }
  return res.json();
}

export type UniverseStatus = "onboarding" | "matching" | "matched";

export type Member = { user_id: string; full_name: string };

export type Connection = {
  pair_id: string;
  user_id: string;
  full_name: string;
  vibe_score: number | null;
  logistics_fit: "strong" | "workable" | "incompatible" | null;
  conflict: boolean;
  in_group: boolean;
};

export type Group = {
  id: string;
  group_score: number | null;
  rationale: string | null;
  members: Member[];
  events: { name: string; url: string | null; venue: string | null; starts_at: string | null }[];
};

export type Connections = {
  user: Member;
  universe: { id: string; name: string; status: UniverseStatus };
  others: string[];
  connections: Connection[];
  group: Group | null;
  edges: { a: string; b: string; vibe_score: number | null }[];
};

export type PairDetail = {
  id: string;
  other: Member;
  vibe_score: number | null;
  logistics_fit: Connection["logistics_fit"];
  conflict: boolean;
  in_group: boolean;
  shared_keywords: string[];
  looking_for: string;
  messages: { speaker_id: string; content: string; created_at: string }[];
};

export type Profile = {
  user_id: string;
  public: { name: string; interests: string[]; vibe: string; looking_for: string };
  private: {
    dealbreakers: string[];
    values: string[];
    energy: string;
    logistics: { area: string | null; budget: string | null; free: string[] };
  };
};

/** Everyone placed in 3D by keyword scores. Only me, my group, and my judged matches carry a name. */
export type UserGraph = {
  keywords: string[];
  axes: [string, string, string] | null;
  nodes: {
    user_id: string;
    name: string | null;
    kind: "me" | "group" | "match" | "pool";
    pair_id: string | null;
    vibe_score: number | null;
    conflict: boolean;
    x: number;
    y: number;
    z: number;
  }[];
  links: { a: string; b: string; mine: boolean }[];
};

export type InterviewMessage = { role: "user" | "assistant"; content: string };

export type Universe = { id: string; name: string; status: UniverseStatus };

export type UniverseUser = { id: string; full_name: string; created_at: string };

export type GraphPoint = { user_id: string; name: string; x: number; y: number; z: number; group_id: string | null };

export type Pair = {
  id: string;
  user_a: string;
  user_b: string;
  vibe_score: number | null;
  dealbreaker_flags: string[];
  logistics_fit: Connection["logistics_fit"];
  judge_rationale: string | null;
};

export type PairMessage = { speaker_id: string; content: string; created_at: string };

export const api = {
  connections: (userId: string) => request<Connections>(`/users/${userId}/connections`),
  pair: (userId: string, pairId: string) => request<PairDetail>(`/users/${userId}/pairs/${pairId}`),
  graph: (userId: string, axes?: string[]) =>
    request<UserGraph>(`/users/${userId}/graph${axes ? `?axes=${encodeURIComponent(axes.join(","))}` : ""}`),
  profile: (userId: string) => request<Profile>(`/users/${userId}/profile`),
  interview: (userId: string) => request<InterviewMessage[]>(`/users/${userId}/interview`),
  sendInterview: (userId: string, message: string) =>
    request<{ reply: string }>(`/users/${userId}/interview`, { method: "POST", body: JSON.stringify({ message }) }),
  universe: (universeId: string) => request<Universe>(`/universes/${universeId}`),
  users: (universeId: string) => request<UniverseUser[]>(`/universes/${universeId}/users`),
  universeGraph: (universeId: string) => request<GraphPoint[]>(`/universes/${universeId}/graph`),
  pairs: (universeId: string) => request<Pair[]>(`/universes/${universeId}/pairs`),
  groups: (universeId: string) => request<Group[]>(`/universes/${universeId}/groups`),
  pairMessages: (pairId: string) => request<PairMessage[]>(`/pairs/${pairId}/messages`),
};

// ---- Admin (client/src/app/admin). The server checks ADMIN_PASSWORD on /admin/api; we forward the same one. ----

const adminHeaders = (): HeadersInit => {
  const password = process.env.ADMIN_PASSWORD;
  return password ? { authorization: `Basic ${btoa(`admin:${password}`)}` } : {};
};

export type UniverseSummary = {
  id: string;
  name: string;
  status: UniverseStatus;
  invite_code: string;
  invite_url: string;
  created_at: string;
};

export type UniverseListItem = UniverseSummary & { members: number; onboarded: number; groups: number };

export type OnboardingStatus = "invited" | "chatting" | "complete";

export type UniverseDetail = UniverseSummary & {
  stats: {
    members: number;
    onboarded: number;
    keywords: number;
    scored: number;
    pairs: number;
    conflicts: number;
    avg_vibe: number | null;
    groups: number;
    placed: number;
    unplaced: number;
    events: number;
    groups_with_events: number;
  };
  members: {
    id: string;
    full_name: string;
    contact: string | null;
    joined_at: string;
    status: OnboardingStatus;
    dealbreakers: number;
    group: string | null;
    chats: number;
    strong_ties: number;
  }[];
  keywords: UniverseKeyword[];
};

export type UniverseKeyword = { name: string; description: string | null; high: number; dealbreakers: number };

export type UniverseGroups = UniverseSummary & {
  groups: (Group & { label: string; weakest_tie: { a: string; b: string; vibe_score: number | null } | null })[];
  leftovers: { id: string; full_name: string; chats: number; strong_ties: number }[];
};

/** Matching's keyword vectors (admin only): 0-1 score per keyword and the keywords each member flagged. */
export type UniverseScores = {
  keywords: string[];
  members: { user_id: string; scores: Record<string, number>; dealbreakers: string[] }[];
};

export const adminApi = {
  scores: (id: string) => request<UniverseScores>(`/admin/api/universes/${id}/scores`, { headers: adminHeaders() }),
  universes: () => request<UniverseListItem[]>("/admin/api/universes", { headers: adminHeaders() }),
  createUniverse: (name: string, admin_email: string) =>
    request<UniverseSummary>("/admin/api/universes", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ name, admin_email }),
    }),
  renameUniverse: (id: string, name: string) =>
    request<UniverseSummary>(`/admin/api/universes/${id}`, {
      method: "PATCH",
      headers: adminHeaders(),
      body: JSON.stringify({ name }),
    }),
  universe: (id: string) => request<UniverseDetail>(`/admin/api/universes/${id}`, { headers: adminHeaders() }),
  groups: (id: string) => request<UniverseGroups>(`/admin/api/universes/${id}/groups`, { headers: adminHeaders() }),
  runMatching: (id: string) =>
    request<{ status: string }>(`/universes/${id}/matching`, { method: "POST", headers: adminHeaders() }),
  abortMatching: (id: string) =>
    request<{ status: string }>(`/admin/api/universes/${id}/matching/abort`, { method: "POST", headers: adminHeaders() }),
};

// ---- Join page (client/src/app/join). Validation, seats and member creation all happen on the server. ----

export type Invite = {
  name: string;
  open: boolean;
  imessage: boolean;
  asi_command: string;
  asi_handle: string;
  asi_url: string | null;
};

export type JoinResult = {
  status: "joined" | "pending" | "invalid" | "imessage_full";
  message: string | null;
  first_name: string | null;
  phone: string | null;
  line: string | null;
  sms: string | null;
};

export const joinApi = {
  invite: (code: string) => request<Invite>(`/invites/${encodeURIComponent(code)}`),
  join: (code: string, body: { name: string; phone: string; consent: boolean }) =>
    request<JoinResult>(`/invites/${encodeURIComponent(code)}/join`, { method: "POST", body: JSON.stringify(body) }),
};
