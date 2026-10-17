from functools import lru_cache

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://unifai:unifai@localhost:5432/unifai"
    gemini_api_key: str = ""
    typesafe_api_key: str = ""
    jev_model: str = "jev-latest"
    ticketmaster_api_key: str = ""
    photon_api_key: str = ""
    client_url: str = "http://localhost:3000"

    keyword_count: int = 20
    top_m: int = 5
    max_conversation_turns: int = 12
    max_concurrent_conversations: int = 8
    min_group_size: int = 4
    max_group_size: int = 8
    group_solver_seconds: float = 10.0

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
        if v > 32:
            raise ValueError("max_concurrent_conversations must be at most 32")
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
