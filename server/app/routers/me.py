"""One person's view of matching, for the mobile web app.

Everything here is scoped to the requesting user: their own pairs and group by name, everyone else only as
anonymous ids. Judge rationales and dealbreaker flags stay server-side, since they quote private profiles.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from psycopg import AsyncConnection

from app import repo
from app.db import get_conn
from app.schemas import Connections, Group, PairDetail

router = APIRouter(prefix="/users/{user_id}", tags=["me"])

# A pair the judge flagged: any dealbreaker hit or incompatible logistics (mirrors `Verdict.has_conflict`).
CONFLICT_SQL = "(jsonb_array_length(p.dealbreaker_flags) > 0 OR p.logistics_fit = 'incompatible')"


async def group_for(conn: AsyncConnection, user_id: UUID) -> dict | None:
    row = await (
        await conn.execute(
            "SELECT g.* FROM groups g JOIN group_members gm ON gm.group_id = g.id WHERE gm.user_id = %s",
            (user_id,),
        )
    ).fetchone()
    return await repo.load_group(conn, row) if row else None


@router.get("/connections", response_model=Connections)
async def get_connections(user_id: UUID, conn: AsyncConnection = Depends(get_conn)):
    user = await repo.get_user(conn, user_id)
    universe = await repo.get_universe(conn, user["universe_id"])
    group = await group_for(conn, user_id)
    group_ids = {m["user_id"] for m in group["members"]} if group else set()

    others = await (
        await conn.execute("SELECT id FROM users WHERE universe_id = %s AND id <> %s", (universe["id"], user_id))
    ).fetchall()
    mine = await (
        await conn.execute(
            f"""
            SELECT p.id AS pair_id, u.id AS user_id, u.full_name, p.vibe_score, p.logistics_fit,
                   {CONFLICT_SQL} AS conflict
            FROM pairs p
            JOIN users u ON u.id = CASE WHEN p.user_a = %(me)s THEN p.user_b ELSE p.user_a END
            WHERE p.universe_id = %(universe)s AND %(me)s IN (p.user_a, p.user_b)
            ORDER BY p.vibe_score DESC NULLS LAST
            """,
            {"me": user_id, "universe": universe["id"]},
        )
    ).fetchall()
    edges = await (
        await conn.execute(
            "SELECT user_a AS a, user_b AS b, vibe_score FROM pairs WHERE universe_id = %(universe)s "
            "AND %(me)s NOT IN (user_a, user_b)",
            {"me": user_id, "universe": universe["id"]},
        )
    ).fetchall()
    return Connections(
        user={"user_id": user["id"], "full_name": user["full_name"]},
        universe=universe,
        others=[r["id"] for r in others],
        connections=[{**r, "in_group": r["user_id"] in group_ids} for r in mine],
        group=Group(**group) if group else None,
        edges=edges,
    )


@router.get("/pairs/{pair_id}", response_model=PairDetail)
async def get_pair(user_id: UUID, pair_id: UUID, conn: AsyncConnection = Depends(get_conn)):
    pair = await (
        await conn.execute(
            f"SELECT p.*, {CONFLICT_SQL} AS conflict FROM pairs p WHERE p.id = %s AND %s IN (p.user_a, p.user_b)",
            (pair_id, user_id),
        )
    ).fetchone()
    if pair is None:
        raise HTTPException(404, "pair not found")
    other_id = pair["user_b"] if pair["user_a"] == user_id else pair["user_a"]
    other = await repo.get_user(conn, other_id)
    public = await (
        await conn.execute("SELECT public FROM agent_profiles WHERE user_id = %s", (other_id,))
    ).fetchone()
    # Keywords both people score high on, strongest first: the "why two people matched" query from AGENTS.md.
    shared = await (
        await conn.execute(
            """
            SELECT k.name FROM keyword_scores a
            JOIN keyword_scores b USING (keyword_id)
            JOIN keywords k ON k.id = keyword_id
            WHERE a.user_id = %s AND b.user_id = %s AND a.score > 0.5 AND b.score > 0.5
              AND NOT a.dealbreaker AND NOT b.dealbreaker
            ORDER BY a.score * b.score DESC LIMIT 3
            """,
            (user_id, other_id),
        )
    ).fetchall()
    messages = await (
        await conn.execute(
            "SELECT speaker_id, content, created_at FROM pair_messages WHERE pair_id = %s AND kind = 'message' "
            "ORDER BY id",
            (pair_id,),
        )
    ).fetchall()
    group = await group_for(conn, user_id)
    return PairDetail(
        id=pair["id"],
        other={"user_id": other_id, "full_name": other["full_name"]},
        vibe_score=pair["vibe_score"],
        logistics_fit=pair["logistics_fit"],
        conflict=pair["conflict"],
        in_group=bool(group) and any(m["user_id"] == other_id for m in group["members"]),
        shared_keywords=[r["name"] for r in shared],
        looking_for=(public["public"] if public else {}).get("looking_for", ""),
        messages=messages,
    )
