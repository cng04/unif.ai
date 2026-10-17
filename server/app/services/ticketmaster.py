from datetime import datetime

import httpx
from pydantic import BaseModel

from app.config import get_settings

DISCOVERY_URL = "https://app.ticketmaster.com/discovery/v2/events.json"


class Event(BaseModel):
    external_id: str
    name: str
    url: str | None = None
    venue: str | None = None
    starts_at: datetime | None = None


async def find_events(keywords: list[str], city: str | None = None, per_keyword: int = 2) -> list[Event]:
    api_key = get_settings().ticketmaster_api_key
    if not api_key:
        return []

    events: dict[str, Event] = {}
    async with httpx.AsyncClient(timeout=10) as client:
        for keyword in keywords:
            params = {"apikey": api_key, "keyword": keyword, "size": per_keyword, "sort": "date,asc"}
            if city:
                params["city"] = city
            resp = await client.get(DISCOVERY_URL, params=params)
            if resp.status_code != 200:
                continue
            for e in resp.json().get("_embedded", {}).get("events", []):
                venues = e.get("_embedded", {}).get("venues", [])
                events[e["id"]] = Event(
                    external_id=e["id"],
                    name=e["name"],
                    url=e.get("url"),
                    venue=venues[0].get("name") if venues else None,
                    starts_at=e.get("dates", {}).get("start", {}).get("dateTime"),
                )
    return list(events.values())
