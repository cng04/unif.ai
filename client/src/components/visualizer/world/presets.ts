// The preset library: every themed structure the World can build, after the Paper "World catalog · single
// floor" rooms (taken as direction, not spec). A preset says which keywords justify it, what people do there,
// and one or more visual variants (tint and furniture); the plan picks one variant per universe from its seed.
// Selection (select.ts) decides which presets a universe gets, layout (plan.ts) where. Pure data.

import type { Activity, FurnitureKind } from "./geometry";

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

export type Variant = { name: string; floor: [number, number]; furniture: FurnitureSlot[] };

export type Preset = {
  id: string;
  name: string;
  /** Words and short phrases that justify the structure; matched against universe keywords (match.ts). */
  terms: string[];
  variants: Variant[];
  /** What people do at its activity spots, and what a group does around its table. */
  activities: Activity[];
  group: { activity: Activity; pose: "sit" | "act" };
  /** Presets it reads well next to (layout prefers these neighbours). */
  near?: string[];
};

/** Zone size in tiles per tier. Layout always reserves the L footprint, so a tier change never moves anything. */
export const SIZES: Record<Tier, [number, number]> = { S: [7, 6], M: [8, 7], L: [10, 8] };

// Design-system tints (globals.css): warm paper, lichen, ochre, glacier, periwinkle, ember, light.
const PAPER: [number, number] = [0xefebe4, 0xe7e2d9];
const WARM: [number, number] = [0xede2d0, 0xe5d8c4];
const OCHRE: [number, number] = [0xf0e8d8, 0xe9dfcc];
const LICHEN: [number, number] = [0xe4e6d6, 0xdcdfcb];
const GLACIER: [number, number] = [0xe1ecee, 0xd8e5e8];
const PERI: [number, number] = [0xd9dcea, 0xd0d4e5];
const EMBER: [number, number] = [0xf0ddd3, 0xe9d3c7];
const STONE: [number, number] = [0xe3e7ec, 0xdbe0e6];

const one = (name: string, floor: [number, number], furniture: FurnitureSlot[]): Variant[] => [{ name, floor, furniture }];

