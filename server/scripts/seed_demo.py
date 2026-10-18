"""Seed a 'UI Demo' universe that looks like matching already ran, for working on the web app.

    uv run python -m scripts.seed_demo [--client http://localhost:3001]

Re-running replaces the previous demo universe (same ids, so links keep working) (invite code 'ui-demo'); deleting it cascades to everything here.
Uses DATABASE_URL from the environment or server/.env. Prints a login link per person.
"""

import argparse
import random
from datetime import datetime, timedelta, timezone
from uuid import NAMESPACE_URL, uuid5

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.config import get_settings

INVITE = "ui-demo"
KEYWORDS = ["climbing", "long breakfasts", "board games", "live music", "hiking", "cooking", "film", "running"]
NAMES = ["Cyn", "Maya", "Jonah", "Priya", "Theo", "Sam", "Lena", "Ari", "Noor", "Felix", "Ines", "Kai",
         "Rosa", "Dev", "June", "Omar", "Wren", "Hugo", "Tess", "Ezra", "Lila", "Bo", "Mina", "Abe"]
GROUP = ["Cyn", "Maya", "Jonah", "Priya", "Theo"]
# Cyn's judged pairs: (other, vibe 1-10, logistics, dealbreaker flags)
CYN_PAIRS = [("Maya", 9.1, "strong", []), ("Jonah", 8.6, "strong", []), ("Priya", 8.2, "strong", []),
             ("Theo", 7.9, "workable", []), ("Sam", 6.4, "strong", []), ("Lena", 5.8, "workable", []),
             ("Ari", 4.0, "incompatible", ["late nights"])]
PROFILES = {
    "Cyn": ("A low-key crew for bouldering and slow weekend mornings.", ["climbing", "coffee", "film"]),
    "Maya": ("Friends who text 'climbing sat?' and actually mean it.", ["climbing", "brunch", "planning trips"]),
}
CHATS = {
    "Maya": [
        ("Maya", "Maya climbs at Mission Cliffs most Saturdays. She'd rather chat between problems than chase grades."),
        ("Cyn", "Same gym, same energy. Cyn boulders 2–3× a week and isn't competitive about it at all."),
        ("Maya", "Good. Would they be up for a long breakfast after? That's half the point for her."),
        ("Cyn", "Absolutely — breakfast after is the best part."),
        ("Maya", "She tends to be the planner. She'd likely set it up if someone else brings the easygoing."),
        ("Cyn", "That fits Cyn. Happy to go along with a good plan."),
    ],
    "Jonah": [
        ("Jonah", "Jonah hosts a Sunday supper club, usually 6–8 people. He likes cooking for a crowd."),
        ("Cyn", "Cyn would love that, as long as it's more conversation than party."),
        ("Jonah", "It's mostly people lingering over dessert. Nobody's dancing on tables."),
        ("Cyn", "Then it's a yes. She'd bring something from the bakery near the gym."),
    ],
    "Ari": [
        ("Ari", "Ari's happiest out late — shows that start at 11, then a diner after."),
        ("Cyn", "Cyn's more of a 9am person. Late nights aren't really her thing."),
        ("Ari", "Fair. Weekends might not overlap much then."),
    ],
}
INTERVIEW = [
    ("assistant", "Hi Cyn! I'm your agent. What do you usually do on a free Saturday?"),
    ("user", "Bouldering in the morning, then a long breakfast if I can find people."),
    ("assistant", "Love that. Are you more into chatty groups or quieter ones?"),
    ("user", "Smaller, low-key. Not into clubbing at all."),
]


def seed(conn: psycopg.Connection) -> dict[str, str]:
    rng = random.Random(7)
    now = datetime.now(timezone.utc)
    conn.execute("DELETE FROM universes WHERE invite_code = %s", (INVITE,))
    universe = uuid5(NAMESPACE_URL, "unif.ai/ui-demo")
    conn.execute(
        "INSERT INTO universes (id, name, admin_email, invite_code, status) VALUES (%s, 'UI Demo', 'demo@unif.ai', %s, 'matched')",
        (universe, INVITE),
    )

    # Stable ids, so login links survive a re-seed.
    ids = {n: uuid5(NAMESPACE_URL, f"unif.ai/ui-demo/{n}") for n in NAMES}
    for i, name in enumerate(NAMES):
        looking_for, interests = PROFILES.get(name, (f"People to do {rng.choice(KEYWORDS)} with on weekends.", rng.sample(KEYWORDS, 3)))
        conn.execute(
            "INSERT INTO users (id, universe_id, full_name, created_at) VALUES (%s, %s, %s, %s)",
            (ids[name], universe, name, now - timedelta(minutes=len(NAMES) - i)),
        )
        conn.execute(
            "INSERT INTO agent_profiles (user_id, public, private, availability) VALUES (%s, %s, %s, %s)",
            (
                ids[name],
                Jsonb({"name": name, "interests": interests, "vibe": "warm, a bit dry", "looking_for": looking_for}),
                Jsonb({"dealbreakers": ["flaky plans"], "values": ["reliability", "curiosity"], "energy": "small groups",
                       "logistics": {"area": "Mission", "budget": "$$", "free": ["weekend_daytime"]}}),
                ["weekend_daytime"],
            ),
        )

    keyword_ids = {}
    for k in KEYWORDS:
        keyword_ids[k] = conn.execute(
            "INSERT INTO keywords (universe_id, name) VALUES (%s, %s) RETURNING id", (universe, k)
        ).fetchone()["id"]
    for name in NAMES:
        for k in KEYWORDS:
            score = rng.random()
            if name in GROUP and k in ("climbing", "long breakfasts"):
                score = 0.8 + rng.random() * 0.2
            conn.execute(
                "INSERT INTO keyword_scores (user_id, keyword_id, score) VALUES (%s, %s, %s)",
                (ids[name], keyword_ids[k], round(score, 2)),
            )

    def pair(a: str, b: str, vibe: float, fit: str, flags: list[str]):
        x, y = sorted([ids[a], ids[b]])
        return conn.execute(
            """
            INSERT INTO pairs (universe_id, user_a, user_b, vibe_score, logistics_fit, dealbreaker_flags, judge_rationale)
            VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING RETURNING id
            """,
            (universe, x, y, vibe, fit, Jsonb(flags),
             f"Chemistry {vibe:.1f}/10; logistics {fit}; dealbreakers: {', '.join(flags) or 'none'}."),
        ).fetchone()

    pair_ids = {other: pair("Cyn", other, vibe, fit, flags)["id"] for other, vibe, fit, flags in CYN_PAIRS}
    for a, b in [("Maya", "Jonah"), ("Jonah", "Theo"), ("Theo", "Priya"), ("Priya", "Maya"), ("Maya", "Theo")]:
        pair(a, b, round(7 + rng.random() * 2, 1), "strong", [])
    rest = NAMES[5:]
    for _ in range(30):  # background pairs among everyone else
        a, b = rng.sample(rest, 2)
        pair(a, b, round(4 + rng.random() * 5, 1), "workable", [])

    for other, lines in CHATS.items():
        start = now - timedelta(days=1, hours=rng.randint(0, 5))
        for i, (speaker, text) in enumerate(lines):
            conn.execute(
                "INSERT INTO pair_messages (pair_id, speaker_id, kind, content, created_at) VALUES (%s, %s, 'message', %s, %s)",
                (pair_ids[other], ids[speaker], text, start + timedelta(seconds=150 * i)),
            )
        conn.execute(
            "INSERT INTO pair_messages (pair_id, speaker_id, kind, content) VALUES (%s, %s, 'note', 'private note: never shown')",
            (pair_ids[other], ids["Cyn"]),
        )

    group = conn.execute(
        """
        INSERT INTO groups (universe_id, group_score, rationale, plans_status, plans_summary)
        VALUES (%s, 0.84, 'Climbers who like a slow breakfast after.', 'ready',
                'Picked for when you''re all free (weekend daytimes), at $$ or under.')
        RETURNING id
        """,
        (universe,),
    ).fetchone()["id"]
    for name in GROUP:
        conn.execute("INSERT INTO group_members (group_id, user_id) VALUES (%s, %s)", (group, ids[name]))
    plans = [
        ("Bouldering + breakfast", "Mission Cliffs", "$$", "Four of you climb, and everyone is free weekend mornings.", "meetup"),
        ("Sunset walk, Bernal Hill", "Bernal Heights Park", "free", "An easy way for all of you to meet first.", "local guide"),
        ("Taco crawl, 24th St", "24th St", "$$", "Three of you listed tacos.", "eventbrite"),
    ]
    for rank, (name, venue, price, reason, source) in enumerate(plans, 1):
        starts_at = now + timedelta(days=7 + rank)
        conn.execute(
            """
            INSERT INTO events (group_id, source, name, venue, starts_at, time_label, price, reason, rank)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (group, source, name, venue, starts_at, f"{starts_at:%a}".lower() + f" {starts_at.day} · {starts_at:%H:%M}", price, reason, rank),
        )
    for role, text in INTERVIEW:
        conn.execute(
            "INSERT INTO onboarding_messages (user_id, role, content) VALUES (%s, %s, %s)", (ids["Cyn"], role, text)
        )
    return {n: str(i) for n, i in ids.items()}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--client", default=get_settings().client_url)
    args = parser.parse_args()
    with psycopg.connect(get_settings().database_url, row_factory=dict_row) as conn:
        ids = seed(conn)
    print(f"Seeded 'UI Demo' ({len(ids)} people). Cyn has a group, 7 judged pairs, and 3 recorded chats:\n")
    print(f"  {args.client}/u/{ids['Cyn']}\n")
    print("Others (no chats of their own beyond Cyn's): " + ", ".join(f"{n}={ids[n]}" for n in GROUP[1:]))


if __name__ == "__main__":
    main()
