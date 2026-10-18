// The preset library: every themed structure the World can build. A preset says which keywords justify it, how
// it looks (zone tint, furniture, activities) and where it likes to sit. Selection (select.ts) decides which
// presets a universe gets; layout (layout.ts) decides where; the renderer draws the furniture. Pure data.

import type { Activity, FurnitureKind } from "../layout";

/** Size tiers, picked from how many people a structure's keywords draw (select.ts). */
export type Tier = "S" | "M" | "L";

export type FurnitureSlot = {
  kind: FurnitureKind;
  /** Footprint in tiles. */
  w?: number;
  h?: number;
  /** "edge" pieces line the back of the zone, "center" pieces anchor it, "scatter" fill free tiles. */
  place: "edge" | "center" | "scatter";
  /** Smallest tier that gets this piece, so bigger structures are better furnished. */
  from?: Tier;
};

export type Preset = {
  id: string;
  name: string;
  /** Words and short phrases that justify the structure; matched against universe keywords (match.ts). */
  terms: string[];
  /** Light checker in the zone's tint, from the design-system palette. */
  floor: [number, number];
  furniture: FurnitureSlot[];
  /** What people do at its activity spots, and what a group does around its table. */
  activities: Activity[];
  group: { activity: Activity; pose: "sit" | "act" };
  /** Zone size in tiles per tier. */
  size: Record<Tier, [number, number]>;
  /** Presets it reads well next to (layout prefers these neighbours). */
  near?: string[];
};

const SIZE_STD: Record<Tier, [number, number]> = { S: [6, 6], M: [8, 7], L: [10, 8] };
const SIZE_WIDE: Record<Tier, [number, number]> = { S: [7, 5], M: [9, 6], L: [11, 7] };

