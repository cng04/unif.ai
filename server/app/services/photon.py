"""Notify matched users over iMessage via Photon. Falls back to logging until the API key is set."""

import logging

from app.config import get_settings
from app.services.ticketmaster import Event

log = logging.getLogger(__name__)


async def send_message(phone: str, text: str) -> None:
    if not get_settings().photon_api_key:
        log.info("[photon disabled] to %s: %s", phone, text)
        return
    # TODO: wire up the Photon SDK/API. Until then log instead of failing the matching run.
    log.warning("[photon not implemented] to %s: %s", phone, text)


async def notify_group(members: list[dict], events: list[Event]) -> None:
    """members: user rows with full_name and phone."""
    event_line = f" First idea: {events[0].name} ({events[0].url})" if events else ""
    for member in members:
        if not member.get("phone"):
            continue
        others = ", ".join(m["full_name"] for m in members if m is not member)
        await send_message(member["phone"], f"You've been matched with {others}!{event_line}")
