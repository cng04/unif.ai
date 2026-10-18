// What the world page hands the browser. Built server-side from the API; only public profile fields and
// judge output that the API already exposes are included, never `agent_profiles.private`.

export type UniverseStatus = "onboarding" | "matching" | "matched";

export type WorldAgent = {
  id: string;
  name: string;
  /** Where they are in onboarding; "chatting" agents are still talking to the interviewer. */
  onboarding: "invited" | "chatting" | "complete";
  interests: string[];
  vibe: string | null;
  lookingFor: string | null;
  /** Has keyword scores, i.e. appears in `/graph`. */
  scored: boolean;
  /** 3D projection of the keyword scores, used to break room-affinity ties. */
  point: [number, number, number] | null;
};

export type WorldPair = {
  id: string;
  a: string;
  b: string;
  vibe: number | null;
  logistics: "strong" | "workable" | "incompatible" | null;
  dealbreakerFlags: string[];
  rationale: string | null;
};

export type WorldGroup = {
  id: string;
  /** The admin's group name ("g-01"), same as the groups page. */
  label: string;
  score: number | null;
  rationale: string | null;
  memberIds: string[];
  events: { name: string; url: string | null }[];
};

export type WorldData = {
  universe: { id: string; name: string; status: UniverseStatus };
  agents: WorldAgent[];
  pairs: WorldPair[];
  groups: WorldGroup[];
};

export type ChatLine = { speakerId: string; content: string };

/** Which pipeline stage the world acts out. "auto" follows the data. */
export type Phase = "lounge" | "rooms" | "chats" | "groups";
export type ViewMode = "auto" | Phase;

export type AgentState = "IDLE" | "WALKING" | "SITTING" | "THINKING" | "TALKING" | "ACTIVITY";
