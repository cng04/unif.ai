from uuid import UUID

import numpy as np
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from psycopg import AsyncConnection

from app import repo
from app.config import get_settings
from app.db import get_conn
from app.matching.pipeline import run_matching
from app.matching.projection import project_3d
from app.schemas import EventOut, GraphPoint, Group, GroupMember, Pair

router = APIRouter(tags=["matching"])


@router.post("/universes/{universe_id}/matching", status_code=202)
async def start_matching(universe_id: UUID, background: BackgroundTasks, conn: AsyncConnection = Depends(get_conn)):
    universe = await repo.get_universe(conn, universe_id)
    if universe["status"] == "matching":
        raise HTTPException(409, "matching already in progress")
    if not get_settings().typesafe_api_key:
        raise HTTPException(503, "TYPESAFE_API_KEY is not set; matching needs Jev")
    background.add_task(run_matching, universe_id)
    return {"status": "matching"}


@router.get("/universes/{universe_id}/graph", response_model=list[GraphPoint])
async def get_graph(universe_id: UUID, conn: AsyncConnection = Depends(get_conn)):
    """User positions for the 3D playground: the k-dimensional keyword scores flattened to 3D."""
    rows = await (
        await conn.execute(
            """
            SELECT u.id AS user_id, u.full_name AS name, gm.group_id,
                   array_agg(s.score ORDER BY s.keyword_id) AS scores
            FROM users u
            JOIN keyword_scores s ON s.user_id = u.id
            LEFT JOIN group_members gm ON gm.user_id = u.id
            WHERE u.universe_id = %s
            GROUP BY u.id, gm.group_id
            """,
            (universe_id,),
        )
    ).fetchall()
    if not rows:
        return []
    coords = project_3d(np.array([r["scores"] for r in rows], dtype=float))
    return [
        GraphPoint(user_id=r["user_id"], name=r["name"], group_id=r["group_id"], x=x, y=y, z=z)
        for r, (x, y, z) in zip(rows, coords.tolist())
    ]


@router.get("/universes/{universe_id}/pairs", response_model=list[Pair])
async def list_pairs(universe_id: UUID, conn: AsyncConnection = Depends(get_conn)):
    cur = await conn.execute("SELECT * FROM pairs WHERE universe_id = %s ORDER BY vibe_score DESC", (universe_id,))
    return await cur.fetchall()


@router.get("/pairs/{pair_id}/messages")
async def get_pair_messages(pair_id: UUID, conn: AsyncConnection = Depends(get_conn)) -> list[dict]:
    cur = await conn.execute(
        "SELECT speaker_id, kind, content, created_at FROM pair_messages WHERE pair_id = %s ORDER BY id", (pair_id,)
    )
    return await cur.fetchall()


@router.get("/universes/{universe_id}/groups", response_model=list[Group])
async def list_groups(universe_id: UUID, conn: AsyncConnection = Depends(get_conn)):
    groups = await (
        await conn.execute("SELECT * FROM groups WHERE universe_id = %s ORDER BY created_at", (universe_id,))
    ).fetchall()
    result = []
    for g in groups:
        members = await (
            await conn.execute(
                """
                SELECT u.id AS user_id, u.full_name FROM group_members gm
                JOIN users u ON u.id = gm.user_id WHERE gm.group_id = %s
                """,
                (g["id"],),
            )
        ).fetchall()
        events = await (
            await conn.execute("SELECT name, url, venue, starts_at FROM events WHERE group_id = %s", (g["id"],))
        ).fetchall()
        result.append(
            Group(
                id=g["id"],
                group_score=g["group_score"],
                rationale=g["rationale"],
                members=[GroupMember(**m) for m in members],
                events=[EventOut(**e) for e in events],
            )
        )
    return result
