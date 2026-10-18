// The World snapshot as the server sends it (server/app/routers/world.py). Fields marked optional exist only in
// the admin view; a participant's view never carries them.

export type UniverseStatus = "onboarding" | "matching" | "matched";
export type MatchingStage = "keywords" | "scoring" | "chats" | "groups";

export type SnapshotMember = {
  id: string;
  name: string;
  joined_at: string;
  onboarding: "invited" | "chatting" | "complete";
  /** Mid-interview and talking to the interviewer right now. */
  busy: boolean;
  scored: boolean;
  /** Up to 3 keywords they score high on, best first (both views). */
  top_keywords: string[];
  interests: string[];
  looking_for: string | null;
  vibe: string | null;
  /** Admin only. */
  scores?: Record<string, number>;
  /** Admin only: keywords they flagged as dealbreakers. */
  dealbreakers?: string[];
};

export type SnapshotPair = {
  /** Null for other people's pairs in a participant's view. */
  id: string | null;
  a: string;
  b: string;
  status: "running" | "complete";
  started_at: string;
  completed_at: string | null;
  /** Admin, or the viewer's own pairs. Latest public turn while the chat is still running. */
  line?: { speaker_id: string; content: string };
  /** Admin, or the viewer's own pairs. */
  vibe?: number | null;
  logistics?: "strong" | "workable" | "incompatible" | null;
  /** Admin only. */
  dealbreaker_flags?: string[];
  rationale?: string | null;
  end_reason?: string | null;
};

export type SnapshotGroup = {
  id: string;
  label: string | null;
  member_ids: string[];
  /** Admin, or the viewer's own group. */
  score?: number | null;
  plans_status?: "pending" | "ready" | "none";
  events?: { name: string; url: string | null; venue: string | null; starts_at: string | null; time_label: string | null; price: string | null }[];
  /** Admin only. */
  rationale?: string | null;
};

export type WorldSnapshot = {
  version: string;
  /** Null in the admin view; the participant's user id otherwise. */
  viewer: string | null;
  universe: { id: string; name: string; status: UniverseStatus; is_demo: boolean; stage: MatchingStage | null; stage_at: string | null };
  keywords: { name: string; people: number; dealbreakers?: number }[];
  members: SnapshotMember[];
  pairs: SnapshotPair[];
  groups: SnapshotGroup[];
};

/** What polling returns when nothing changed since `since`. */
export type Unchanged = { version: string; unchanged: true };
