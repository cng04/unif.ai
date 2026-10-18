"""JSON for the admin screens in the web app (client/src/app/admin). Same ADMIN_PASSWORD gate as the HTML admin.

Everything is derived from what matching stores; there is no separate pipeline-progress or approval state.
"""

import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from psycopg import AsyncConnection
from pydantic import BaseModel

from app import repo
from app.db import get_conn
from app.matching import runs
from app.routers.web import invite_url, require_admin

router = APIRouter(prefix="/admin/api", dependencies=[Depends(require_admin)], tags=["admin"])

CONFLICT = "(jsonb_array_length(p.dealbreaker_flags) > 0 OR p.logistics_fit = 'incompatible')"
STRONG_VIBE = 7


class UniverseCreate(BaseModel):
    name: str
    admin_email: str


class UniverseRename(BaseModel):
    name: str


def universe_out(row: dict) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "status": row["status"],
        "invite_code": row["invite_code"],
        "invite_url": invite_url(row["invite_code"]),
        "created_at": row["created_at"],
    }


async def group_labels(conn: AsyncConnection, universe_id: UUID) -> dict[UUID, str]:
    """Short, stable-per-run names for groups ("g-01", "g-02", ...) in creation order."""
    rows = await (
        await conn.execute("SELECT id FROM groups WHERE universe_id = %s ORDER BY created_at, id", (universe_id,))
    ).fetchall()
    return {r["id"]: f"g-{i:02d}" for i, r in enumerate(rows, 1)}


@router.get("/universes")
async def list_universes(conn: AsyncConnection = Depends(get_conn)) -> list[dict]:
    rows = await (
        await conn.execute(
            f"""
            SELECT un.*, COUNT(u.id) AS members,
                   COUNT(u.id) FILTER (WHERE {repo.USER_STATUS_SQL} = 'complete') AS onboarded,
                   (SELECT COUNT(*) FROM groups g WHERE g.universe_id = un.id) AS groups
            FROM universes un
            LEFT JOIN users u ON u.universe_id = un.id
            LEFT JOIN agent_profiles ap ON ap.user_id = u.id
            GROUP BY un.id ORDER BY un.created_at DESC
            """
        )
    ).fetchall()
    return [{**universe_out(r), "members": r["members"], "onboarded": r["onboarded"], "groups": r["groups"]} for r in rows]


@router.post("/universes", status_code=201)
async def create_universe(body: UniverseCreate, conn: AsyncConnection = Depends(get_conn)) -> dict:
    if not body.name.strip() or not body.admin_email.strip():
        raise HTTPException(400, "name and admin_email are required")
    row = await (
        await conn.execute(
            "INSERT INTO universes (name, admin_email, invite_code) VALUES (%s, %s, %s) RETURNING *",
            (body.name.strip()[:120], body.admin_email.strip(), secrets.token_urlsafe(6)),
        )
    ).fetchone()
    return universe_out(row)


@router.patch("/universes/{universe_id}")
async def rename_universe(universe_id: UUID, body: UniverseRename, conn: AsyncConnection = Depends(get_conn)) -> dict:
    name = body.name.strip()[:120]
    if not name:
        raise HTTPException(400, "name is required")
    row = await (
        await conn.execute("UPDATE universes SET name = %s WHERE id = %s RETURNING *", (name, universe_id))
    ).fetchone()
    if row is None:
        raise HTTPException(404, "universe not found")
    return universe_out(row)


@router.get("/universes/{universe_id}")
async def universe_detail(universe_id: UUID, conn: AsyncConnection = Depends(get_conn)) -> dict:
    universe = await repo.get_universe(conn, universe_id)
    labels = await group_labels(conn, universe_id)
    members = await (
        await conn.execute(
            f"""
            SELECT u.id, u.full_name, u.phone, u.asi_address IS NOT NULL AS via_asi, u.created_at,
                   {repo.USER_STATUS_SQL} AS status,
                   COALESCE(jsonb_array_length(ap.private -> 'dealbreakers'), 0) AS dealbreakers,
                   gm.group_id,
                   (SELECT COUNT(*) FROM pairs p WHERE u.id IN (p.user_a, p.user_b)) AS chats,
                   (SELECT COUNT(*) FROM pairs p WHERE u.id IN (p.user_a, p.user_b)
                       AND p.vibe_score >= {STRONG_VIBE} AND NOT {CONFLICT}) AS strong_ties
            FROM users u
            LEFT JOIN agent_profiles ap ON ap.user_id = u.id
            LEFT JOIN group_members gm ON gm.user_id = u.id
            WHERE u.universe_id = %s
            ORDER BY u.created_at
            """,
            (universe_id,),
        )
    ).fetchall()
    stats = await (
        await conn.execute(
            f"""
            SELECT
              (SELECT COUNT(*) FROM keywords WHERE universe_id = %(u)s) AS keywords,
              (SELECT COUNT(DISTINCT s.user_id) FROM keyword_scores s JOIN users x ON x.id = s.user_id
                 WHERE x.universe_id = %(u)s) AS scored,
              (SELECT COUNT(*) FROM pairs p WHERE p.universe_id = %(u)s) AS pairs,
              (SELECT COUNT(*) FROM pairs p WHERE p.universe_id = %(u)s AND {CONFLICT}) AS conflicts,
              (SELECT AVG(p.vibe_score) FROM pairs p WHERE p.universe_id = %(u)s) AS avg_vibe,
              (SELECT COUNT(*) FROM events e JOIN groups g ON g.id = e.group_id WHERE g.universe_id = %(u)s) AS events,
              (SELECT COUNT(DISTINCT e.group_id) FROM events e JOIN groups g ON g.id = e.group_id
                 WHERE g.universe_id = %(u)s) AS groups_with_events
            """,
            {"u": universe_id},
        )
    ).fetchone()
    # Matching's keywords, most widely shared first. "high" uses the same > 0.5 line as the hard filter.
    keywords = await (
        await conn.execute(
            """
            SELECT k.name, k.description,
                   COUNT(*) FILTER (WHERE s.score > 0.5) AS high,
                   COUNT(*) FILTER (WHERE s.dealbreaker) AS dealbreakers
            FROM keywords k LEFT JOIN keyword_scores s ON s.keyword_id = k.id
            WHERE k.universe_id = %s
            GROUP BY k.id ORDER BY high DESC, k.name
            """,
            (universe_id,),
        )
    ).fetchall()
    onboarded = sum(m["status"] == "complete" for m in members)
    placed = sum(m["group_id"] is not None for m in members)
    return {
        **universe_out(universe),
        "stats": {
            **stats,
            "members": len(members),
            "onboarded": onboarded,
            "groups": len(labels),
            "placed": placed,
            "unplaced": onboarded - placed if labels else 0,
        },
        "keywords": keywords,
        "members": [
            {
                "id": m["id"],
                "full_name": m["full_name"],
                "contact": m["phone"] or ("ASI:One" if m["via_asi"] else None),
                "joined_at": m["created_at"],
                "status": m["status"],
                "dealbreakers": m["dealbreakers"],
                "group": labels.get(m["group_id"]),
                "chats": m["chats"],
                "strong_ties": m["strong_ties"],
            }
            for m in members
        ],
    }


