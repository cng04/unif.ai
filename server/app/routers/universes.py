import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from psycopg import AsyncConnection

from app import repo
from app.config import get_settings
from app.db import get_conn
from app.schemas import Universe, UniverseCreate, User

router = APIRouter(prefix="/universes", tags=["universes"])


def with_invite_url(row: dict) -> Universe:
    return Universe(**row, invite_url=f"{get_settings().client_url}/join/{row['invite_code']}")


@router.post("", response_model=Universe)
async def create_universe(body: UniverseCreate, conn: AsyncConnection = Depends(get_conn)):
    row = await (
        await conn.execute(
            "INSERT INTO universes (name, admin_email, invite_code) VALUES (%s, %s, %s) RETURNING *",
            (body.name, body.admin_email, secrets.token_urlsafe(6)),
        )
    ).fetchone()
    return with_invite_url(row)


@router.get("/by-invite/{invite_code}", response_model=Universe)
async def get_universe_by_invite(invite_code: str, conn: AsyncConnection = Depends(get_conn)):
    row = await (await conn.execute("SELECT * FROM universes WHERE invite_code = %s", (invite_code,))).fetchone()
    if row is None:
        raise HTTPException(404, "invite not found")
    return with_invite_url(row)


@router.get("/{universe_id}", response_model=Universe)
async def get_universe(universe_id: UUID, conn: AsyncConnection = Depends(get_conn)):
    return with_invite_url(await repo.get_universe(conn, universe_id))


@router.get("/{universe_id}/users", response_model=list[User])
async def list_users(universe_id: UUID, conn: AsyncConnection = Depends(get_conn)):
    cur = await conn.execute("SELECT * FROM users WHERE universe_id = %s ORDER BY created_at", (universe_id,))
    return await cur.fetchall()
