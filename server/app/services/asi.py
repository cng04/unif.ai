"""Message people who onboarded over ASI:One, through the relay agent's /notify endpoint (asi-agent/)."""

import logging

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=15)


async def send_message(address: str, text: str, key: str) -> bool:
    """Send one ASI:One message as our agent. True if the agent sent it; never raises.

    `key` is the idempotency key: the agent sends at most once per key, so re-runs don't double-message.
    """
    settings = get_settings()
    if not settings.asi_notify_url:
        log.info("[asi disabled] to %s: %s", address, text)
        return False
    try:
        async with _client() as client:
            res = await client.post(
                settings.asi_notify_url,
                json={"address": address, "text": text, "key": key, "token": settings.relay_token},
            )
            res.raise_for_status()
            data = res.json()
    except (httpx.HTTPError, ValueError):
        log.exception("asi send to %s failed", address)
        return False
    if not data.get("sent"):
        log.warning("asi send to %s refused: %s", address, data.get("error"))
        return False
    return True
