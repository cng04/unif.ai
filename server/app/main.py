from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.db import pool
from app.routers import matching, onboarding, universes


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


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
