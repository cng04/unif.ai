import time

import httpx

from unifai_agent import openrouter
from unifai_agent.openrouter import RateLimiter, post_chat


def rate_limited(reset_in: float) -> httpx.Response:
    reset_ms = int((time.time() + reset_in) * 1000)
    return httpx.Response(
        429, json={"error": {"code": 429, "metadata": {"headers": {"X-RateLimit-Reset": str(reset_ms)}}}}
    )


def test_429_waits_until_reset_then_succeeds(monkeypatch):
    sleeps = []
    monkeypatch.setattr(openrouter.time, "sleep", sleeps.append)
    responses = [rate_limited(reset_in=30), httpx.Response(200, json={"ok": True})]
    client = httpx.Client(transport=httpx.MockTransport(lambda _: responses.pop(0)))

    assert post_chat(client, {"model": "m"}, attempts=3) == {"ok": True}
    assert len(sleeps) == 1 and 28 <= sleeps[0] <= 30


def test_rate_limiter_blocks_once_the_minute_is_full(monkeypatch):
    clock = [0.0]
    monkeypatch.setattr(openrouter.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(openrouter.time, "sleep", lambda s: clock.__setitem__(0, clock[0] + s))
    limiter = RateLimiter(rpm=2)

    limiter.wait()
    limiter.wait()
    assert clock[0] == 0.0
    limiter.wait()
    assert clock[0] == 60.0
