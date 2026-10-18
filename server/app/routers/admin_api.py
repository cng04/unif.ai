"""JSON for the admin screens in the web app (client/src/app/admin). Same ADMIN_PASSWORD gate as the HTML admin.

Everything is derived from what matching stores; there is no separate pipeline-progress or approval state.
"""

import asyncio
import logging
import secrets
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from psycopg import AsyncConnection
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field
from unifai_agent import Interviewer

from app import repo
from app.config import get_settings
from app.db import get_conn, pool
from app.deps import get_interviewer
from app.matching import runs
from app.routers.web import invite_url, require_admin
from app.services import scraper

log = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/api", dependencies=[Depends(require_admin)], tags=["admin"])

CONFLICT = "(jsonb_array_length(p.dealbreaker_flags) > 0 OR p.logistics_fit = 'incompatible')"
STRONG_VIBE = 7


class UniverseCreate(BaseModel):
    name: str
    admin_email: str


class UniverseRename(BaseModel):
    name: str


class ManualPersonIn(BaseModel):
    """Someone the admin interviewed in person (a live demo): typed or dictated notes instead of the SMS flow."""

    full_name: str
    transcript: str
    phone: str | None = None
    email: str | None = None
    social_links: dict[str, str] = Field(default_factory=dict)
    # The person agreed, out loud, that we may read these links. Without it they're stored but never scraped.
    scrape_consent: bool = False


def universe_out(row: dict) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "status": row["status"],
        "invite_code": row["invite_code"],
        "invite_url": invite_url(row["invite_code"]),
        "created_at": row["created_at"],
        "is_demo": row["is_demo"],
    }


async def group_labels(conn: AsyncConnection, universe_id: UUID) -> dict[UUID, str]:
    """Short, stable-per-run names for groups ("g-01", "g-02", ...) in creation order."""
    rows = await (
        await conn.execute("SELECT id FROM groups WHERE universe_id = %s ORDER BY created_at, id", (universe_id,))
    ).fetchall()
    return {r["id"]: f"g-{i:02d}" for i, r in enumerate(rows, 1)}


@router.get("/universes")
async def list_universes(
    mode: Literal["real", "demo", "all"] = "all", conn: AsyncConnection = Depends(get_conn)
) -> list[dict]:
    """Universes, optionally only real ones or only demo/test ones (seeded fixtures, synthetic people)."""
    rows = await (
        await conn.execute(
            f"""
            SELECT un.*, COUNT(u.id) AS members,
                   COUNT(u.id) FILTER (WHERE {repo.USER_STATUS_SQL} = 'complete') AS onboarded,
                   (SELECT COUNT(*) FROM groups g WHERE g.universe_id = un.id) AS groups
            FROM universes un
            LEFT JOIN users u ON u.universe_id = un.id
            LEFT JOIN agent_profiles ap ON ap.user_id = u.id
            WHERE %(mode)s = 'all' OR un.is_demo = (%(mode)s = 'demo')
            GROUP BY un.id ORDER BY un.created_at DESC
            """,
            {"mode": mode},
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


async def build_and_save_profile(conn: AsyncConnection, interviewer: Interviewer, user: dict) -> dict:
    """Profile from the stored transcript and any scraped accounts; returns the public part only."""
    row = await (await conn.execute("SELECT raw_sources FROM agent_profiles WHERE user_id = %s", (user["id"],))).fetchone()
    interview = await (
        await conn.execute(
            "SELECT role, content FROM onboarding_messages WHERE user_id = %s ORDER BY id", (user["id"],)
        )
    ).fetchall()
    profile = await asyncio.to_thread(
        interviewer.build_profile,
        str(user["id"]),
        user["full_name"],
        interview=interview,
        scraped=row["raw_sources"].get("scraped"),
    )
    profile.public.name = user["full_name"]
    await repo.save_profile(conn, profile)
    return profile.public.model_dump()


async def scrape_then_rebuild(user_id: UUID, links: dict[str, str]) -> None:
    async with pool.connection() as conn:
        user = await repo.get_user(conn, user_id)
    scraped = await scraper.scrape_profiles(user["full_name"], links)
    if not scraped:
        return
    async with pool.connection() as conn:
        try:
            user = await repo.get_user(conn, user_id)
        except HTTPException:  # deleted (undo) while the scrape ran
            return
        await repo.merge_scraped(conn, user_id, scraped)
        await build_and_save_profile(conn, get_interviewer(), user)


@router.post("/universes/{universe_id}/people", status_code=201)
async def add_person(
    universe_id: UUID,
    body: ManualPersonIn,
    background: BackgroundTasks,
    conn: AsyncConnection = Depends(get_conn),
    interviewer: Interviewer = Depends(get_interviewer),
) -> dict:
    """Admin-only insert: the transcript becomes the person's interview and the usual profile builder parses it.
    Nobody is messaged. Returns the public profile only, since this screen may be shown to an audience."""
    universe = await repo.get_universe(conn, universe_id)
    if universe["status"] == "matching":
        raise HTTPException(409, "matching is running; add people after it finishes")
    name, transcript = body.full_name.strip()[:120], body.transcript.strip()
    if not name or not transcript:
        raise HTTPException(400, "full_name and transcript are required")
    links = {p: url.strip() for p, url in body.social_links.items() if url and url.strip()}
    user = await repo.create_user(
        conn, universe_id, name, (body.email or "").strip() or None, (body.phone or "").strip() or None, links
    )
    await conn.execute(
        "INSERT INTO onboarding_messages (user_id, role, content) VALUES (%s, 'user', %s)", (user["id"], transcript)
    )
    await repo.merge_raw_sources(conn, user["id"], {"source": "admin_manual"})
    public = await build_and_save_profile(conn, interviewer, user)
    # Onboarded means a non-empty private profile; a short chat may yield nothing private, so mark it explicitly.
    await conn.execute(
        "UPDATE agent_profiles SET private = private || %s WHERE user_id = %s AND private = '{}'::jsonb",
        (Jsonb({"dealbreakers": []}), user["id"]),
    )
    await conn.commit()
    log.info("admin added %s to universe %s (%d chars of notes)", user["id"], universe_id, len(transcript))
    skip = {p.strip().lower() for p in get_settings().scrape_skip_platforms.split(",")}
    scraping = sorted(p for p in links if p.lower() not in skip) if body.scrape_consent else []
    if scraping:
        background.add_task(scrape_then_rebuild, user["id"], links)
    return {"user_id": user["id"], "public": public, "scraping": scraping}


@router.get("/users/{user_id}/public")
async def person_public(user_id: UUID, conn: AsyncConnection = Depends(get_conn)) -> dict:
    """Public profile plus which links have been scraped so far, for the add-person screen to poll."""
    await repo.get_user(conn, user_id)
    row = await (
        await conn.execute("SELECT public, raw_sources FROM agent_profiles WHERE user_id = %s", (user_id,))
    ).fetchone()
    return {"public": row["public"], "scraped": sorted((row["raw_sources"].get("scraped") or {}).keys())}


@router.delete("/users/{user_id}")
async def delete_person(user_id: UUID, conn: AsyncConnection = Depends(get_conn)) -> dict:
    user = await repo.get_user(conn, user_id)
    universe = await repo.get_universe(conn, user["universe_id"])
    if universe["status"] == "matching":
        raise HTTPException(409, "matching is running")
    await conn.execute("DELETE FROM users WHERE id = %s", (user_id,))
    return {"deleted": str(user_id)}


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
                   (SELECT COUNT(*) FROM pairs p WHERE u.id IN (p.user_a, p.user_b) AND p.status = 'complete') AS chats,
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
              (SELECT COUNT(*) FROM pairs p WHERE p.universe_id = %(u)s AND p.status = 'complete') AS pairs,
              (SELECT COUNT(*) FROM pairs p WHERE p.universe_id = %(u)s AND p.status = 'running') AS running,
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
                WHERE p.status = 'complete'
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
                   (SELECT COUNT(*) FROM pairs p WHERE u.id IN (p.user_a, p.user_b) AND p.status = 'complete') AS chats,
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
