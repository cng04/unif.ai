// Shared iMessage lines only talk to people who've been assigned to the line.
// Usage: npm run assign -- +14155550123 [First] [Last]
// Prints the number that person should text. In production, call this from sign-up.
import { Photon } from "@photon-ai/api";
import { required } from "../src/transport/photon.ts";

const [handle, firstName, lastName] = process.argv.slice(2);
if (!handle) throw new Error("Usage: npm run assign -- <phone in E.164 or iMessage email> [first] [last]");

const photon = new Photon({ headers: { Authorization: `Bearer ${required("PHOTON_API_KEY")}` } });
const assignment = await photon.projects.platforms.imessage.assignments.create({
  path: { id: required("PHOTON_PROJECT_ID") },
  // Stable per handle, so re-running for the same person doesn't use another seat.
  headers: { idempotencyKey: `onboarding-assign:${handle}` },
  body: { handle, ...(firstName && { firstName }), ...(lastName && { lastName }) },
});
console.log(`${handle} → text ${assignment.assignedPhoneNumber} to start onboarding`);