@router.post("/universes/{universe_id}/matching/abort")
async def abort_matching(universe_id: UUID, conn: AsyncConnection = Depends(get_conn)) -> dict:
    await repo.get_universe(conn, universe_id)  # 404 if missing
    if not await runs.abort(conn, universe_id):
        raise HTTPException(409, "matching isn't running")
    return {"status": "onboarding"}


@router.get("/universes/{universe_id}/scores")
async def universe_scores(universe_id: UUID, conn: AsyncConnection = Depends(get_conn)) -> dict:
    """Matching's keyword vectors for the agent world: per member, a 0-1 score per keyword and the keyword names
    they flagged as dealbreakers. Keyword-level only; the private profile's own dealbreaker text never leaves."""
    await repo.get_universe(conn, universe_id)  # 404 if missing
    keywords = await (
        await conn.execute("SELECT id, name FROM keywords WHERE universe_id = %s ORDER BY id", (universe_id,))
    ).fetchall()
    rows = await (
        await conn.execute(
            """
            SELECT s.user_id, k.name, s.score, s.dealbreaker
            FROM keyword_scores s JOIN keywords k ON k.id = s.keyword_id
            WHERE k.universe_id = %s
            ORDER BY s.user_id, k.id
            """,
            (universe_id,),
        )
    ).fetchall()
    members: dict[UUID, dict] = {}
    for r in rows:
        m = members.setdefault(r["user_id"], {"user_id": r["user_id"], "scores": {}, "dealbreakers": []})
        m["scores"][r["name"]] = r["score"]
        if r["dealbreaker"]:
            m["dealbreakers"].append(r["name"])
    return {"keywords": [k["name"] for k in keywords], "members": list(members.values())}


@router.get("/universes/{universe_id}/groups")
async def universe_groups(universe_id: UUID, conn: AsyncConnection = Depends(get_conn)) -> dict:
    universe = await repo.get_universe(conn, universe_id)
    labels = await group_labels(conn, universe_id)
    groups = []
    for group_id, label in labels.items():
        row = await (await conn.execute("SELECT * FROM groups WHERE id = %s", (group_id,))).fetchone()
        group = await repo.load_group(conn, row)
        # The lowest-scoring judged pair inside the group; unjudged pairs have no edge and can't be weakest.
        weakest = await (
            await conn.execute(
                """
                SELECT ua.full_name AS a, ub.full_name AS b, p.vibe_score
                FROM pairs p
                JOIN group_members ga ON ga.user_id = p.user_a AND ga.group_id = %(g)s
                JOIN group_members gb ON gb.user_id = p.user_b AND gb.group_id = %(g)s
                JOIN users ua ON ua.id = p.user_a JOIN users ub ON ub.id = p.user_b
                ORDER BY p.vibe_score ASC NULLS LAST LIMIT 1
                """,
                {"g": group_id},
            )
        ).fetchone()
        groups.append({**group, "label": label, "weakest_tie": weakest})
    leftovers = await (
        await conn.execute(
            f"""
            SELECT u.id, u.full_name,
                   (SELECT COUNT(*) FROM pairs p WHERE u.id IN (p.user_a, p.user_b)) AS chats,
                   (SELECT COUNT(*) FROM pairs p WHERE u.id IN (p.user_a, p.user_b)
                       AND p.vibe_score >= {STRONG_VIBE} AND NOT {CONFLICT}) AS strong_ties
            FROM users u JOIN agent_profiles ap ON ap.user_id = u.id
            WHERE u.universe_id = %s AND {repo.USER_STATUS_SQL} = 'complete'
              AND NOT EXISTS (SELECT 1 FROM group_members gm WHERE gm.user_id = u.id)
            ORDER BY u.full_name
            """,
            (universe_id,),
        )
    ).fetchall()
    return {**universe_out(universe), "groups": groups, "leftovers": leftovers if labels else []}
