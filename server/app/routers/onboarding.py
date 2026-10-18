import asyncio
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends
from psycopg import AsyncConnection
from psycopg.types.json import Jsonb
from unifai_agent import AgentProfile, Interviewer
from unifai_agent.prompts import SELF_REPORT_PROMPT

from app import repo
from app.db import get_conn, pool
from app.deps import get_interviewer
from app.schemas import ChatIn, ChatOut, SelfReportIn, SocialLinksIn, User, UserCreate
from app.services import scraper

router = APIRouter(tags=["onboarding"])


@router.get("/onboarding/prompt")
async def get_self_report_prompt() -> dict[str, str]:
    return {"prompt": SELF_REPORT_PROMPT}


@router.post("/universes/{universe_id}/users", response_model=User)
async def join_universe(
    universe_id: UUID,
    body: UserCreate,
    background: BackgroundTasks,
    conn: AsyncConnection = Depends(get_conn),
):
    await repo.get_universe(conn, universe_id)
    user = await repo.create_user(conn, universe_id, body.full_name, body.email, body.phone, body.social_links)
    if body.social_links:
        background.add_task(scrape_and_store, user["id"], body.full_name, body.social_links)
    return user


async def scrape_and_store(user_id: UUID, full_name: str, links: dict[str, str]) -> None:
    scraped = await scraper.scrape_profiles(full_name, links)
    if scraped:
        async with pool.connection() as conn:
            await repo.merge_scraped(conn, user_id, scraped)


@router.post("/users/{user_id}/social-links")
async def add_social_links(
    user_id: UUID,
    body: SocialLinksIn,
    background: BackgroundTasks,
    conn: AsyncConnection = Depends(get_conn),
) -> dict[str, dict[str, str]]:
    """Links shared later (e.g. over iMessage). Only new or changed links are scraped."""
    user = await repo.get_user(conn, user_id)
    previous = user["social_links"] or {}
    fresh = {p: url for p, url in body.links.items() if previous.get(p) != url}
    links = await repo.add_social_links(conn, user_id, body.links)
    if fresh:
        background.add_task(scrape_and_store, user_id, user["full_name"], fresh)
    return {"social_links": links, "scraping": fresh}


@router.post("/users/{user_id}/self-report")
async def submit_self_report(user_id: UUID, body: SelfReportIn, conn: AsyncConnection = Depends(get_conn)):
    await repo.get_user(conn, user_id)
    await repo.merge_raw_sources(conn, user_id, {"self_report": body.text})
    return {"ok": True}


@router.get("/users/{user_id}/interview")
async def get_interview(user_id: UUID, conn: AsyncConnection = Depends(get_conn)) -> list[dict]:
    cur = await conn.execute(
        "SELECT role, content FROM onboarding_messages WHERE user_id = %s ORDER BY id", (user_id,)
    )
    return await cur.fetchall()


@router.post("/users/{user_id}/interview", response_model=ChatOut)
async def interview_turn(
    user_id: UUID,
    body: ChatIn,
    conn: AsyncConnection = Depends(get_conn),
    interviewer: Interviewer = Depends(get_interviewer),
):
    await repo.get_user(conn, user_id)
    await conn.execute(
        "INSERT INTO onboarding_messages (user_id, role, content) VALUES (%s, 'user', %s)", (user_id, body.message)
    )
    history = await get_interview(user_id, conn)
    reply = await asyncio.to_thread(interviewer.reply, history)
    await conn.execute(
        "INSERT INTO onboarding_messages (user_id, role, content) VALUES (%s, 'assistant', %s)", (user_id, reply)
    )
    return ChatOut(reply=reply)


@router.post("/users/{user_id}/profile", response_model=AgentProfile)
async def build_profile(
    user_id: UUID,
    conn: AsyncConnection = Depends(get_conn),
    interviewer: Interviewer = Depends(get_interviewer),
):
    user = await repo.get_user(conn, user_id)
    row = await (await conn.execute("SELECT raw_sources FROM agent_profiles WHERE user_id = %s", (user_id,))).fetchone()
    sources = row["raw_sources"] if row else {}
    profile = await asyncio.to_thread(
        interviewer.build_profile,
        str(user_id),
        user["full_name"],
        interview=await get_interview(user_id, conn),
        self_report=sources.get("self_report"),
        scraped=sources.get("scraped"),
    )
    await conn.execute(
        "UPDATE agent_profiles SET public = %s, private = %s, updated_at = now() WHERE user_id = %s",
        (Jsonb(profile.public.model_dump()), Jsonb(profile.private.model_dump()), user_id),
    )
    return profile


@router.get("/users/{user_id}/profile", response_model=AgentProfile)
async def get_profile(user_id: UUID, conn: AsyncConnection = Depends(get_conn)):
    user = await repo.get_user(conn, user_id)
    profiles = await repo.load_profiles(conn, user["universe_id"])
    return next(p for p in profiles if p.user_id == str(user_id))
