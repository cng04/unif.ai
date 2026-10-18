from uuid import UUID

from fastapi import HTTPException
from psycopg import AsyncConnection
from psycopg.types.json import Jsonb
from unifai_agent import AgentProfile


async def get_user(conn: AsyncConnection, user_id: UUID) -> dict:
    row = await (await conn.execute("SELECT * FROM users WHERE id = %s", (user_id,))).fetchone()
    if row is None:
        raise HTTPException(404, "user not found")
    return row


async def get_universe(conn: AsyncConnection, universe_id: UUID) -> dict:
    row = await (await conn.execute("SELECT * FROM universes WHERE id = %s", (universe_id,))).fetchone()
    if row is None:
        raise HTTPException(404, "universe not found")
    return row


async def set_universe_status(conn: AsyncConnection, universe_id: UUID, status: str) -> None:
    await conn.execute("UPDATE universes SET status = %s WHERE id = %s", (status, universe_id))
    await conn.commit()


async def claim_matching(conn: AsyncConnection, universe_id: UUID) -> bool:
    """Atomically move a universe to 'matching'. False if a run is already in progress."""
    cur = await conn.execute(
        "UPDATE universes SET status = 'matching' WHERE id = %s AND status <> 'matching' RETURNING id", (universe_id,)
    )
    claimed = await cur.fetchone() is not None
    await conn.commit()
    return claimed


async def release_matching(conn: AsyncConnection, universe_id: UUID) -> bool:
    """Move a universe from 'matching' back to 'onboarding'. False if it wasn't matching."""
    cur = await conn.execute(
        "UPDATE universes SET status = 'onboarding' WHERE id = %s AND status = 'matching' RETURNING id", (universe_id,)
    )
    released = await cur.fetchone() is not None
    await conn.commit()
    return released


async def merge_raw_sources(conn: AsyncConnection, user_id: UUID, patch: dict) -> None:
    await conn.execute(
        "UPDATE agent_profiles SET raw_sources = raw_sources || %s, updated_at = now() WHERE user_id = %s",
        (Jsonb(patch), user_id),
    )


async def add_social_links(conn: AsyncConnection, user_id: UUID, links: dict[str, str]) -> dict[str, str]:
    """Merge links into the user's social_links (new values win) and return the merged set."""
    row = await (
        await conn.execute(
            "UPDATE users SET social_links = social_links || %s WHERE id = %s RETURNING social_links",
            (Jsonb(links), user_id),
        )
    ).fetchone()
    if row is None:
        raise HTTPException(404, "user not found")
    return row["social_links"]


async def merge_scraped(conn: AsyncConnection, user_id: UUID, scraped: dict[str, str]) -> None:
    """Add per-platform scrape summaries without dropping platforms scraped earlier."""
    await conn.execute(
        """
        UPDATE agent_profiles
        SET raw_sources = jsonb_set(raw_sources, '{scraped}', COALESCE(raw_sources->'scraped', '{}'::jsonb) || %s),
            updated_at = now()
        WHERE user_id = %s
        """,
        (Jsonb(scraped), user_id),
    )


async def load_profiles(conn: AsyncConnection, universe_id: UUID) -> list[AgentProfile]:
    rows = await (
        await conn.execute(
            """
            SELECT ap.user_id, ap.public, ap.private, ap.temperature
            FROM agent_profiles ap JOIN users u ON u.id = ap.user_id
            WHERE u.universe_id = %s
            ORDER BY u.created_at
            """,
            (universe_id,),
        )
    ).fetchall()
    return [
        AgentProfile(
            user_id=str(r["user_id"]), public=r["public"], private=r["private"], temperature=r["temperature"]
        )
        for r in rows
    ]


