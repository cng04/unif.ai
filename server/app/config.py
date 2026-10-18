from functools import lru_cache

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://unifai:unifai@localhost:5432/unifai"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    typesafe_api_key: str = ""
    jev_model: str = "jev-latest"
    openrouter_api_key: str = ""  # when set, both text generation and Jev are billed through OpenRouter
    openrouter_model: str = "google/gemini-2.5-flash-lite"
    # Persona chats only, the bulk of the tokens. Comma-separate several models to rotate pairs across them:
    # OpenRouter rate limits are per model, so each one adds its own requests-per-minute budget.
    openrouter_chat_model: str = "openai/gpt-oss-20b,~deepseek/deepseek-v4-flash-latest,z-ai/glm-5.3-flash"
    # One per chat model (or one value for all): restrained GPT-OSS, balanced DeepSeek, wild GLM.
    openrouter_chat_temperatures: str = "0.50,0.80,1.05"
    openrouter_chat_temperature_jitter: float = 0.08  # sampled once per pair, then held fixed for all turns
    openrouter_chat_max_tokens: int = 512  # 1-3 sentence turns; keeps OpenRouter in-flight credit reservation low
    # Native Jev System One models on OpenRouter. Comma-separate versions to rotate requests across them.
    openrouter_jev_model: str = "~typesafe/jev-latest,typesafe/jev-1.14,typesafe/jev-1.13"
    openrouter_rpm: int = 0  # per-model requests per minute; 0 = unlimited (new OpenRouter accounts get 20)
    ticketmaster_api_key: str = ""
    # Links are always stored; they're only scraped when this is on (costs Browser Use credit). It also turns on
    # the Browser Use event search for group plans; without it, plans come from Ticketmaster only.
    scrape_enabled: bool = False
    browser_use_api_key: str = ""
    # Cheap, fast model and a hard per-link spend cap; login-walled sites are skipped.
    scrape_model: str = "gemini-3-flash"
    scrape_max_cost_usd: float = 0.05
    scrape_timeout_s: float = 180
    scrape_skip_platforms: str = "instagram,tiktok,facebook"
    # Group plans: one Browser Use search per group over the next plans_days_ahead days.
    plans_max_cost_usd: float = 0.30
    plans_timeout_s: float = 300
    plans_days_ahead: int = 14
    plans_candidates: int = 6
    plans_concurrency: int = 4
    photon_api_key: str = ""
    photon_project_id: str = ""
    # Shared-line seats on your Photon plan (Free: 10, Pro: 100). At the limit, joins go to ASI:One.
    photon_seat_limit: int = 10
    # ASI:One onboarding agent: its chat page and @handle, shown on the join page.
    asi_agent_url: str = "https://agentverse.ai/agents/details/agent1q2m667tk62j0fttv52areu03q3slpeqphuapztr0gm5c7dmlj3jhq3k5k4m/profile"
    asi_agent_handle: str = "@unifyai-onboarding"
    admin_password: str = ""
    client_url: str = "http://localhost:3001"
    # Where /join/<code> is served (this server), used to build invite links.
    public_url: str = "http://localhost:8000"
    # Redirect /join/<code> to the web app's join page (CLIENT_URL/join/<code>) instead of rendering HTML here.
    # Needs the client deployed publicly; off by default because the Docker stack doesn't run it.
    join_on_client: bool = False

    keyword_count: int = 20
    top_m: int = 4
    max_conversation_turns: int = 6
    max_concurrent_conversations: int = 50
    min_group_size: int = 4
    max_group_size: int = 8
    group_solver_seconds: float = 10.0

    @field_validator("openrouter_chat_temperature_jitter")
    @classmethod
    def validate_openrouter_chat_temperature_jitter(cls, v: float) -> float:
        if not 0 <= v <= 0.5:
            raise ValueError("openrouter_chat_temperature_jitter must be between 0 and 0.5")
        return v

    @field_validator("keyword_count")
    @classmethod
    def validate_keyword_count(cls, v: int) -> int:
        if v < 5:
            raise ValueError("keyword_count must be at least 5")
        if v > 50:
            raise ValueError("keyword_count must be at most 50")
        return v

    @field_validator("top_m")
    @classmethod
    def validate_top_m(cls, v: int) -> int:
        if v < 1:
            raise ValueError("top_m must be at least 1")
        if v > 20:
            raise ValueError("top_m must be at most 20")
        return v

    @field_validator("max_conversation_turns")
    @classmethod
    def validate_max_conversation_turns(cls, v: int) -> int:
        if v < 4:
            raise ValueError("max_conversation_turns must be at least 4")
        if v > 30:
            raise ValueError("max_conversation_turns must be at most 30")
        return v

    @field_validator("max_concurrent_conversations")
    @classmethod
    def validate_max_concurrent_conversations(cls, v: int) -> int:
        if v < 1:
            raise ValueError("max_concurrent_conversations must be at least 1")
        if v > 256:
            raise ValueError("max_concurrent_conversations must be at most 256")
        return v

    @field_validator("min_group_size")
    @classmethod
    def validate_min_group_size(cls, v: int) -> int:
        if v < 2:
            raise ValueError("min_group_size must be at least 2")
        if v > 10:
            raise ValueError("min_group_size must be at most 10")
        return v

    @field_validator("max_group_size")
    @classmethod
    def validate_max_group_size(cls, v: int) -> int:
        if v < 2:
            raise ValueError("max_group_size must be at least 2")
        if v > 15:
            raise ValueError("max_group_size must be at most 15")
        return v

    @field_validator("group_solver_seconds")
    @classmethod
    def validate_group_solver_seconds(cls, v: float) -> float:
        if v < 1.0:
            raise ValueError("group_solver_seconds must be at least 1.0")
        if v > 300.0:
            raise ValueError("group_solver_seconds must be at most 300.0")
        return v

    @model_validator(mode="after")
    def validate_group_sizes(self) -> "Settings":
        if self.min_group_size > self.max_group_size:
            raise ValueError("min_group_size must be less than or equal to max_group_size")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
