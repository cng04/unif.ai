from pydantic import BaseModel, Field


class Logistics(BaseModel):
    """Rough, matching-level logistics. Exact venues, dates and per-event budgets come later, per group."""

    area: str | None = None  # neighborhood / part of town
    travel: str | None = None  # how far they'll go, e.g. "anywhere in SF, ~30 min on Muni"
    budget: str | None = None  # rough tier for hangouts: "$", "$$", "$$$", "free stuff"
    free: list[str] = Field(default_factory=list)  # general windows: "weeknights", "Sun afternoons"


class PublicProfile(BaseModel):
    """Anything the agent may share freely with other agents."""

    name: str
    # In their own words, written/approved during onboarding. Agents may quote it verbatim, marked as theirs.
    intro: str = ""
    interests: list[str] = Field(default_factory=list)
    vibe: str = ""
    looking_for: str = ""
    humor: str = ""
    quirks: list[str] = Field(default_factory=list)
    # connector, planner, easygoing one, storyteller...
    group_role: str = ""


class PrivateProfile(BaseModel):
    """Used to evaluate the other person. Never stated directly, only hinted at if asked."""

    dealbreakers: list[str] = Field(default_factory=list)
    values: list[str] = Field(default_factory=list)
    energy: str = ""
    logistics: Logistics = Field(default_factory=Logistics)
    # Their own answer to "what makes you enjoy someone's company?", used when judging matches.
    enjoyment_definition: str = ""
    frustrations: list[str] = Field(default_factory=list)
    # Traits that don't show up right away; let them come through naturally rather than announcing them.
    surprising_traits: list[str] = Field(default_factory=list)


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
