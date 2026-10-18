// Small shared types for the World UI. The data model itself is the server snapshot (world/snapshot.ts).

export type AgentState = "IDLE" | "WALKING" | "SITTING" | "THINKING" | "TALKING" | "ACTIVITY";

/** One message of a pair's transcript (messages only; private notes are never sent). */
export type ChatLine = { speakerId: string; content: string; createdAt: string };

/** Where a conversation the UI shows comes from. "replay" is a re-enactment of a completed chat. */
export type Origin = "live" | "completed" | "replay" | "historical";
