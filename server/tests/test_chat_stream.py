import asyncio
import json
from uuid import uuid4

from app.matching import pipeline
from app.routers.chat_stream import event_line


def test_sse_event_has_resume_id_and_compact_json():
    wire = event_line("message", {"pair_id": "p1", "content": "hello\nthere"}, event_id=42)

    assert wire.startswith("id: 42\nevent: message\ndata: ")
    assert wire.endswith("\n\n")
    payload = next(line.removeprefix("data: ") for line in wire.splitlines() if line.startswith("data: "))
    assert json.loads(payload) == {"pair_id": "p1", "content": "hello\nthere"}


async def test_live_message_writer_batches_turns_and_flushes(monkeypatch):
    class Connection:
        def __init__(self):
            self.writes = []
            self.commits = 0

        async def execute(self, sql, params):
            self.writes.append((sql, params))

        async def commit(self):
            self.commits += 1

    class ConnectionContext:
        def __init__(self, conn):
            self.conn = conn

        async def __aenter__(self):
            return self.conn

        async def __aexit__(self, *_):
            return None

    class Pool:
        def __init__(self, conn):
            self.conn = conn

        def connection(self):
            return ConnectionContext(self.conn)

    conn = Connection()
    monkeypatch.setattr(pipeline, "pool", Pool(conn))
    queue = asyncio.Queue()
    pair_id, speaker_a, speaker_b = uuid4(), str(uuid4()), str(uuid4())
    barrier = asyncio.get_running_loop().create_future()
    queue.put_nowait((pair_id, speaker_a, "hello"))
    queue.put_nowait((pair_id, speaker_b, "hey"))
    queue.put_nowait(barrier)
    queue.put_nowait(None)

    await pipeline.write_live_messages(queue)

    assert barrier.done()
    assert conn.commits == 1 and len(conn.writes) == 1
    assert conn.writes[0][1] == ([pair_id, pair_id], [speaker_a, speaker_b], ["hello", "hey"])
