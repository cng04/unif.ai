// Turns pipeline data into where people belong: which phase to act out, each agent's home room, and a
// seat for every member of a CP-SAT group. Pure functions; the engine handles timing and movement.

import {
  COLS, ROOMS, ROOM_BY_ID, ROWS, circleSeats, roomAffinity, walkMatrix,
  type FloorId, type Room, type RoomId, type Spot,
} from "./layout";
import type { Phase, ViewMode, WorldAgent, WorldData } from "./types";

export const PHASES: Phase[] = ["lounge", "rooms", "chats", "groups"];

/** Phases the data can show: scores enable rooms, judged pairs enable chats, groups enable groups. */
export function availablePhases(data: WorldData): Phase[] {
  const out: Phase[] = ["lounge"];
  if (data.agents.some((a) => a.scored)) out.push("rooms");
  if (data.pairs.length) out.push("chats");
  if (data.groups.length) out.push("groups");
  return out;
}

export function resolvePhase(data: WorldData, view: ViewMode): Phase {
  const available = availablePhases(data);
  if (view !== "auto" && available.includes(view)) return view;
  return available[available.length - 1];
}

export function homeRoom(agent: WorldAgent, phase: Phase): RoomId {
  if (phase === "lounge" || !agent.scored) return "lounge";
  return roomAffinity(agent)[0];
}

export type Seat = { room: Room; spot: Spot; groupId: string };

const key = (floor: FloorId, x: number, y: number) => `${floor}:${x},${y}`;

/** Seat each group around a free table in the room its members like most (two tables per room). */
export function assignGroupSeats(data: WorldData): Map<string, Seat> {
  const seats = new Map<string, Seat>();
  const byId = new Map(data.agents.map((a) => [a.id, a]));
  const used = new Set<string>(); // "roomId:circleIndex"
  const taken = new Set<string>();
  const groups = [...data.groups].sort((a, b) => b.memberIds.length - a.memberIds.length || a.id.localeCompare(b.id));

  for (const group of groups) {
    const members = group.memberIds.filter((id) => byId.has(id));
    if (!members.length) continue;
    const score = new Map<RoomId, number>();
    for (const id of members)
      roomAffinity(byId.get(id)!).forEach((room, rank) => score.set(room, (score.get(room) ?? 0) + (8 - rank)));
    const ranked = [...score.keys()].sort((a, b) => score.get(b)! - score.get(a)!);

    let placed = false;
    for (const roomId of ranked) {
      const room = ROOM_BY_ID[roomId];
      const index = room.circles.findIndex((_, i) => !used.has(`${roomId}:${i}`));
      if (index < 0) continue;
      used.add(`${roomId}:${index}`);
      const circle = room.circles[index];
      const ring = circleSeats(circle.x, circle.y, room.groupPose, room.groupActivity);
      const extra = members.length > ring.length
        ? nearbyFree(room.floor, circle.x, circle.y, members.length - ring.length, taken, room, ring)
        : [];
      [...ring, ...extra].slice(0, members.length).forEach((spot, i) => {
        taken.add(key(room.floor, spot.x, spot.y));
        seats.set(members[i], { room, spot, groupId: group.id });
      });
      placed = true;
      break;
    }
    if (!placed) {
      // More groups than tables: gather round the middle of the best room.
      const room = ROOM_BY_ID[ranked[0]];
      nearbyFree(room.floor, room.x0 + 4, 5, members.length, taken, room).forEach((spot, i) => {
        taken.add(key(room.floor, spot.x, spot.y));
        seats.set(members[i], { room, spot, groupId: group.id });
      });
    }
  }
  return seats;
}

/** Breadth-first walkable tiles near (x, y) inside `room`, skipping taken tiles and ring seats. */
export function nearbyFree(
  floor: FloorId, x: number, y: number, count: number, taken: Set<string>, room: Room, skip: Spot[] = [],
): Spot[] {
  const matrix = walkMatrix(floor);
  const skipKeys = new Set(skip.map((s) => key(floor, s.x, s.y)));
  const seen = new Set<string>([`${x},${y}`]);
  const queue: [number, number][] = [[x, y]];
  const out: Spot[] = [];
  const pose = room.groupPose === "act" ? "act" : "stand";
  while (queue.length && out.length < count) {
    const [cx, cy] = queue.shift()!;
    const k = key(floor, cx, cy);
    if (matrix[cy][cx] === 0 && !taken.has(k) && !skipKeys.has(k))
      out.push({ x: cx, y: cy, dir: cy > y ? "N" : "S", pose, activity: room.groupActivity });
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < room.x0 || nx > room.x1 || ny < 0 || ny >= ROWS || nx >= COLS || seen.has(`${nx},${ny}`)) continue;
      seen.add(`${nx},${ny}`);
      queue.push([nx, ny]);
    }
  }
  return out;
}

export function roomsOn(floor: FloorId): Room[] {
  return ROOMS.filter((r) => r.floor === floor);
}
