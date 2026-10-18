"""Matching runs started by this server process, kept so an admin can abort one.

Runs live in memory. With several server workers, an abort only cancels a run that the same worker started,
though it still resets the universe's status.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from uuid import UUID

from psycopg import AsyncConnection

from app import repo
from app.matching.pipeline import clear_results, run_matching

log = logging.getLogger(__name__)

# Model calls already running in worker threads can't be interrupted; they finish and their results are dropped.
CANCEL_WAIT_SECONDS = 10.0

_running: dict[UUID, asyncio.Task] = {}


def start(universe_id: UUID, run: Callable[[UUID], Awaitable[None]] = run_matching) -> None:
    task = asyncio.create_task(run(universe_id))
    _running[universe_id] = task

    def forget(done: asyncio.Task) -> None:
        if _running.get(universe_id) is done:
            del _running[universe_id]

    task.add_done_callback(forget)


async def cancel(universe_id: UUID) -> bool:
    """Cancel this process's run for the universe and wait for it to unwind. False if none is running here."""
    task = _running.get(universe_id)
    if task is None or task.done():
        return False
    task.cancel()
    await asyncio.wait({task}, timeout=CANCEL_WAIT_SECONDS)
    return True


async def abort(conn: AsyncConnection, universe_id: UUID) -> bool:
    """Stop a run, drop its partial pairs and groups, and reopen onboarding. Also unsticks a universe whose
    run died with an earlier server process. False if the universe wasn't matching."""
    cancelled = await cancel(universe_id)
    if not await repo.release_matching(conn, universe_id):
        return False
    await clear_results(conn, universe_id)
    log.info("Aborted matching for universe %s (%s)", universe_id, "run cancelled" if cancelled else "no live run")
    return True