async def load_onboarding_documents(conn: AsyncConnection, profiles: list[AgentProfile]) -> list[str]:
    """One text per profile (same order): the built profile plus the raw interview transcript."""
    rows = await (
        await conn.execute(
            "SELECT user_id, role, content FROM onboarding_messages WHERE user_id = ANY(%s::uuid[]) ORDER BY id",
            ([p.user_id for p in profiles],),
        )
    ).fetchall()
    transcripts: dict[str, list[str]] = {}
    for r in rows:
        transcripts.setdefault(str(r["user_id"]), []).append(f"{r['role']}: {r['content']}")
    return [
        f"PROFILE:\n{p.model_dump_json(exclude={'user_id', 'temperature'})}\n\n"
        f"INTERVIEW:\n" + ("\n".join(transcripts.get(p.user_id, [])) or "(none)")
        for p in profiles
    ]

# Onboarding status isn't stored; it's derived from what exists for the user.
USER_STATUS_SQL = """
    CASE
        WHEN ap.private <> '{}'::jsonb THEN 'complete'
        WHEN EXISTS (SELECT 1 FROM onboarding_messages om WHERE om.user_id = u.id) THEN 'chatting'
        ELSE 'invited'
    END
"""

USER_SORTS = {
    "joined": "u.created_at",
    "name": "lower(u.full_name)",
    "phone": "u.phone",
    "status": f"array_position(ARRAY['invited', 'chatting', 'complete'], {USER_STATUS_SQL})",
}


async def list_users_with_status(
    conn: AsyncConnection, universe_id: UUID, sort: str = "joined", desc: bool = False
) -> list[dict]:
    order = USER_SORTS.get(sort, USER_SORTS["joined"])  # whitelisted, never raw input
    cur = await conn.execute(
        f"""
        SELECT u.*, {USER_STATUS_SQL} AS status
        FROM users u LEFT JOIN agent_profiles ap ON ap.user_id = u.id
        WHERE u.universe_id = %s
        ORDER BY {order} {"DESC" if desc else "ASC"}, u.id
        """,
        (universe_id,),
    )
    return await cur.fetchall()


async def find_user_by_phone(conn: AsyncConnection, universe_id: UUID, phone: str) -> dict | None:
    cur = await conn.execute("SELECT * FROM users WHERE universe_id = %s AND phone = %s", (universe_id, phone))
    return await cur.fetchone()


async def create_user(
    conn: AsyncConnection,
    universe_id: UUID,
    full_name: str,
    email: str | None = None,
    phone: str | None = None,
    social_links: dict | None = None,
) -> dict:
    user = await (
        await conn.execute(
            """
            INSERT INTO users (universe_id, full_name, email, phone, social_links)
            VALUES (%s, %s, %s, %s, %s) RETURNING *
            """,
            (universe_id, full_name, email, phone, Jsonb(social_links or {})),
        )
    ).fetchone()
    await conn.execute(
        "INSERT INTO agent_profiles (user_id, public) VALUES (%s, %s)", (user["id"], Jsonb({"name": full_name}))
    )
    return user


async def load_group(conn: AsyncConnection, group: dict) -> dict:
    """A `groups` row plus its members and events, shaped like `schemas.Group`."""
    members = await (
        await conn.execute(
            """
            SELECT u.id AS user_id, u.full_name FROM group_members gm
            JOIN users u ON u.id = gm.user_id WHERE gm.group_id = %s
            """,
            (group["id"],),
        )
    ).fetchall()
    events = await (
        await conn.execute(
            """
            SELECT name, url, venue, starts_at, time_label, price, reason, source FROM events
            WHERE group_id = %s ORDER BY rank NULLS LAST, starts_at
            """,
            (group["id"],),
        )
    ).fetchall()
    return {
        "id": group["id"],
        "group_score": group["group_score"],
        "rationale": group["rationale"],
        "plans_status": group["plans_status"],
        "plans_summary": group["plans_summary"],
        "members": members,
        "events": events,
    }


async def is_onboarded(conn: AsyncConnection, user_id: UUID) -> bool:
    """True once the onboarding bot has saved the private profile (same rule as USER_STATUS_SQL's 'complete')."""
    row = await (
        await conn.execute("SELECT private <> '{}'::jsonb AS done FROM agent_profiles WHERE user_id = %s", (user_id,))
    ).fetchone()
    return bool(row and row["done"])
