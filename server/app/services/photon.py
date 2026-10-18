"""Notify matched users over iMessage via Photon. Falls back to logging until the API key is set."""

import logging
import time

import httpx

from app.config import get_settings
from app.services.ticketmaster import Event

log = logging.getLogger(__name__)

API = "https://api.photon.codes"
# Photon answers these when no shared-line seat is left (plan cap, or the shared pool itself is empty).
SEATS_FULL_CODES = {"SHARED_LINE_CAP_EXCEEDED", "SHARED_LINE_POOL_EXHAUSTED"}


class SeatsFull(Exception):
    """No shared-line seat left; send the person to ASI:One instead."""


def configured() -> bool:
    s = get_settings()
    return bool(s.photon_api_key and s.photon_project_id)


_seat_cache: tuple[float, int] | None = None


async def seats_in_use() -> int | None:
    """Active shared-line assignments, cached for 30s. None if Photon isn't configured or the call fails."""
    global _seat_cache
    if not configured():
        return None
    if _seat_cache and time.monotonic() - _seat_cache[0] < 30:
        return _seat_cache[1]
    s = get_settings()
    count, token = 0, None
    try:
        async with httpx.AsyncClient(base_url=API, timeout=15) as client:
            while True:
                res = await client.get(
                    f"/v1/projects/{s.photon_project_id}/platforms/imessage/assignments",
                    headers={"Authorization": f"Bearer {s.photon_api_key}"},
                    params={"pageSize": 100} | ({"pageToken": token} if token else {}),
                )
                res.raise_for_status()
                data = res.json()
                count += len(data.get("assignments", []))
                token = data.get("nextPageToken")
                if not token:
                    break
    except (httpx.HTTPError, ValueError):
        log.exception("photon seat count failed")
        return None
    _seat_cache = (time.monotonic(), count)
    return count


async def imessage_open() -> bool:
    """Whether new people can join over iMessage. Unknown seat counts count as open; assign_line has the final say."""
    if not configured():
        return False
    used = await seats_in_use()
    return used is None or used < get_settings().photon_seat_limit


async def send_message(phone: str, text: str) -> None:
    if not get_settings().photon_api_key:
        log.info("[photon disabled] to %s: %s", phone, text)
        return
    # TODO: wire up the Photon SDK/API. Until then log instead of failing the matching run.
    log.warning("[photon not implemented] to %s: %s", phone, text)


async def assign_line(phone: str, full_name: str) -> str | None:
    """Assign a user to a shared iMessage line and return the number they should text.

    Shared lines only talk to assigned handles, and the user has to text first. Uses the same
    idempotency key as the iMessage bot's `npm run assign` (onboarding/), so repeat calls reuse the seat.
    Returns None when Photon isn't configured or the call fails; raises SeatsFull when no seat is left.
    """
    global _seat_cache
    settings = get_settings()
    if not configured():
        log.info("[photon disabled] would assign %s", phone)
        return None
    first, _, last = full_name.strip().partition(" ")
    body = {"handle": phone, "firstName": first} | ({"lastName": last} if last else {})
    try:
        async with httpx.AsyncClient(base_url=API, timeout=15) as client:
            res = await client.post(
                f"/v1/projects/{settings.photon_project_id}/platforms/imessage/assignments",
                headers={
                    "Authorization": f"Bearer {settings.photon_api_key}",
                    "Idempotency-Key": f"onboarding-assign:{phone}",
                },
                json=body,
            )
            if res.status_code >= 400:
                try:
                    code = res.json().get("code")
                except ValueError:
                    code = None
                if code in SEATS_FULL_CODES:
                    _seat_cache = None
                    raise SeatsFull(code)
            res.raise_for_status()
            _seat_cache = None  # a seat was (possibly) taken
            return res.json()["assignedPhoneNumber"]
    except (httpx.HTTPError, KeyError, ValueError):
        log.exception("photon line assignment failed for %s", phone)
        return None


async def notify_group(members: list[dict], events: list[Event]) -> None:
    """members: user rows with full_name and phone."""
    event_line = f" First idea: {events[0].name} ({events[0].url})" if events else ""
    for member in members:
        if not member.get("phone"):
            continue
        others = ", ".join(m["full_name"] for m in members if m is not member)
        await send_message(member["phone"], f"You've been matched with {others}!{event_line}")
