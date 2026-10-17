from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class UniverseCreate(BaseModel):
    name: str
    admin_email: str


class Universe(BaseModel):
    id: UUID
    name: str
    admin_email: str
    invite_code: str
    status: Literal["onboarding", "matching", "matched"]
    created_at: datetime
    invite_url: str | None = None


class UserCreate(BaseModel):
    full_name: str
    email: str | None = None
    phone: str | None = None
    social_links: dict[str, str] = Field(default_factory=dict)


class User(BaseModel):
    id: UUID
    universe_id: UUID
    full_name: str
    email: str | None
    phone: str | None
    social_links: dict[str, str]
    created_at: datetime


class SelfReportIn(BaseModel):
    text: str


class ChatIn(BaseModel):
    message: str


class ChatOut(BaseModel):
    reply: str


class GraphPoint(BaseModel):
    user_id: UUID
    name: str
    x: float
    y: float
    z: float
    group_id: UUID | None = None


class Pair(BaseModel):
    id: UUID
    user_a: UUID
    user_b: UUID
    vibe_score: float | None
    dealbreaker_flags: list[str]
    logistics_fit: str | None
    judge_rationale: str | None


class GroupMember(BaseModel):
    user_id: UUID
    full_name: str


class EventOut(BaseModel):
    name: str
    url: str | None
    venue: str | None
    starts_at: datetime | None


class Group(BaseModel):
    id: UUID
    group_score: float | None
    rationale: str | None
    members: list[GroupMember]
    events: list[EventOut]
