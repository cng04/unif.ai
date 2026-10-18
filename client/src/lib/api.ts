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
  if (!res.ok) throw new ApiError(res.status, `${init?.method ?? "GET"} ${path} -> ${res.status}`);
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
  profile: (userId: string) => request<Profile>(`/users/${userId}/profile`),
  interview: (userId: string) => request<InterviewMessage[]>(`/users/${userId}/interview`),
  sendInterview: (userId: string, message: string) =>
    request<{ reply: string }>(`/users/${userId}/interview`, { method: "POST", body: JSON.stringify({ message }) }),
  universe: (universeId: string) => request<Universe>(`/universes/${universeId}`),
  users: (universeId: string) => request<UniverseUser[]>(`/universes/${universeId}/users`),
  graph: (universeId: string) => request<GraphPoint[]>(`/universes/${universeId}/graph`),
  pairs: (universeId: string) => request<Pair[]>(`/universes/${universeId}/pairs`),
  groups: (universeId: string) => request<Group[]>(`/universes/${universeId}/groups`),
  pairMessages: (pairId: string) => request<PairMessage[]>(`/pairs/${pairId}/messages`),
};
