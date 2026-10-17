"""Shared HTTP client for OpenRouter's chat completions API."""

import logging
import os
import threading
import time
from collections import deque

import httpx

log = logging.getLogger(__name__)

URL = "https://openrouter.ai/api/v1/chat/completions"
RETRY_STATUS = {408, 429, 500, 502, 503, 504}


class RateLimiter:
    """Blocks until a request fits under `rpm` requests per rolling minute. 0 means unlimited."""

    def __init__(self, rpm: int):
        self.rpm = rpm
        self.sent: deque[float] = deque()
        self.lock = threading.Lock()

    def wait(self) -> None:
        if self.rpm <= 0:
            return
        while True:
            with self.lock:
                now = time.monotonic()
                while self.sent and now - self.sent[0] >= 60:
                    self.sent.popleft()
                if len(self.sent) < self.rpm:
                    self.sent.append(now)
                    return
                delay = 60 - (now - self.sent[0])
            time.sleep(delay)


# OpenRouter limits are per model, so every client using the same model shares one limiter.
_limiters: dict[str, RateLimiter] = {}
_limiters_lock = threading.Lock()


def limiter_for(model: str, rpm: int) -> RateLimiter:
    with _limiters_lock:
        if model not in _limiters:
            _limiters[model] = RateLimiter(rpm)
        return _limiters[model]


def make_client(api_key: str | None, timeout: float) -> httpx.Client:
    key = api_key or os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise ValueError("No OpenRouter API key: pass api_key or set OPENROUTER_API_KEY")
    return httpx.Client(headers={"Authorization": f"Bearer {key}"}, timeout=timeout)


def _retry_delay(resp: httpx.Response, attempt: int) -> float:
    """Seconds to wait before retrying: OpenRouter's rate-limit reset if it gave one, else exponential backoff."""
    backoff = min(2 * 2**attempt, 60)
    if resp.status_code != 429:
        return backoff
    try:
        headers = resp.json()["error"]["metadata"]["headers"]
        reset_ms = int(headers["X-RateLimit-Reset"])
    except (ValueError, KeyError, TypeError):
        return backoff
    return min(max(reset_ms / 1000 - time.time(), 1.0), 60.0)


def post_chat(client: httpx.Client, body: dict, attempts: int, limiter: RateLimiter | None = None) -> dict:
    for attempt in range(attempts):
        last = attempt == attempts - 1
        if limiter:
            limiter.wait()
        try:
            resp = client.post(URL, json=body)
        except httpx.TransportError as e:
            if last:
                raise
            delay = min(2 * 2**attempt, 60)
            log.warning("OpenRouter %s: %s, retrying in %.0fs", body.get("model"), type(e).__name__, delay)
        else:
            if resp.status_code not in RETRY_STATUS or last:
                data = resp.json() if resp.content else {}
                if resp.is_error or "error" in data:
                    raise RuntimeError(f"OpenRouter {resp.status_code}: {data.get('error') or resp.text[:500]}")
                return data
            delay = _retry_delay(resp, attempt)
            log.warning("OpenRouter %s: HTTP %d, retrying in %.0fs", body.get("model"), resp.status_code, delay)
        time.sleep(delay)
    raise AssertionError("unreachable")
