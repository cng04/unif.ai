"""Notify matched users over iMessage via Photon, or ASI:One for people who onboarded there. Logs until keys are set."""

import hashlib
import logging
import time

import httpx

from app.config import get_settings
from app.services import asi
from app.services.event_search import Candidate

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


def same_handle(a: str | None, b: str) -> bool:
    """Phone handles compared by digits, so "+1 (555) 000-1111" and "+15550001111" match."""
    return bool(a) and [c for c in a if c.isdigit()] == [c for c in b if c.isdigit()]


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=API, timeout=15)


async def send_message(phone: str, text: str, key: str) -> bool:
    """Text one person on their unif.ai iMessage line. True if Photon accepted it; never raises.

    Shared lines only reach people who have texted the line first (everyone who onboarded over iMessage has), so this
    sends into their existing direct space as our agent rather than opening a new one. `key` is the idempotency key:
    Photon sends at most once per key, so retries and re-runs don't double-text.
    """
    settings = get_settings()
    if not configured():
        log.info("[photon disabled] to %s: %s", phone, text)
        return False
    auth = {"Authorization": f"Bearer {settings.photon_api_key}"}
    base = f"/v1/projects/{settings.photon_project_id}"
    try:
        async with _client() as client:
            res = await client.get(
                f"{base}/spaces",
                headers=auth,
                params={"participantHandle": phone, "platform": "imessage", "orderBy": "last_message_created_at"},
            )
            res.raise_for_status()
            # Don't trust the filter alone: if it doesn't match, Photon can list other people's spaces, and texting the
            # first one sends this person's message to a stranger. Only use a space whose human is this phone.
            space, sender = None, None
            for sp in res.json().get("items", []):
                if sp.get("kind", "direct") != "direct":
                    continue
                agent, recipient = None, False
                for user_id in sp.get("participantIds", []):
                    user = await client.get(f"{base}/users/{user_id}", headers=auth)
                    user.raise_for_status()
                    data = user.json()
                    if data.get("kind") == "agent":
                        agent = agent or user_id
                    elif same_handle(data.get("handle"), phone):
                        recipient = True
                if agent and recipient:
                    space, sender = sp, agent
                    break
            if space is None:
                log.warning("no iMessage space with our agent for %s (never texted the line?); not sent", phone)
                return False
            res = await client.post(
                f"{base}/messages",
                headers=auth | {"Idempotency-Key": key},
                json={"spaceId": space["id"], "senderId": sender, "content": {"type": "text", "format": "plain", "text": text}},
            )
            if res.status_code >= 400:
                try:
                    code = res.json().get("code")
                except ValueError:
                    code = None
                if code == "IDEMPOTENCY_KEY_REUSED":
                    return True  # already sent under this key
                log.warning("photon send to %s failed: %s %s", phone, res.status_code, code)
                return False
            return True
    except (httpx.HTTPError, KeyError, ValueError):
        log.exception("photon send to %s failed", phone)
        return False


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


async def deliver(member: dict, text: str, key: str) -> bool:
    """Message one member wherever they onboarded: iMessage if we have their phone, else ASI:One."""
    if member.get("phone"):
        return await send_message(member["phone"], text, key)
    if member.get("asi_address"):
        return await asi.send_message(member["asi_address"], text, key)
    return False


def group_link(user_id) -> str:
    return f"{get_settings().client_url.rstrip('/')}/u/{user_id}/group"


def lineup_key(members: list[dict]) -> str:
    """Same people, same key: matching re-runs make new group ids, but an unchanged group shouldn't be re-texted."""
    ids = ",".join(sorted(str(m["user_id"]) for m in members))
    return hashlib.sha256(ids.encode()).hexdigest()[:16]


async def notify_group(group_id, members: list[dict], events: list[Candidate]) -> None:
    """Tell each member they've been matched, by their own first name. members: user rows with user_id, full_name,
    phone and asi_address.

    Keyed by the lineup, not the group id, so re-running matching only texts people whose group changed.
    """
    first = events[0] if events else None
    lineup = lineup_key(members)
    idea = f" First idea: {first.name}." if first else ""
    for member in members:
        name = (member.get("full_name") or "").split(" ")[0]
        hello = f"You've been matched, {name}!" if name else "You've been matched!"
        text = f"{hello}{idea} Meet your group and pick a plan: {group_link(member['user_id'])}"
        await deliver(member, text, f"matched:{lineup}:{member['user_id']}")


async def notify_plan_locked(group_id, event: dict, members: list[dict], going: int) -> None:
    """Tell each member which plan the group locked in. event: an events row; members as in notify_group."""
    where = ", ".join(x for x in (event.get("time_label"), event.get("venue")) if x)
    for member in members:
        text = (
            f"It's on: {event['name']}" + (f", {where}" if where else "") + f". {going} of {len(members)} are in."
            f" Details: {group_link(member['user_id'])}/show-up"
        )
        await deliver(member, text, f"plan-locked:{event['id']}:{member['user_id']}")
