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
    time_label: str | None = None
    price: str | None = None
    reason: str | None = None
    source: str


class Group(BaseModel):
    id: UUID
    group_score: float | None
    rationale: str | None
    plans_status: Literal["pending", "ready", "none"]
    plans_summary: str | None
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
    # Onboarding (in iMessage / ASI:One) is finished once the bot saves the private profile.
    onboarded: bool
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
    # True before matching has scored anyone: positions are stable but arbitrary, not similarity.
    placeholder: bool = False


class UserGroupMember(BaseModel):
    user_id: UUID
    full_name: str
    is_me: bool
    pair_id: UUID | None  # your pair with them, if your agents met
    vibe_score: float | None
    shared_keywords: list[str]  # keywords you both score high on
    intro: str  # their public intro, in their own words


class UserGroup(BaseModel):
    """Your group seen from inside it: who's in it, why, and the plans. Nothing from private profiles."""

    group_id: UUID
    group_score: float | None
    agents_met: int
    shared_keywords: list[str]  # every member scores high on these
    members: list[UserGroupMember]
    links: list[Edge]  # judged pairs inside the group
    plans_status: Literal["pending", "ready", "none"]
    plans_summary: str | None
    events: list[EventOut]


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
