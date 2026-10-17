"""Shared HTTP client for OpenRouter's chat completions API."""

import os
import time

import httpx

URL = "https://openrouter.ai/api/v1/chat/completions"
RETRY_STATUS = {408, 429, 500, 502, 503, 504}


def make_client(api_key: str | None, timeout: float) -> httpx.Client:
    key = api_key or os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise ValueError("No OpenRouter API key: pass api_key or set OPENROUTER_API_KEY")
    return httpx.Client(headers={"Authorization": f"Bearer {key}"}, timeout=timeout)


def post_chat(client: httpx.Client, body: dict, attempts: int) -> dict:
    for attempt in range(attempts):
        last = attempt == attempts - 1
        try:
            resp = client.post(URL, json=body)
        except httpx.TransportError:
            if last:
                raise
        else:
            if resp.status_code not in RETRY_STATUS or last:
                data = resp.json() if resp.content else {}
                if resp.is_error or "error" in data:
                    raise RuntimeError(f"OpenRouter {resp.status_code}: {data.get('error') or resp.text[:500]}")
                return data
        time.sleep(min(2 * 2**attempt, 60))
    raise AssertionError("unreachable")
