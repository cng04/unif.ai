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


class SocialLinksIn(BaseModel):
    links: dict[str, str]


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


class UniverseSummary(BaseModel):
    id: UUID
    name: str
    status: Literal["onboarding", "matching", "matched"]


class Connection(BaseModel):
    """A judged pair seen from one side: who the other person is and how it went."""

    pair_id: UUID
    user_id: UUID
    full_name: str
    vibe_score: float | None
    logistics_fit: str | None
    conflict: bool
    in_group: bool


class Edge(BaseModel):
    a: UUID
    b: UUID
    vibe_score: float | None


class Connections(BaseModel):
    user: GroupMember
    universe: UniverseSummary
    others: list[UUID]
    connections: list[Connection]
    group: Group | None
    edges: list[Edge]


class UserGraphNode(BaseModel):
    """A person in the 3D view. Only you, your group, and your judged matches are named (pool: name is None)."""

    user_id: UUID
    name: str | None
    kind: Literal["me", "group", "match", "pool"]
    pair_id: UUID | None = None  # your pair with them, if your agents met
    vibe_score: float | None = None
    conflict: bool = False
    x: float
    y: float
    z: float


class UserGraphLink(BaseModel):
    """A judged pair. Scores are only exposed on your own pairs, via the node."""

    a: UUID
    b: UUID
    mine: bool


class UserGraph(BaseModel):
    keywords: list[str]  # names only, for the axis picker
    axes: list[str] | None  # None = PCA of all keyword scores
    nodes: list[UserGraphNode]
    links: list[UserGraphLink]


class PairMessage(BaseModel):
    speaker_id: UUID
    content: str
    created_at: datetime


class PairDetail(BaseModel):
    id: UUID
    other: GroupMember
    vibe_score: float | None
    logistics_fit: str | None
    conflict: bool
    in_group: bool
    shared_keywords: list[str]
    looking_for: str
    messages: list[PairMessage]
