"""Pick a sprite look for a person from what they wrote about themselves, once, after their profile is built."""

import asyncio
import logging
from uuid import UUID

from psycopg import AsyncConnection
from unifai_agent import Interviewer
from unifai_agent.appearance import choose_look

from app import repo

log = logging.getLogger(__name__)


async def pick_look(conn: AsyncConnection, interviewer: Interviewer, user_id: UUID, intro: str = "") -> None:
    """Best effort: any failure leaves the sprite on its defaults. Never overwrites an existing look (the agent's
    earlier pick or the person's own), so a profile rebuild can't undo an edit."""
    try:
        row = await (
            await conn.execute("SELECT public -> 'look' AS look, raw_sources FROM agent_profiles WHERE user_id = %s", (user_id,))
        ).fetchone()
        if row is None or row["look"] is not None:
            return
        said = await (
            await conn.execute(
                "SELECT content FROM onboarding_messages WHERE user_id = %s AND role = 'user' ORDER BY id", (user_id,)
            )
        ).fetchall()
        statements = "\n".join([intro, (row["raw_sources"] or {}).get("self_report") or "", *(m["content"] for m in said)])
        look = await asyncio.to_thread(choose_look, interviewer.llm, statements)
        if any(v is not None for k, v in look.model_dump().items() if k != "source"):
            await repo.save_look(conn, user_id, look.model_dump())
    except Exception:
        log.warning("choosing a look failed for %s", user_id, exc_info=True)
