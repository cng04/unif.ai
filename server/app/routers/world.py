"""The World snapshot: one compact description of a universe for the agent world (client/src/components/visualizer).

Two views of the same builder:
- admin (`/admin/api/universes/{id}/world`, ADMIN_PASSWORD): everything the organizer may see, including keyword
  scores, keyword-level dealbreakers, every pair's verdict and the judge's rationale.
- participant (`/users/{id}/world`): the same world, with what other people may not see removed: no keyword scores
  or dealbreakers for anyone, no judge flags or rationales (they quote private profiles), and other people's pairs
  and groups reduced to who and when. Other pairs carry no id, so their transcripts can't be fetched by id.

`agent_profiles.private` text, contacts and agents' notes are never read here. Poll with `?since=<version>`; an
unchanged universe answers `{"version": ..., "unchanged": true}`.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from psycopg import AsyncConnection

from app import repo
from app.db import get_conn
from app.routers.admin_api import group_labels
from app.routers.web import require_admin

admin = APIRouter(prefix="/admin/api", dependencies=[Depends(require_admin)], tags=["world"])
public = APIRouter(tags=["world"])

# A keyword counts for someone at the same line the hard filter uses.
HIGH = 0.5
TOP_KEYWORDS = 3
# Someone mid-interview whose last message is this recent is shown busy with their interviewer.
BUSY_SECONDS = 300

VERSION_SQL = """
SELECT md5(concat_ws('|',
    un.status, un.matching_stage, un.matching_stage_at, un.name,
    (SELECT count(*) || ':' || coalesce(max(created_at)::text, '') FROM users WHERE universe_id = un.id),
    (SELECT coalesce(max(om.created_at)::text, '') FROM onboarding_messages om
        JOIN users x ON x.id = om.user_id WHERE x.universe_id = un.id),
    (SELECT coalesce(max(ap.updated_at)::text, '') FROM agent_profiles ap
        JOIN users x ON x.id = ap.user_id WHERE x.universe_id = un.id),
    (SELECT string_agg(name, ',' ORDER BY name) FROM keywords WHERE universe_id = un.id),
    (SELECT count(*) || ':' || count(*) FILTER (WHERE status = 'running') || ':'
        || coalesce(max(completed_at)::text, '') || ':' || coalesce(max(created_at)::text, '')
        FROM pairs WHERE universe_id = un.id),
    (SELECT coalesce(max(pm.id)::text, '') FROM pair_messages pm
        JOIN pairs p ON p.id = pm.pair_id
        WHERE p.universe_id = un.id AND pm.kind = 'message'),
    (SELECT count(*) || ':' || string_agg(plans_status, ',' ORDER BY id) FROM groups WHERE universe_id = un.id),
    (SELECT coalesce(max(e.created_at)::text, '') FROM events e JOIN groups g ON g.id = e.group_id
        WHERE g.universe_id = un.id)
)) AS version
FROM universes un WHERE un.id = %s
"""


def _clip(text: str, limit: int = 72) -> str:
    flat = " ".join(text.split())
    return flat if len(flat) <= limit else flat[: limit - 1].rstrip() + "…"


async def world_version(conn: AsyncConnection, universe_id: UUID) -> str:
    row = await (await conn.execute(VERSION_SQL, (universe_id,))).fetchone()
    if row is None:
        raise HTTPException(404, "universe not found")
    return row["version"]


async def build_world(conn: AsyncConnection, universe_id: UUID, viewer: UUID | None = None) -> dict:
    """The snapshot. `viewer` None is the admin view; otherwise it's that participant's view."""
    universe = await repo.get_universe(conn, universe_id)
    version = await world_version(conn, universe_id)
    full = viewer is None

    members = await (
        await conn.execute(
            f"""
            SELECT u.id, u.full_name, u.created_at, {repo.USER_STATUS_SQL} AS status,
                   ap.public -> 'interests' AS interests, ap.public ->> 'looking_for' AS looking_for,
                   ap.public ->> 'vibe' AS vibe,
                   (SELECT max(om.created_at) > now() - make_interval(secs => %(busy)s)
                      FROM onboarding_messages om WHERE om.user_id = u.id) AS recent_chat
            FROM users u LEFT JOIN agent_profiles ap ON ap.user_id = u.id
            WHERE u.universe_id = %(u)s ORDER BY u.created_at
            """,
            {"u": universe_id, "busy": BUSY_SECONDS},
        )
    ).fetchall()
    if viewer is not None and viewer not in {m["id"] for m in members}:
        raise HTTPException(404, "user not found in this universe")

    keywords = await (
        await conn.execute(
            """
            SELECT k.name, count(*) FILTER (WHERE s.score > %(high)s) AS people,
                   count(*) FILTER (WHERE s.dealbreaker) AS dealbreakers
            FROM keywords k LEFT JOIN keyword_scores s ON s.keyword_id = k.id
            WHERE k.universe_id = %(u)s GROUP BY k.id ORDER BY k.id
            """,
            {"u": universe_id, "high": HIGH},
        )
    ).fetchall()
    scores = await (
        await conn.execute(
            """
            SELECT s.user_id, k.name, s.score, s.dealbreaker FROM keyword_scores s
            JOIN keywords k ON k.id = s.keyword_id WHERE k.universe_id = %s ORDER BY k.id
            """,
            (universe_id,),
        )
    ).fetchall()
    by_member: dict[UUID, list[dict]] = {}
    for s in scores:
        by_member.setdefault(s["user_id"], []).append(s)

    pairs = await (
        await conn.execute(
            """
            SELECT id, user_a, user_b, status, vibe_score, logistics_fit, dealbreaker_flags, judge_rationale,
                   end_reason, created_at, completed_at
            FROM pairs WHERE universe_id = %s ORDER BY created_at
            """,
            (universe_id,),
        )
    ).fetchall()
    # Latest public turn of each chat still running. Notes stay out. Only the admin and the two people in the
    # pair receive it, so other participants see the sprites meet without reading the words.
    latest_lines = {
        row["pair_id"]: {"id": row["id"], "speaker_id": row["speaker_id"], "content": _clip(row["content"])}
        for row in await (
            await conn.execute(
                """
                SELECT DISTINCT ON (pm.pair_id) pm.id, pm.pair_id, pm.speaker_id, pm.content
                FROM pair_messages pm JOIN pairs p ON p.id = pm.pair_id
                WHERE p.universe_id = %s AND p.status = 'running' AND pm.kind = 'message'
                ORDER BY pm.pair_id, pm.id DESC
                """,
                (universe_id,),
            )
        ).fetchall()
    }

    labels = await group_labels(conn, universe_id)
    groups = await (
        await conn.execute(
            "SELECT * FROM groups WHERE universe_id = %s ORDER BY created_at, id", (universe_id,)
        )
    ).fetchall()
    memberships = await (
        await conn.execute(
            """
            SELECT gm.group_id, gm.user_id FROM group_members gm JOIN groups g ON g.id = gm.group_id
            WHERE g.universe_id = %s
            """,
            (universe_id,),
        )
    ).fetchall()
    events = await (
        await conn.execute(
            """
            SELECT e.group_id, e.name, e.url, e.venue, e.starts_at, e.time_label, e.price
            FROM events e JOIN groups g ON g.id = e.group_id
            WHERE g.universe_id = %s ORDER BY e.rank NULLS LAST, e.starts_at
            """,
            (universe_id,),
        )
    ).fetchall()
    group_members: dict[UUID, list[UUID]] = {}
    for m in memberships:
        group_members.setdefault(m["group_id"], []).append(m["user_id"])
    viewer_group = next((g for g, ids in group_members.items() if viewer in ids), None)

    def member_out(m: dict) -> dict:
        rows = by_member.get(m["id"], [])
        top = [r["name"] for r in sorted(rows, key=lambda r: -r["score"]) if r["score"] > HIGH][:TOP_KEYWORDS]
        out = {
            "id": m["id"],
            "name": m["full_name"].split(" ")[0] or m["full_name"],
            "joined_at": m["created_at"],
            "onboarding": m["status"],
            # Mid-interview and talking to the interviewer recently: the World shows them busy.
            "busy": m["status"] == "chatting" and bool(m["recent_chat"]),
            "scored": bool(rows),
            "top_keywords": top,
            "interests": (m["interests"] or [])[:10] if isinstance(m["interests"], list) else [],
            "looking_for": m["looking_for"] or None,
            "vibe": m["vibe"] or None,
        }
        if full:
            out["scores"] = {r["name"]: r["score"] for r in rows}
            out["dealbreakers"] = [r["name"] for r in rows if r["dealbreaker"]]
        return out

    def pair_out(p: dict) -> dict:
        mine = viewer in (p["user_a"], p["user_b"])
        out = {
            "id": p["id"] if full or mine else None,
            "a": p["user_a"],
            "b": p["user_b"],
            "status": p["status"],
            "started_at": p["created_at"],
            "completed_at": p["completed_at"],
        }
        if full or mine:
            out |= {"vibe": p["vibe_score"], "logistics": p["logistics_fit"]}
            line = latest_lines.get(p["id"])
            if line:
                out["line"] = line
        if full:
            out |= {
                "dealbreaker_flags": p["dealbreaker_flags"],
                "rationale": p["judge_rationale"],
                "end_reason": p["end_reason"],
            }
        return out

    def group_out(g: dict) -> dict:
        out = {"id": g["id"], "label": labels.get(g["id"]), "member_ids": group_members.get(g["id"], [])}
        if full or g["id"] == viewer_group:
            out |= {
                "score": g["group_score"],
                "plans_status": g["plans_status"],
                "events": [{k: e[k] for k in ("name", "url", "venue", "starts_at", "time_label", "price")}
                           for e in events if e["group_id"] == g["id"]],
            }
        if full:
            out["rationale"] = g["rationale"]
        return out

    return {
        "version": version,
        "viewer": viewer,
        "universe": {
            "id": universe["id"],
            "name": universe["name"],
            "status": universe["status"],
            "is_demo": universe["is_demo"],
            "stage": universe["matching_stage"],
            "stage_at": universe["matching_stage_at"],
        },
        "keywords": [
            {"name": k["name"], "people": k["people"], **({"dealbreakers": k["dealbreakers"]} if full else {})}
            for k in keywords
        ],
        "members": [member_out(m) for m in members],
        "pairs": [pair_out(p) for p in pairs],
        "groups": [group_out(g) for g in groups],
    }


@admin.get("/universes/{universe_id}/world")
async def admin_world(universe_id: UUID, since: str | None = None, conn: AsyncConnection = Depends(get_conn)) -> dict:
    version = await world_version(conn, universe_id)
    if since == version:
        return {"version": version, "unchanged": True}
    return await build_world(conn, universe_id)


@public.get("/users/{user_id}/world")
async def participant_world(user_id: UUID, since: str | None = None, conn: AsyncConnection = Depends(get_conn)) -> dict:
    # TODO(auth): the id in the link is the only identity today, as for the rest of /users/{id}/...
    user = await (await conn.execute("SELECT universe_id FROM users WHERE id = %s", (user_id,))).fetchone()
    if user is None:
        raise HTTPException(404, "user not found")
    version = await world_version(conn, user["universe_id"])
    if since == version:
        return {"version": version, "unchanged": True}
    return await build_world(conn, user["universe_id"], viewer=user_id)
