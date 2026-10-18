"""JSON for the web app's join page (client/src/app/join). Same rules as the HTML /join/<code> page in web.py."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from psycopg import AsyncConnection
from pydantic import BaseModel

from app.config import get_settings
from app.db import get_conn
from app.routers.web import IMESSAGE_FULL, join_pool, sms_link, universe_for_code
from app.services import photon

router = APIRouter(prefix="/invites", tags=["invites"])


class Invite(BaseModel):
    name: str
    open: bool
    imessage: bool  # only while Photon has free shared-line seats
    asi_command: str  # first message to send the ASI:One agent so it puts them in this pool
    asi_handle: str
    asi_url: str | None


class JoinIn(BaseModel):
    name: str
    phone: str
    consent: bool


class JoinOut(BaseModel):
    status: Literal["joined", "pending", "invalid", "imessage_full"]
    message: str | None = None
    first_name: str | None = None
    phone: str | None = None
    line: str | None = None
    sms: str | None = None


@router.get("/{code}", response_model=Invite)
async def get_invite(code: str, conn: AsyncConnection = Depends(get_conn)):
    universe = await universe_for_code(conn, code)
    settings = get_settings()
    is_open = universe["status"] == "onboarding"
    return Invite(
        name=universe["name"],
        open=is_open,
        imessage=is_open and await photon.imessage_open(),
        asi_command=f"join {universe['invite_code']}",
        asi_handle=settings.asi_agent_handle,
        asi_url=settings.asi_agent_url or None,
    )


@router.post("/{code}/join", response_model=JoinOut)
async def join(code: str, body: JoinIn, conn: AsyncConnection = Depends(get_conn)):
    universe = await universe_for_code(conn, code)
    if universe["status"] != "onboarding":
        raise HTTPException(410, "This group is closed")
    outcome = await join_pool(conn, universe, body.name, body.phone, body.consent)
    if outcome.error:
        return JoinOut(status="invalid", message=outcome.error)
    if outcome.imessage_full:
        return JoinOut(status="imessage_full", message=IMESSAGE_FULL)
    first = outcome.user["full_name"].split()[0]
    if outcome.line is None:
        return JoinOut(status="pending", first_name=first, phone=outcome.phone)
    return JoinOut(status="joined", first_name=first, phone=outcome.phone, line=outcome.line, sms=sms_link(outcome.line))