export const PRESETS: Preset[] = [
  {
    id: "climbing",
    name: "Bouldering Wall",
    terms: ["climb", "boulder", "bouldering", "rock climbing", "crag"],
    floor: [0xefebe4, 0xe7e2d9],
    furniture: [
      { kind: "climbwall", w: 4, place: "edge" },
      { kind: "mat", w: 4, h: 2, place: "edge" },
      { kind: "climbwall", w: 3, place: "edge", from: "M" },
      { kind: "boulder", w: 2, h: 2, place: "center", from: "L" },
    ],
    activities: ["climb"],
    group: { activity: "climb", pose: "act" },
    size: SIZE_WIDE,
    near: ["outdoors", "fitness"],
  },
  {
    id: "outdoors",
    name: "Trailhead",
    terms: ["hike", "hiking", "trail", "camp", "camping", "outdoor", "nature", "surf", "ski", "snowboard", "kayak",
      "backpack", "mountain", "national park", "travel", "adventure", "garden", "gardening", "wildlife", "animals",
      "birdwatching"],
    floor: [0xe4e6d6, 0xdcdfcb],
    furniture: [
      { kind: "bench", w: 2, place: "edge" },
      { kind: "plant", place: "scatter" },
      { kind: "plant", place: "scatter", from: "M" },
      { kind: "table", w: 2, h: 2, place: "center", from: "M" },
    ],
    activities: ["chill", "read"],
    group: { activity: "chill", pose: "sit" },
    size: SIZE_STD,
    near: ["climbing", "fitness"],
  },
  {
    id: "fitness",
    name: "Gym & Track",
    terms: ["gym", "fitness", "run", "running", "lift", "lifting", "workout", "yoga", "pilates", "sport", "soccer",
      "football", "basketball", "tennis", "volleyball", "cycling", "bike", "swim", "marathon", "crossfit", "martial",
      "boxing", "pickleball", "training", "competition", "competitive", "athletics", "athlete", "sports"],
    floor: [0xf0ddd3, 0xe9d3c7],
    furniture: [
      { kind: "treadmill", place: "edge" },
      { kind: "treadmill", place: "edge" },
      { kind: "rack", w: 2, place: "edge" },
      { kind: "treadmill", place: "edge", from: "M" },
      { kind: "mat", w: 2, h: 2, place: "center", from: "L" },
    ],
    activities: ["run", "lift"],
    group: { activity: "lift", pose: "act" },
    size: SIZE_WIDE,
    near: ["climbing", "outdoors"],
  },
  {
    id: "kitchen",
    name: "Kitchen & Bar",
    terms: ["cook", "cooking", "food", "bake", "baking", "brunch", "breakfast", "coffee", "cafe", "café", "wine",
      "beer", "cocktail", "restaurant", "supper", "dinner", "foodie", "eat", "bbq", "ramen", "sushi", "pizza",
      "taco", "kitchen", "chef", "tea"],
    floor: [0xede2d0, 0xe5d8c4],
    furniture: [
      { kind: "fridge", place: "edge" },
      { kind: "stove", w: 2, place: "edge" },
      { kind: "counter", place: "edge" },
      { kind: "bar", w: 3, place: "edge", from: "M" },
      { kind: "table", w: 2, h: 2, place: "center" },
    ],
    activities: ["cook", "drink"],
    group: { activity: "drink", pose: "sit" },
    size: SIZE_WIDE,
    near: ["party", "boardgames"],
  },
  {
    id: "party",
    name: "Party Plaza",
    terms: ["party", "dance", "dancing", "club", "clubbing", "nightlife", "festival", "rave", "karaoke", "night out",
      "late night", "edm", "techno", "house music", "drinks"],
    floor: [0xe6e6ee, 0xdedfea],
    furniture: [
      { kind: "dj", w: 3, place: "edge" },
      { kind: "speaker", place: "edge" },
      { kind: "discofloor", w: 5, h: 3, place: "center" },
      { kind: "speaker", place: "edge", from: "M" },
    ],
    activities: ["dance"],
    group: { activity: "dance", pose: "act" },
    size: SIZE_WIDE,
    near: ["kitchen", "music"],
  },
  {
    id: "music",
    name: "Music Studio",
    terms: ["music", "guitar", "piano", "sing", "singing", "band", "concert", "jazz", "vinyl", "song", "drum",
      "drums", "dj", "live music", "choir", "orchestra"],
    floor: [0xf0e8d8, 0xe9dfcc],
    furniture: [
      { kind: "amp", place: "edge" },
      { kind: "drums", w: 2, place: "edge" },
      { kind: "piano", w: 2, place: "edge", from: "M" },
      { kind: "rug", w: 3, h: 2, place: "center" },
    ],
    activities: ["guitar", "drums", "keys"],
    group: { activity: "guitar", pose: "act" },
    size: SIZE_STD,
    near: ["party", "art"],
  },
  {
    id: "study",
    name: "Quiet Study",
    terms: ["read", "reading", "book", "books", "study", "write", "writing", "poetry", "science", "research",
      "learn", "learning", "philosophy", "history", "math", "language", "languages", "podcast", "literature"],
    floor: [0xefebe4, 0xe7e2d9],
    furniture: [
      { kind: "bookshelf", w: 2, place: "edge" },
      { kind: "desk", w: 2, place: "edge" },
      { kind: "bookshelf", w: 2, place: "edge", from: "M" },
      { kind: "rug", w: 3, h: 2, place: "center" },
      { kind: "bigtable", w: 2, h: 2, place: "center", from: "L" },
    ],
    activities: ["read", "type"],
    group: { activity: "read", pose: "sit" },
    size: SIZE_STD,
    near: ["tech", "boardgames"],
  },
  {
    id: "tech",
    name: "Hack Lab",
    terms: ["code", "coding", "program", "programming", "tech", "startup", "startups", "ai", "hackathon",
      "robotics", "engineering", "software", "data"],
    floor: [0xe3e7ec, 0xdbe0e6],
    furniture: [
      { kind: "desk", w: 2, place: "edge" },
      { kind: "desk", w: 2, place: "edge" },
      { kind: "desk", w: 2, place: "edge", from: "M" },
      { kind: "bigtable", w: 2, h: 2, place: "center", from: "M" },
    ],
    activities: ["type"],
    group: { activity: "type", pose: "sit" },
    size: SIZE_STD,
    near: ["study", "arcade"],
  },
  {
    id: "arcade",
    name: "Gaming Arcade",
    terms: ["game", "gaming", "video game", "video games", "arcade", "esports", "nintendo", "anime", "console"],
    floor: [0xd9dcea, 0xd0d4e5],
    furniture: [
      { kind: "arcade", place: "edge" },
      { kind: "arcade", place: "edge" },
      { kind: "arcade", place: "edge" },
      { kind: "arcade", place: "edge", from: "M" },
      { kind: "arcade", place: "edge", from: "L" },
    ],
    activities: ["game"],
    group: { activity: "game", pose: "sit" },
    size: SIZE_WIDE,
    near: ["boardgames", "tech"],
  },
  {
    id: "boardgames",
    name: "Board Game Café",
    terms: ["board game", "board games", "chess", "puzzle", "puzzles", "trivia", "dnd", "d&d", "tabletop", "cards"],
    floor: [0xece4d6, 0xe4dac9],
    furniture: [
      { kind: "table", w: 2, h: 2, place: "center" },
      { kind: "bookshelf", place: "edge" },
      { kind: "table", w: 2, h: 2, place: "center", from: "L" },
    ],
    activities: ["game"],
    group: { activity: "game", pose: "sit" },
    size: SIZE_STD,
    near: ["kitchen", "arcade"],
  },
  {
    id: "art",
    name: "Art Studio",
    terms: ["art", "arts", "paint", "painting", "draw", "drawing", "sketch", "photography", "photo", "design",
      "craft", "crafts", "pottery", "ceramics", "museum"],
    floor: [0xf1e9e0, 0xeadfd3],
    furniture: [
      { kind: "desk", w: 2, place: "edge" },
      { kind: "bigtable", w: 2, h: 2, place: "center" },
      { kind: "plant", place: "scatter", from: "M" },
    ],
    activities: ["type", "read"],
    group: { activity: "read", pose: "sit" },
    size: SIZE_STD,
    near: ["music", "cinema"],
  },
  {
    id: "cinema",
    name: "Screening Room",
    terms: ["film", "films", "movie", "movies", "cinema", "tv", "television", "series", "documentary", "sci-fi"],
    floor: [0xe2e1e6, 0xd9d8de],
    furniture: [
      { kind: "tv", w: 3, place: "edge" },
      { kind: "couch", w: 2, place: "center" },
      { kind: "couch", w: 2, place: "center", from: "M" },
    ],
    activities: ["chill"],
    group: { activity: "chill", pose: "sit" },
    size: SIZE_STD,
    near: ["art", "boardgames"],
  },
  {
    id: "wellness",
    name: "Garden Room",
    terms: ["meditation", "mindfulness", "wellness", "plants", "spa", "self-care", "journaling", "slow mornings"],
    floor: [0xe6e8dc, 0xdee1d2],
    furniture: [
      { kind: "plant", place: "scatter" },
      { kind: "rug", w: 3, h: 2, place: "center" },
      { kind: "plant", place: "scatter", from: "M" },
      { kind: "couch", place: "edge", from: "L" },
    ],
    activities: ["chill", "read"],
    group: { activity: "chill", pose: "sit" },
    size: SIZE_STD,
    near: ["outdoors", "study"],
  },
];

export const PRESET_BY_ID: Record<string, Preset> = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

/** Always present, whatever the keywords: where people arrive, and where pairs meet when no structure fits. */
export const SHARED = {
  spawn: { id: "spawn", name: "Spawn Plaza", size: [7, 6] as [number, number], floor: [0xefebe4, 0xe7e2d9] as [number, number] },
  square: { id: "square", name: "Meeting Square", size: [8, 8] as [number, number], floor: [0xece7de, 0xe3ddd2] as [number, number] },
};
