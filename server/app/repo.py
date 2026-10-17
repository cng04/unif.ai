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


async def merge_raw_sources(conn: AsyncConnection, user_id: UUID, patch: dict) -> None:
    await conn.execute(
        "UPDATE agent_profiles SET raw_sources = raw_sources || %s, updated_at = now() WHERE user_id = %s",
        (Jsonb(patch), user_id),
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