export const PRESETS: Preset[] = [
  {
    id: "lounge",
    name: "Common Lounge",
    terms: ["conversation", "deep talk", "deep conversations", "people", "friends", "meet people", "community",
      "chill", "relax", "hangout", "hanging out", "socialising", "socializing"],
    variants: one("Lounge", PAPER, [
      { kind: "couch", w: 2, place: "edge" },
      { kind: "rug", w: 3, h: 2, place: "center" },
      { kind: "couch", w: 2, place: "edge", from: "M" },
      { kind: "plant", place: "scatter" },
      { kind: "lamp", place: "scatter", from: "M" },
    ]),
    activities: ["chill"],
    group: { activity: "chill", pose: "sit" },
    near: ["cafe", "tabletop"],
  },
  {
    id: "cafe",
    name: "Café & Kitchen",
    terms: ["coffee", "café", "cafe", "cook", "cooking", "bake", "baking", "food", "kitchen", "brunch", "breakfast",
      "diner", "bakery", "chef", "foodie", "restaurant", "restaurants", "supper", "dinner", "eat", "ramen", "sushi",
      "pizza", "taco", "bbq", "tea", "wine", "beer", "cocktail", "cocktails"],
    variants: [
      { name: "Coffee shop", floor: OCHRE, furniture: [
        { kind: "bar", w: 3, place: "edge" }, { kind: "counter", place: "edge" },
        { kind: "table", w: 2, h: 2, place: "center" }, { kind: "plant", place: "scatter", from: "M" },
        { kind: "fridge", place: "edge", from: "L" },
      ] },
      { name: "Home kitchen", floor: GLACIER, furniture: [
        { kind: "fridge", place: "edge" }, { kind: "stove", w: 2, place: "edge" }, { kind: "counter", place: "edge" },
        { kind: "table", w: 2, h: 2, place: "center" }, { kind: "bar", w: 2, place: "edge", from: "M" },
      ] },
      { name: "Bakery", floor: EMBER, furniture: [
        { kind: "counter", w: 2, place: "edge" }, { kind: "stove", w: 2, place: "edge" },
        { kind: "table", w: 2, h: 2, place: "center" }, { kind: "plant", place: "scatter", from: "M" },
      ] },
      { name: "Retro diner", floor: STONE, furniture: [
        { kind: "bar", w: 3, place: "edge" }, { kind: "fridge", place: "edge" },
        { kind: "table", w: 2, h: 2, place: "center" }, { kind: "counter", place: "edge", from: "M" },
      ] },
    ],
    activities: ["cook", "drink"],
    group: { activity: "drink", pose: "sit" },
    near: ["lounge", "hall", "garden"],
  },
  {
    id: "hall",
    name: "Community Hall",
    terms: ["party", "parties", "dinner parties", "dance", "dancing", "club", "clubbing", "nightlife", "festival",
      "rave", "karaoke", "night out", "late night", "late nights", "edm", "techno", "events", "volunteering",
      "volunteer", "hosting", "potluck"],
    variants: [
      { name: "Dance hall", floor: PERI, furniture: [
        { kind: "dj", w: 3, place: "edge" }, { kind: "speaker", place: "edge" },
        { kind: "discofloor", w: 4, h: 3, place: "center" }, { kind: "speaker", place: "edge", from: "M" },
      ] },
      { name: "Banquet hall", floor: WARM, furniture: [
        { kind: "bigtable", w: 2, h: 2, place: "center" }, { kind: "speaker", place: "edge" },
        { kind: "table", w: 2, h: 2, place: "center", from: "L" }, { kind: "plant", place: "scatter" },
      ] },
    ],
    activities: ["dance", "chill"],
    group: { activity: "dance", pose: "act" },
    near: ["cafe", "music"],
  },
  {
    id: "music",
    name: "Music Studio",
    terms: ["music", "live music", "guitar", "piano", "sing", "singing", "songwriting", "band", "concert",
      "concerts", "jazz", "vinyl", "song", "drum", "drums", "dj", "choir", "orchestra"],
    variants: one("Studio", OCHRE, [
      { kind: "amp", place: "edge" }, { kind: "drums", w: 2, place: "edge" },
      { kind: "piano", w: 2, place: "edge", from: "M" }, { kind: "rug", w: 3, h: 2, place: "center" },
      { kind: "speaker", place: "edge", from: "L" },
    ]),
    activities: ["guitar", "drums", "keys"],
    group: { activity: "guitar", pose: "act" },
    near: ["hall", "media"],
  },
  {
    id: "art",
    name: "Art Studio",
    terms: ["art", "arts", "paint", "painting", "draw", "drawing", "sketch", "sketching", "pottery", "ceramics",
      "sculpture", "museum", "museums", "gallery", "galleries", "illustration"],
    variants: one("Studio", WARM, [
      { kind: "easel", place: "edge" }, { kind: "easel", place: "edge" }, { kind: "bigtable", w: 2, h: 2, place: "center" },
      { kind: "easel", place: "edge", from: "M" }, { kind: "plant", place: "scatter", from: "M" },
    ]),
    activities: ["read", "type"],
    group: { activity: "read", pose: "sit" },
    near: ["media", "maker"],
  },
  {
    id: "media",
    name: "Creative Media Studio",
    terms: ["photography", "photo", "film-making", "filmmaking", "video", "videos", "podcast", "podcasts",
      "content", "content creation", "youtube", "design", "graphic design", "animation", "editing"],
    variants: one("Studio", STONE, [
      { kind: "desk", w: 2, place: "edge" }, { kind: "tv", w: 2, place: "edge" },
      { kind: "desk", w: 2, place: "edge", from: "M" }, { kind: "rug", w: 2, h: 2, place: "center" },
    ]),
    activities: ["type"],
    group: { activity: "type", pose: "sit" },
    near: ["art", "cinema"],
  },
  {
    id: "arcade",
    name: "Arcade",
    terms: ["video game", "video games", "gaming", "game", "games", "arcade", "esports", "nintendo", "anime",
      "console", "retro games"],
    variants: one("Arcade", PERI, [
      { kind: "arcade", place: "edge" }, { kind: "arcade", place: "edge" }, { kind: "arcade", place: "edge" },
      { kind: "arcade", place: "edge", from: "M" }, { kind: "arcade", place: "edge", from: "L" },
    ]),
    activities: ["game"],
    group: { activity: "game", pose: "sit" },
    near: ["tabletop", "computer"],
  },
  {
    id: "tabletop",
    name: "Tabletop Game Room",
    terms: ["board game", "board games", "boardgames", "chess", "puzzle", "puzzles", "trivia", "dnd", "d&d",
      "tabletop", "cards", "card games", "role-playing"],
    variants: one("Game room", WARM, [
      { kind: "table", w: 2, h: 2, place: "center" }, { kind: "bookshelf", place: "edge" },
      { kind: "table", w: 2, h: 2, place: "center", from: "L" },
    ]),
    activities: ["game"],
    group: { activity: "game", pose: "sit" },
    near: ["arcade", "cafe", "lounge"],
  },
  {
    id: "cinema",
    name: "Cinema",
    terms: ["film", "films", "movie", "movies", "cinema", "tv", "television", "series", "documentary",
      "documentaries", "sci-fi"],
    variants: one("Screening room", STONE, [
      { kind: "tv", w: 3, place: "edge" }, { kind: "couch", w: 2, place: "center" },
      { kind: "couch", w: 2, place: "center", from: "M" },
    ]),
    activities: ["chill"],
    group: { activity: "chill", pose: "sit" },
    near: ["media", "lounge"],
  },
  {
    id: "library",
    name: "Library",
    terms: ["read", "reading", "book", "books", "writing", "write", "poetry", "literature", "history",
      "philosophy", "languages", "language", "learning", "study"],
    variants: one("Reading room", PAPER, [
      { kind: "bookshelf", w: 2, place: "edge" }, { kind: "desk", w: 2, place: "edge" },
      { kind: "bookshelf", w: 2, place: "edge", from: "M" }, { kind: "rug", w: 3, h: 2, place: "center" },
      { kind: "bigtable", w: 2, h: 2, place: "center", from: "L" },
    ]),
    activities: ["read", "type"],
    group: { activity: "read", pose: "sit" },
    near: ["science", "computer"],
  },
  {
    id: "computer",
    name: "Computer Lab",
    terms: ["code", "coding", "program", "programming", "tech", "startup", "startups", "ai", "hackathon",
      "software", "data", "engineering", "computers"],
    variants: one("Lab", STONE, [
      { kind: "desk", w: 2, place: "edge" }, { kind: "desk", w: 2, place: "edge" },
      { kind: "desk", w: 2, place: "edge", from: "M" }, { kind: "bigtable", w: 2, h: 2, place: "center", from: "M" },
    ]),
    activities: ["type"],
    group: { activity: "type", pose: "sit" },
    near: ["science", "arcade", "maker"],
  },
  {
    id: "science",
    name: "Science Lab",
    terms: ["science", "sciences", "chemistry", "physics", "biology", "astronomy", "space", "research", "math",
      "maths", "mathematics", "experiments", "stem"],
    variants: one("Lab", GLACIER, [
      { kind: "workbench", w: 2, place: "edge" }, { kind: "telescope", place: "edge" },
      { kind: "workbench", w: 2, place: "edge", from: "M" }, { kind: "bigtable", w: 2, h: 2, place: "center", from: "L" },
    ]),
    activities: ["type", "read"],
    group: { activity: "read", pose: "sit" },
    near: ["library", "computer"],
  },
  {
    id: "maker",
    name: "Maker Workshop",
    terms: ["making", "maker", "crafts", "craft", "woodworking", "3d printing", "electronics", "robotics", "diy",
      "knitting", "sewing", "building things", "tinkering"],
    variants: one("Workshop", WARM, [
      { kind: "workbench", w: 2, place: "edge" }, { kind: "workbench", w: 2, place: "edge" },
      { kind: "rack", w: 2, place: "edge", from: "M" }, { kind: "bigtable", w: 2, h: 2, place: "center", from: "M" },
    ]),
    activities: ["type"],
    group: { activity: "type", pose: "sit" },
    near: ["art", "computer"],
  },
  {
    id: "garden",
    name: "Garden & Greenhouse",
    terms: ["garden", "gardening", "plants", "botany", "farming", "flowers", "greenhouse", "houseplants",
      "composting"],
    variants: [
      { name: "Kitchen garden", floor: LICHEN, furniture: [
        { kind: "planter", w: 2, place: "edge" }, { kind: "planter", w: 2, place: "edge" },
        { kind: "flowers", place: "scatter" }, { kind: "bench", w: 2, place: "center", from: "M" },
      ] },
      { name: "Greenhouse", floor: GLACIER, furniture: [
        { kind: "planter", w: 2, place: "edge" }, { kind: "plant", place: "scatter" }, { kind: "plant", place: "scatter" },
        { kind: "table", w: 2, h: 2, place: "center", from: "M" },
      ] },
    ],
    activities: ["chill", "read"],
    group: { activity: "chill", pose: "sit" },
    near: ["wellness", "animals", "cafe"],
  },
  {
    id: "sports",
    name: "Sports Centre",
    terms: ["gym", "fitness", "run", "running", "lift", "lifting", "workout", "sport", "sports", "soccer",
      "football", "basketball", "tennis", "volleyball", "cycling", "bike", "swim", "swimming", "marathon",
      "crossfit", "martial", "boxing", "pickleball", "training", "competition", "competitive", "athletics",
      "athlete"],
    variants: one("Gym & track", EMBER, [
      { kind: "treadmill", place: "edge" }, { kind: "treadmill", place: "edge" }, { kind: "rack", w: 2, place: "edge" },
      { kind: "treadmill", place: "edge", from: "M" }, { kind: "mat", w: 2, h: 2, place: "center", from: "L" },
    ]),
    activities: ["run", "lift"],
    group: { activity: "lift", pose: "act" },
    near: ["climbing", "wellness"],
  },
  {
    id: "climbing",
    name: "Bouldering Wall",
    terms: ["climb", "climbing", "boulder", "bouldering", "rock climbing", "crag"],
    variants: one("Bouldering wall", PAPER, [
      { kind: "climbwall", w: 4, place: "edge" }, { kind: "mat", w: 4, h: 2, place: "center" },
      { kind: "climbwall", w: 3, place: "edge", from: "M" }, { kind: "boulder", w: 2, h: 2, place: "center", from: "L" },
    ]),
    activities: ["climb"],
    group: { activity: "climb", pose: "act" },
    near: ["sports", "explorer"],
  },
  {
    id: "wellness",
    name: "Wellness Studio",
    terms: ["yoga", "pilates", "meditation", "mindfulness", "wellness", "spa", "self-care", "journaling",
      "slow mornings", "breathwork"],
    variants: one("Studio", LICHEN, [
      { kind: "mat", w: 2, h: 2, place: "center" }, { kind: "plant", place: "scatter" },
      { kind: "plant", place: "scatter", from: "M" }, { kind: "couch", place: "edge", from: "L" },
    ]),
    activities: ["chill", "lift"],
    group: { activity: "chill", pose: "sit" },
    near: ["garden", "sports"],
  },
  {
    id: "explorer",
    name: "Explorer's Room",
    terms: ["hike", "hiking", "trail", "trails", "camp", "camping", "outdoor", "outdoors", "nature", "surf",
      "surfing", "ski", "skiing", "snowboard", "kayak", "backpacking", "mountain", "mountains", "national park",
      "travel", "travelling", "traveling", "adventure", "adventures", "road trips", "geography"],
    variants: one("Basecamp", LICHEN, [
      { kind: "tent", w: 2, h: 2, place: "center" }, { kind: "bench", w: 2, place: "edge" },
      { kind: "telescope", place: "edge", from: "M" }, { kind: "tree", place: "scatter", from: "M" },
    ]),
    activities: ["chill", "read"],
    group: { activity: "chill", pose: "sit" },
    near: ["climbing", "animals", "garden"],
  },
  {
    id: "animals",
    name: "Animal Sanctuary",
    terms: ["animals", "animal", "wildlife", "pets", "pet", "dogs", "dog", "cats", "cat", "birds",
      "birdwatching", "horses", "conservation", "zoo"],
    variants: one("Sanctuary", LICHEN, [
      { kind: "pen", w: 3, h: 2, place: "center" }, { kind: "bench", w: 2, place: "edge" },
      { kind: "tree", place: "scatter", from: "M" },
    ]),
    activities: ["chill"],
    group: { activity: "chill", pose: "sit" },
    near: ["explorer", "garden"],
  },
];

export const PRESET_BY_ID: Record<string, Preset> = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

/** Always present, whatever the keywords. */
export const SHARED = {
  /** Where people arrive, and where they wait until scored. */
  spawn: { id: "spawn", name: "Spawn Plaza", size: [7, 6] as [number, number], floor: PAPER },
  /** The heart of the campus: paths meet here, pairs meet here when no structure fits, unplaced people gather. */
  square: { id: "square", name: "Meeting Square", size: [10, 10] as [number, number], floor: [0xece7de, 0xe3ddd2] as [number, number] },
};
