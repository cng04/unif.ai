"""Seed a synthetic demo universe for testing the World at scale: fake people, keyword scores, judged pairs,
groups, and optionally a run in progress. No model calls, no real data; the universe is flagged `is_demo`.

    uv run python -m scripts.seed_synthetic --people 50 --stage matched
    uv run python -m scripts.seed_synthetic --people 120 --stage matching --seed 7

--stage matched    finished run: scores, judged pairs with transcripts, groups
--stage matching   run in progress: scores, some judged pairs, a few chats `running` right now (stage 'chats')
--stage onboarding people joined, nobody scored yet

Re-running replaces the previous synthetic universe of the same name (same ids, so links keep working).
Uses DATABASE_URL from the environment or server/.env.
"""

import argparse
import random
from datetime import datetime, timedelta, timezone
from uuid import NAMESPACE_URL, uuid5

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.config import get_settings

# Themes with keywords that the World's presets recognise; each universe uses a subset.
THEMES = {
    "climbing": ["climbing", "bouldering"],
    "cooking": ["cooking", "baking", "brunch"],
    "music": ["live music", "guitar"],
    "games": ["board games", "chess"],
    "outdoors": ["hiking", "camping"],
    "art": ["painting", "museums"],
    "tech": ["coding", "startups"],
    "film": ["film", "movies"],
    "fitness": ["running", "yoga"],
    "reading": ["reading", "poetry"],
}
FIRST = ["Ada", "Bao", "Cleo", "Dara", "Eli", "Fay", "Gus", "Hana", "Ivo", "Jun", "Kit", "Lia", "Mo", "Nia", "Oz", "Pia", "Quin", "Rae", "Sol", "Tai"]
LINES = [
    "Hi! Synthetic test chat: what do you do on a free weekend?",
    "Mostly {a}, and I'd happily do more of it with people. You?",
    "{b} for me. Maybe we could combine them sometime.",
    "Sounds good. This conversation is generated test data.",
]


def seed(conn: psycopg.Connection, people: int, stage: str, rnd: random.Random) -> None:
    universe = uuid5(NAMESPACE_URL, f"unifai-synthetic-{people}")
    conn.execute("DELETE FROM universes WHERE id = %s", (universe,))
    conn.execute(
        "INSERT INTO universes (id, name, admin_email, invite_code, status, is_demo, matching_stage, matching_stage_at)"
        " VALUES (%s, %s, 'synthetic@unif.ai', %s, %s, true, %s, now())",
        (universe, f"Synthetic · {people} people", f"synthetic-{people}",
         {"matched": "matched", "matching": "matching", "onboarding": "onboarding"}[stage],
         "chats" if stage == "matching" else None),
    )
    themes = list(THEMES)
    weights = [rnd.uniform(0.4, 1.6) for _ in themes]  # uneven crowds, so structures differ in size
    keyword_names = [k for t in themes for k in THEMES[t]]
    keyword_ids = {}
    if stage != "onboarding":
        for name in keyword_names:
            keyword_ids[name] = conn.execute(
                "INSERT INTO keywords (universe_id, name) VALUES (%s, %s) RETURNING id", (universe, name)
            ).fetchone()["id"]

    ids: list[str] = []
    primary: dict[str, str] = {}
    now = datetime.now(timezone.utc)
    for n in range(people):
        uid = str(uuid5(universe, f"user-{n}"))
        name = f"{FIRST[n % len(FIRST)]} {n // len(FIRST) + 1}" if n >= len(FIRST) else FIRST[n]
        first, second = rnd.choices(themes, weights, k=2)
        mine = {first: 1.0, second: 0.8}
        primary[uid] = first
        conn.execute(
            "INSERT INTO users (id, universe_id, full_name, created_at) VALUES (%s, %s, %s, %s)",
            (uid, universe, name, now - timedelta(minutes=people - n)),
        )
        conn.execute(
            "INSERT INTO agent_profiles (user_id, public, private, availability) VALUES (%s, %s, %s, %s)",
            (uid, Jsonb({"name": name, "interests": THEMES[first][:1] + THEMES[second][:1],
                         "looking_for": f"Synthetic test profile: into {THEMES[first][0]}.", "vibe": "synthetic"}),
             Jsonb({"values": ["synthetic"]}), ["weekend_daytime"]),
        )
        ids.append(uid)
        if stage != "onboarding":
            for theme, kws in THEMES.items():
                for kw in kws:
                    score = rnd.uniform(0.75, 0.95) * mine[theme] if theme in mine else rnd.uniform(0.05, 0.4)
                    conn.execute(
                        "INSERT INTO keyword_scores (user_id, keyword_id, score) VALUES (%s, %s, %s)",
                        (uid, keyword_ids[kw], round(min(score, 1.0), 3)),
                    )

    if stage == "onboarding":
        return

    def pair(a: str, b: str, running: bool) -> None:
        a, b = sorted([a, b])
        vibe = round(rnd.uniform(5.5, 9.5), 1)
        row = conn.execute(
            "INSERT INTO pairs (universe_id, user_a, user_b, status, vibe_score, logistics_fit, judge_rationale,"
            " completed_at) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING RETURNING id",
            (universe, a, b, "running" if running else "complete", None if running else vibe,
             None if running else rnd.choice(["strong", "workable"]),
             None if running else "Synthetic verdict: shared interests, easy logistics.",
             None if running else now - timedelta(minutes=rnd.randint(1, 600))),
        ).fetchone()
        if row and not running:
            for i, line in enumerate(LINES):
                conn.execute(
                    "INSERT INTO pair_messages (pair_id, speaker_id, kind, content) VALUES (%s, %s, 'message', %s)",
                    (row["id"], a if i % 2 == 0 else b, line.format(a="their thing", b="mine")),
                )

    by_theme: dict[str, list[str]] = {}
    for uid in ids:
        by_theme.setdefault(primary[uid], []).append(uid)
    judged = 0
    for members in by_theme.values():
        for i, uid in enumerate(members):
            for other in members[i + 1 : i + 3]:
                pair(uid, other, running=False)
                judged += 1
    if stage == "matching":
        live = rnd.sample(ids, min(6, len(ids) - len(ids) % 2))
        for i in range(0, len(live) - 1, 2):
            pair(live[i], live[i + 1], running=True)
        return

    for theme, members in by_theme.items():
        for chunk_start in range(0, len(members) - 3, 5):
            chunk = members[chunk_start : chunk_start + 5]
            if len(chunk) < 4:
                continue
            gid = conn.execute(
                "INSERT INTO groups (universe_id, group_score, rationale, plans_status) VALUES (%s, %s, %s, 'none') RETURNING id",
                (universe, round(rnd.uniform(6.5, 9.2), 1), f"Synthetic group around {THEMES[theme][0]}."),
            ).fetchone()["id"]
            for uid in chunk:
                conn.execute("INSERT INTO group_members (group_id, user_id) VALUES (%s, %s)", (gid, uid))
    print(f"seeded {people} people, {judged} judged pairs, universe {universe}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--people", type=int, default=50)
    parser.add_argument("--stage", choices=["matched", "matching", "onboarding"], default="matched")
    parser.add_argument("--seed", type=int, default=1)
    args = parser.parse_args()
    with psycopg.connect(get_settings().database_url, row_factory=dict_row) as conn:
        seed(conn, args.people, args.stage, random.Random(args.seed))
        conn.commit()
    print(f"World: /admin/universes/<id>/world (universe is flagged demo; list it with ?mode=demo)")


if __name__ == "__main__":
    main()
