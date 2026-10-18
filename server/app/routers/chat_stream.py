"""Admin-only Server-Sent Events for every agent conversation in one matching run."""

import asyncio
import json
from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from app.db import pool
from app.routers.web import require_admin

router = APIRouter(prefix="/admin/api", dependencies=[Depends(require_admin)], tags=["admin"])

POLL_SECONDS = 0.25
KEEPALIVE_SECONDS = 15.0
PAGE_SIZE = 500


def event_line(event: str, data: dict, event_id: int | None = None) -> str:
    lines = []
    if event_id is not None:
        lines.append(f"id: {event_id}")
    lines.extend((f"event: {event}", f"data: {json.dumps(data, default=str, separators=(',', ':'))}", "", ""))
    return "\n".join(lines)


async def stream_events(request: Request, universe_id: UUID, after: int) -> AsyncIterator[str]:
    cursor = after
    idle = 0.0
    yield "retry: 1000\n\n"

    while not await request.is_disconnected():
        async with pool.connection() as conn:
            universe = await (
                await conn.execute(
                    "SELECT status, matching_stage FROM universes WHERE id = %s",
                    (universe_id,),
                )
            ).fetchone()
            if universe is None:
                yield event_line("error", {"detail": "universe not found"})
                return

            rows = []
            # Waiting until the chat stage avoids replaying the previous run in the tiny window before clear_results.
            if universe["matching_stage"] in ("chats", "groups") or universe["status"] == "matched":
                rows = await (
                    await conn.execute(
                        """
                        SELECT pm.id, pm.pair_id, pm.speaker_id, pm.content, pm.created_at, p.status AS pair_status,
                               p.user_a, p.user_b, speaker.full_name AS speaker_name,
                               person_a.full_name AS person_a_name, person_b.full_name AS person_b_name
                        FROM pair_messages pm
                        JOIN pairs p ON p.id = pm.pair_id
                        JOIN users speaker ON speaker.id = pm.speaker_id
                        JOIN users person_a ON person_a.id = p.user_a
                        JOIN users person_b ON person_b.id = p.user_b
                        WHERE p.universe_id = %s AND pm.kind = 'message' AND pm.id > %s
                        ORDER BY pm.id
                        LIMIT %s
                        """,
                        (universe_id, cursor, PAGE_SIZE),
                    )
                ).fetchall()

        for row in rows:
            cursor = row["id"]
            yield event_line(
                "message",
                {
                    "id": row["id"],
                    "pair_id": row["pair_id"],
                    "pair_status": row["pair_status"],
                    "speaker_id": row["speaker_id"],
                    "speaker_name": row["speaker_name"],
                    "content": row["content"],
                    "created_at": row["created_at"],
                    "a": {"id": row["user_a"], "name": row["person_a_name"]},
                    "b": {"id": row["user_b"], "name": row["person_b_name"]},
                },
                row["id"],
            )

        if len(rows) == PAGE_SIZE:
            continue
        if universe["status"] != "matching":
            yield event_line("done", {"status": universe["status"], "last_event_id": cursor})
            return

        await asyncio.sleep(POLL_SECONDS)
        idle += POLL_SECONDS
        if idle >= KEEPALIVE_SECONDS:
            yield ": keepalive\n\n"
            idle = 0.0


@router.get("/universes/{universe_id}/chats/stream")
async def chat_stream(
    universe_id: UUID,
    request: Request,
    after: int = Query(0, ge=0),
    last_event_id: str | None = Header(None),
) -> StreamingResponse:
    """One resumable stream containing public chat messages from every pair; never emits private notes."""
    if last_event_id:
        try:
            after = max(after, int(last_event_id))
        except ValueError:
            pass
    async with pool.connection() as conn:
        exists = await (await conn.execute("SELECT 1 FROM universes WHERE id = %s", (universe_id,))).fetchone()
    if exists is None:
        raise HTTPException(404, "universe not found")
    return StreamingResponse(
        stream_events(request, universe_id, after),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )
