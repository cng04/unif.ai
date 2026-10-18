import asyncio
from uuid import uuid4

from app.matching import runs


async def test_cancel_stops_a_running_run_and_forgets_it():
    universe_id = uuid4()
    started, unwound = asyncio.Event(), asyncio.Event()

    async def slow_run(_):
        started.set()
        try:
            await asyncio.sleep(60)
        finally:
            unwound.set()

    runs.start(universe_id, slow_run)
    await started.wait()
    assert await runs.cancel(universe_id)
    assert unwound.is_set()
    await asyncio.sleep(0)  # let the done callback run
    assert universe_id not in runs._running
    assert not await runs.cancel(universe_id)


async def test_cancel_without_a_run_is_a_no_op():
    assert not await runs.cancel(uuid4())
