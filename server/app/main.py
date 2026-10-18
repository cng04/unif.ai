import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import pool
from app.routers import admin_api, invites, matching, me, onboarding, universes, web

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s", datefmt="%H:%M:%S")
logging.getLogger("httpx").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await pool.open()
    yield
    await pool.close()


app = FastAPI(title="unif.ai", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[get_settings().client_url],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(universes.router)
app.include_router(onboarding.router)
app.include_router(matching.router)
app.include_router(me.router)
app.include_router(admin_api.router)
app.include_router(invites.router)
app.include_router(web.admin)
app.include_router(web.public)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
