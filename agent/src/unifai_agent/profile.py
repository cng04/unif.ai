from pydantic import BaseModel, Field


class Logistics(BaseModel):
    area: str | None = None
    budget: str | None = None
    free: list[str] = Field(default_factory=list)


class PublicProfile(BaseModel):
    """Anything the agent may share freely with other agents."""

    name: str
    interests: list[str] = Field(default_factory=list)
    vibe: str = ""
    looking_for: str = ""


class PrivateProfile(BaseModel):
    """Used to evaluate the other person. Never stated directly, only hinted at if asked."""

    dealbreakers: list[str] = Field(default_factory=list)
    values: list[str] = Field(default_factory=list)
    energy: str = ""
    logistics: Logistics = Field(default_factory=Logistics)


class ProfileDraft(BaseModel):
    public: PublicProfile
    private: PrivateProfile = Field(default_factory=PrivateProfile)


class AgentProfile(ProfileDraft):
    user_id: str
    temperature: float = 0.7


class Communication(BaseModel):
    tone: str = ""
    humor: str = ""
    example: str = ""


class SelfReport(BaseModel):
    """Shape of the JSON users paste back after running the onboarding prompt in their own AI."""

    interests: list[str] = Field(default_factory=list)
    thinking_style: str = ""
    communication: Communication = Field(default_factory=Communication)
    social_energy: str = ""
    values: list[str] = Field(default_factory=list)
    frustrations: list[str] = Field(default_factory=list)
    quirks: list[str] = Field(default_factory=list)
    group_role: str = ""
    possible_dealbreakers: list[str] = Field(default_factory=list)
    surprising_traits: list[str] = Field(default_factory=list)
    unknowns: list[str] = Field(default_factory=list)
